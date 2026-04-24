#!/usr/bin/env node
// reddit-fetch.js
// Fetches new posts + comments from target subreddits via Reddit OAuth (script app)
// Writes to reddit_posts and reddit_comments tables (upsert on id)
// Generates embeddings inline after upsert
// Tracks last ingestion via reddit_ingestion_state table for incremental pulls
// Supports EnsembleData mode via ENSEMBLEDATA_REDDIT=true env var

const { Pool } = require('pg');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const USE_ENSEMBLEDATA = process.env.ENSEMBLEDATA_REDDIT === 'true';
const ED_TOKEN = process.env.ENSEMBLEDATA_TOKEN || 'mYhi8PoTRudPx31j';
const budgetTracker = USE_ENSEMBLEDATA ? require('../ensembledata/budget-tracker.js') : null;

// --- EnsembleData Reddit fetch functions ---

async function edFetch(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function edFetchSubredditPosts(subreddit) {
  const url = `https://ensembledata.com/apis/reddit/subreddit/posts?name=${encodeURIComponent(subreddit)}&sort=hot&period=day&limit=30&token=${ED_TOKEN}`;
  const data = await edFetch(url);
  const posts = [];
  // ED response shape: { data: { posts: [ { kind: 't3', data: {...} } ] } }
  const rawPosts = (data && data.data && data.data.posts) ? data.data.posts : [];
  if (rawPosts.length) {
    for (const item of rawPosts) {
      const p = item.data || item;  // unwrap { kind, data } envelope if present
      posts.push({
        id: p.id || p.name || `ed_${subreddit}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        subreddit,
        title: p.title || '',
        body: p.selftext || p.body || '',
        author: p.author || '[unknown]',
        score: p.score || 0,
        upvote_ratio: p.upvote_ratio || null,
        num_comments: p.num_comments || 0,
        created_utc: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : new Date().toISOString(),
        url: p.url || '',
        permalink: p.permalink || `https://reddit.com/r/${subreddit}/comments/${p.id}/`,
        flair: p.link_flair_text || null,
        is_self: p.is_self !== false,
        over_18: p.over_18 || false,
      });
    }
  }
  return posts;
}

async function edSearchKeywordPosts(keyword) {
  const url = `https://ensembledata.com/apis/reddit/search/keyword?keyword=${encodeURIComponent(keyword)}&limit=15&token=${ED_TOKEN}`;
  const data = await edFetch(url);
  const posts = [];
  if (data && data.data && Array.isArray(data.data)) {
    for (const p of data.data) {
      const sub = p.subreddit || 'unknown';
      posts.push({
        id: p.id || `ed_kw_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        subreddit: sub,
        title: p.title || '',
        body: p.selftext || p.body || '',
        author: p.author || '[unknown]',
        score: p.score || 0,
        upvote_ratio: p.upvote_ratio || null,
        num_comments: p.num_comments || 0,
        created_utc: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : new Date().toISOString(),
        url: p.url || '',
        permalink: p.permalink || '',
        flair: p.link_flair_text || null,
        is_self: p.is_self !== false,
        over_18: p.over_18 || false,
      });
    }
  }
  return posts;
}

const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434');
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const MAX_COMMENTS_PER_POST = parseInt(process.env.MAX_COMMENTS_PER_POST || '25');

const pool = new Pool({ connectionString: DB_URL });

const CONFIG_PATH = process.env.REDDIT_CONFIG ||
  path.join(__dirname, '../../config/reddit-research.yaml');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// --- Ingestion state management ---

async function ensureStateTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS reddit_ingestion_state (
      key TEXT PRIMARY KEY,
      last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      posts_fetched INTEGER DEFAULT 0,
      comments_fetched INTEGER DEFAULT 0
    )
  `);
}

async function getLastRunAt(client) {
  const { rows } = await client.query(
    "SELECT last_run_at FROM reddit_ingestion_state WHERE key = 'latest'"
  );
  if (rows.length === 0) {
    // First run: default to last 24 hours
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  return rows[0].last_run_at;
}

async function updateLastRunAt(client, postsFetched, commentsFetched) {
  await client.query(`
    INSERT INTO reddit_ingestion_state (key, last_run_at, posts_fetched, comments_fetched)
    VALUES ('latest', NOW(), $1, $2)
    ON CONFLICT (key) DO UPDATE SET
      last_run_at = NOW(),
      posts_fetched = reddit_ingestion_state.posts_fetched + EXCLUDED.posts_fetched,
      comments_fetched = reddit_ingestion_state.comments_fetched + EXCLUDED.comments_fetched
  `, [postsFetched, commentsFetched]);
}

// --- Reddit OAuth ---

async function getAccessToken(cfg) {
  const { client_id, client_secret, username, password } = cfg.reddit.oauth;
  const auth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const data = 'grant_type=password' +
      `&username=${encodeURIComponent(username)}` +
      `&password=${encodeURIComponent(password)}`;

    const options = {
      hostname: 'www.reddit.com',
      path: '/api/v1/access_token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': cfg.reddit.user_agent || 'aloomii-research/1.0',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`No access_token in response: ${body}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}, body: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function redditFetch(url, token, userAgent, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': userAgent,
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 429) {
          const retryAfter = parseInt(res.headers['retry-after'] || '60', 10) * 1000;
          console.warn(`Rate limited. Retrying after ${retryAfter / 1000}s (attempt ${attempt + 1})`);
          setTimeout(() => resolve(null), retryAfter);
          return;
        }
        if (res.statusCode === 401) {
          reject(new Error('Unauthorized: token may be expired'));
          return;
        }

        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (result) return result;
  }
  return null;
}

// --- Fetch functions ---

async function fetchSubredditPosts(subreddit, token, userAgent, sinceDate, after = null) {
  const posts = [];
  for (const sort of ['hot', 'new']) {
    let url = `https://oauth.reddit.com/r/${subreddit}/${sort}?limit=100`;
    if (after) url += `&after=${after}`;

    const data = await redditFetch(url, token, userAgent);
    if (!data || !data.data || !data.data.children) {
      console.warn(`No data returned for r/${subreddit}/${sort}`);
      continue;
    }

    for (const child of data.data.children) {
      if (child.kind !== 't3') continue;
      const p = child.data;
      const postDate = new Date(p.created_utc * 1000);

      // Incremental filter: skip posts older than last run
      if (sinceDate && postDate < sinceDate) {
        continue;
      }

      posts.push({
        id: p.id,
        subreddit: p.subreddit,
        title: p.title,
        body: p.selftext || '',
        author: p.author || '[deleted]',
        score: p.score || 0,
        upvote_ratio: p.upvote_ratio || null,
        num_comments: p.num_comments || 0,
        created_utc: postDate.toISOString(),
        url: p.url || '',
        permalink: p.permalink || '',
        flair: p.link_flair_text || null,
        is_self: p.is_self !== false,
        over_18: p.over_18 || false,
        raw_json: child,
      });
    }
  }
  return posts;
}

async function fetchPostComments(postId, subreddit, token, userAgent) {
  const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}?limit=100&depth=3`;
  const data = await redditFetch(url, token, userAgent);
  if (!data || !Array.isArray(data) || data.length < 2) return [];

  const comments = [];

  function extractComments(children, depth = 0) {
    if (depth > 3) return;
    for (const child of children) {
      if (child.kind !== 't1') continue;
      const c = child.data;
      if (c.author === '[deleted]' && c.body === '[deleted]') continue;

      comments.push({
        id: c.id,
        post_id: postId,
        parent_id: c.parent_id || null,
        body: c.body || '',
        author: c.author || '[deleted]',
        score: c.score || 0,
        created_utc: new Date(c.created_utc * 1000).toISOString(),
        permalink: c.permalink || '',
        depth: depth,
        is_submitter: c.is_submitter || false,
        raw_json: child,
      });

      if (c.replies && c.replies.data && c.replies.data.children) {
        extractComments(c.replies.data.children, depth + 1);
      }
    }
  }

  extractComments(data[1].data.children);

  // Return top N comments only
  return comments.slice(0, MAX_COMMENTS_PER_POST);
}

// --- DB upsert ---

async function upsertPosts(posts) {
  if (posts.length === 0) return 0;
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const p of posts) {
      const res = await client.query(`
        INSERT INTO reddit_posts (id, subreddit, title, body, author, score, upvote_ratio, num_comments, created_utc, url, permalink, flair, is_self, over_18, raw_json, pulled_at, last_refreshed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          score = EXCLUDED.score,
          upvote_ratio = EXCLUDED.upvote_ratio,
          num_comments = EXCLUDED.num_comments,
          body = EXCLUDED.body,
          flair = EXCLUDED.flair,
          last_refreshed = NOW()
      `, [p.id, p.subreddit, p.title, p.body, p.author, p.score, p.upvote_ratio,
          p.num_comments, p.created_utc, p.url, p.permalink, p.flair, p.is_self,
          p.over_18, JSON.stringify({id: p.id, subreddit: p.subreddit, title: p.title, score: p.score})]);
      if (res.rowCount > 0) inserted++;
    }
    return inserted;
  } finally {
    client.release();
  }
}

async function upsertComments(comments) {
  if (comments.length === 0) return 0;
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const c of comments) {
      const res = await client.query(`
        INSERT INTO reddit_comments (id, post_id, parent_id, body, author, score, created_utc, permalink, depth, is_submitter, raw_json, pulled_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          score = EXCLUDED.score,
          pulled_at = NOW()
      `, [c.id, c.post_id, c.parent_id, c.body, c.author, c.score, c.created_utc,
          c.permalink, c.depth, c.is_submitter, JSON.stringify({id: c.id, post_id: c.post_id, body: c.body.substring(0,100)})]);
      if (res.rowCount > 0) inserted++;
    }
    return inserted;
  } finally {
    client.release();
  }
}

// --- Embedding generation (merged from ingest-embeddings) ---

async function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: EMBED_MODEL, prompt: text });
    const options = {
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/embeddings',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.embedding) {
            resolve(parsed.embedding);
          } else {
            reject(new Error(`No embedding in response: ${body.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function toVectorString(embedding) {
  if (!embedding) return null;
  return `[${embedding.join(',')}]`;
}

async function embedUpsertedContent(postIds, commentIds) {
  if (postIds.length === 0 && commentIds.length === 0) return;

  const client = await pool.connect();
  try {
    // Embed posts
    if (postIds.length > 0) {
      const { rows: posts } = await client.query(
        `SELECT id, title, body FROM reddit_posts WHERE id = ANY($1) AND embedding IS NULL`,
        [postIds]
      );
      console.log(`Embedding ${posts.length} new posts (chunked)...`);

      const EMBED_CHUNK = 30;
      for (let i = 0; i < posts.length; i += EMBED_CHUNK) {
        const chunk = posts.slice(i, i + EMBED_CHUNK);
        console.log(`  Embedding batch ${Math.floor(i / EMBED_CHUNK) + 1}/${Math.ceil(posts.length / EMBED_CHUNK)} (${chunk.length} posts)...`);
        for (const p of chunk) {
          try {
            const text = `${p.title} ${p.body || ''}`.trim().substring(0, 2000);
            const emb = await getEmbedding(text);
            const vec = toVectorString(emb);
            if (vec) {
              await client.query(
                'UPDATE reddit_posts SET embedding = $1::vector WHERE id = $2',
                [vec, p.id]
              );
            }
          } catch (e) {
            console.warn(`Failed to embed post ${p.id}: ${e.message}`);
          }
          await new Promise(r => setTimeout(r, 100));
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Embed comments
    if (commentIds.length > 0) {
      const { rows: comments } = await client.query(
        `SELECT id, body FROM reddit_comments WHERE id = ANY($1) AND embedding IS NULL`,
        [commentIds]
      );
      console.log(`Embedding ${comments.length} new comments...`);

      for (const c of comments) {
        try {
          const text = (c.body || '').substring(0, 2000);
          if (!text.trim()) continue;
          const emb = await getEmbedding(text);
          const vec = toVectorString(emb);
          if (vec) {
            await client.query(
              'UPDATE reddit_comments SET embedding = $1::vector WHERE id = $2',
              [vec, c.id]
            );
          }
        } catch (e) {
          console.warn(`Failed to embed comment ${c.id}: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 100)); // Rate limit
      }
    }
  } finally {
    client.release();
  }
}

// --- Lockfile for cron overlap guard ---
const LOCKFILE = '/tmp/reddit-fetch.lock';

function acquireLock() {
  const pid = process.pid.toString();
  try {
    if (fs.existsSync(LOCKFILE)) {
      const lockPid = fs.readFileSync(LOCKFILE, 'utf8').trim();
      try {
        process.kill(parseInt(lockPid), 0);
        // Process is still alive — respect the lock
        return false;
      } catch (e) {
        // Stale lock — process is dead
        fs.unlinkSync(LOCKFILE);
      }
    }
    fs.writeFileSync(LOCKFILE, pid);
    process.on('exit', () => { try { fs.unlinkSync(LOCKFILE); } catch (e) {} });
    return true;
  } catch (e) {
    return false;
  }
}

// Parse CLI args
let CHUNK_ARG = process.argv.includes('--chunk')
  ? parseInt(process.argv[process.argv.indexOf('--chunk') + 1]) || 0
  : null;
const CHUNK_SIZE = 30;

// Auto-chunk: if no --chunk specified, rotate by hour so each run covers a slice
function autoChunkIndex(uniqueSubs) {
  const totalChunks = Math.ceil(uniqueSubs.length / CHUNK_SIZE);
  const hour = new Date().getHours();
  return hour % totalChunks;
}

// --- Main ---

async function main() {
  if (!acquireLock()) {
    console.log('Lockfile active, another instance running. Exiting.');
    process.exit(0);
  }

  // Hard timeout: exit after 50 minutes (cron fires at 60 min intervals)
  let exiting = false;
  const exitNow = (code = 0) => {
    if (exiting) return;
    exiting = true;
    console.log('Exiting...');
    try { fs.unlinkSync(LOCKFILE); } catch (e) {}
    process.exit(code);
  };
  setTimeout(() => { console.log('Hard timeout reached (50m). Exiting.'); exitNow(0); }, 50 * 60 * 1000).unref();
  ['SIGINT','SIGTERM','SIGUSR2'].forEach(sig => process.on(sig, () => exitNow(0)));

  const config = loadConfig();

  const client = await pool.connect();
  try {
    await ensureStateTable(client);

    // --- EnsembleData mode ---
    if (USE_ENSEMBLEDATA) {
      console.log('Running in EnsembleData mode...');
      const lastRunAt = await getLastRunAt(client);

      // Collect subreddits from ICP definitions
      const icpRes = await pool.query('SELECT slug, brand, label, target_subs FROM icp_definitions WHERE active = TRUE');
      const allSubredditsList = [];
      for (const icp of icpRes.rows) {
        const subs = typeof icp.target_subs === 'string' ? JSON.parse(icp.target_subs) : icp.target_subs;
        for (const s of subs) allSubredditsList.push(s.replace(/^r\//, ''));
      }
      const uniqueSubs = [...new Set(allSubredditsList)];
      
      // Chunked execution: only process this chunk's share of subreddits
      let subsToProcess = uniqueSubs;
      const totalChunks = Math.ceil(uniqueSubs.length / CHUNK_SIZE);
      if (CHUNK_ARG === null) {
        CHUNK_ARG = autoChunkIndex(uniqueSubs);
      }
      if (CHUNK_ARG !== null) {
        const start = CHUNK_ARG * CHUNK_SIZE;
        const end = start + CHUNK_SIZE;
        subsToProcess = uniqueSubs.slice(start, end);
        console.log(`[CHUNK ${CHUNK_ARG + 1}/${totalChunks}] Processing subreddits ${start + 1}-${Math.min(end, uniqueSubs.length)} of ${uniqueSubs.length}`);
      }

      // Also load keyword searches from config
      const keywordSearches = config.reddit?.keyword_searches || [];

      // Budget check: 2 units per subreddit + 1 unit per keyword
      const unitsNeeded = subsToProcess.length * 2 + keywordSearches.length * 1;
      const budgetCheck = await budgetTracker.checkBudget('reddit', unitsNeeded);
      if (!budgetCheck.allowed) {
        console.error(`Budget exhausted: ${budgetCheck.remaining} units remaining. Need ${unitsNeeded}.`);
        process.exit(1);
      }

      let totalPosts = 0;

      // Fetch subreddit posts
      for (const sub of subsToProcess) {
        try {
          console.log(`[ED] Fetching r/${sub}...`);
          const posts = await edFetchSubredditPosts(sub);
          const postCount = await upsertPosts(posts);
          totalPosts += postCount;
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error(`[ED] Error fetching r/${sub}: ${e.message}`);
        }
      }

      // Fetch keyword search posts
      for (const kw of keywordSearches) {
        try {
          console.log(`[ED] Searching keyword: ${kw}`);
          const posts = await edSearchKeywordPosts(kw);
          const postCount = await upsertPosts(posts);
          totalPosts += postCount;
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error(`[ED] Error searching '${kw}': ${e.message}`);
        }
      }

      // Record usage based on subreddits actually processed in this chunk
      const actualUnits = subsToProcess.length * 2 + keywordSearches.length * 1;
      await budgetTracker.recordUsage('reddit', actualUnits);
      console.log(`[ED] Chunk ${CHUNK_ARG !== null ? CHUNK_ARG : 0}: Used ${actualUnits} budget units. Upserted ${totalPosts} posts.`);

      // NOTE: Embeddings handled by embed-sync cron (1am daily) to avoid OOM during fetch.
      // if (allPostIds.length > 0) {
      //   console.log('Generating embeddings for new content...');
      //   try {
      //     await embedUpsertedContent(allPostIds, []);
      //     console.log('Embedding generation complete.');
      //   } catch (e) {
      //     console.warn(`Embedding generation failed: ${e.message}`);
      //   }
      // }

      await updateLastRunAt(client, totalPosts, 0);
      console.log(`Ingestion state updated. Next run will pull content after ${new Date().toISOString()}.`);
      process.exit(0);
    }

    // --- Original OAuth mode ---
    const { reddit } = config;
    const lastRunAt = await getLastRunAt(client);
    console.log(`Incremental pull: fetching content since ${lastRunAt.toISOString()}`);

    // Auto-detect placeholder OAuth credentials and fall back to EnsembleData
    if ((!reddit?.oauth?.client_id || reddit.oauth.client_id === 'REPLACE_ME') && !USE_ENSEMBLEDATA) {
      console.warn('[WARN] OAuth credentials not configured (REPLACE_ME). Re-run with ENSEMBLEDATA_REDDIT=true to use EnsembleData fallback.');
      console.warn('[WARN] To fix permanently: configure real Reddit OAuth credentials in config/reddit-research.yaml');
      process.exit(1);
    }

    console.log('Authenticating with Reddit...');
    const token = await getAccessToken(config);
    console.log('Got access token.');

    // Collect unique subreddits across all ICPs
    const icpRes = await pool.query('SELECT slug, brand, label, target_subs FROM icp_definitions WHERE active = TRUE');
    const allSubreddits = new Set();
    for (const icp of icpRes.rows) {
      const subs = typeof icp.target_subs === 'string' ? JSON.parse(icp.target_subs) : icp.target_subs;
      for (const s of subs) allSubreddits.add(s.replace(/^r\//, ''));
    }

    console.log(`Fetching from ${allSubreddits.size} subreddits: ${[...allSubreddits].join(', ')}`);

    let totalPosts = 0;
    let totalComments = 0;
    const allPostIds = [];
    const allCommentIds = [];

    for (const sub of allSubreddits) {
      try {
        console.log(`Fetching r/${sub}...`);
        const posts = await fetchSubredditPosts(sub, token, reddit.user_agent || 'aloomii-research/1.0', lastRunAt);
        const postCount = await upsertPosts(posts);
        totalPosts += postCount;

        for (const p of posts) allPostIds.push(p.id);

        // Fetch top comments for each new post
        const topPosts = posts.slice(0, 25);
        for (const post of topPosts) {
          try {
            const comments = await fetchPostComments(post.id, sub, token, reddit.user_agent || 'aloomii-research/1.0');
            const commentCount = await upsertComments(comments);
            totalComments += commentCount;

            for (const c of comments) allCommentIds.push(c.id);

            await new Promise(r => setTimeout(r, 500));
          } catch (e) {
            console.warn(`Error fetching comments for ${post.id}: ${e.message}`);
          }
        }

        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`Error fetching r/${sub}: ${e.message}`);
      }
    }

    console.log(`Upserted ${totalPosts} post updates, ${totalComments} comment updates.`);

    // NOTE: Embeddings handled by embed-sync cron (1am daily) to avoid OOM during fetch.
    // if (allPostIds.length > 0 || allCommentIds.length > 0) {
    //   console.log('Generating embeddings for new content...');
    //   try {
    //     await embedUpsertedContent(allPostIds, allCommentIds);
    //     console.log('Embedding generation complete.');
    //   } catch (e) {
    //     console.warn(`Embedding generation failed (will be retried by backfill script): ${e.message}`);
    //   }
    // }

    // Update ingestion state
    await updateLastRunAt(client, totalPosts, totalComments);
    console.log(`Ingestion state updated. Next run will pull content after ${new Date().toISOString()}.`);
  } finally {
    client.release();
    // Don't await pool.end() — it hangs. Fire-and-forget or let OS clean up.
    pool.end().catch(() => {});
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});