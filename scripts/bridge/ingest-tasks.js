/**
 * Fleet-to-Dashboard Bridge 3: Tasks → DB
 * Writes structured tasks to the new `tasks` table.
 * Resilient, non-fatal, uses strict connection safety.
 *
 * Usage:
 *   node scripts/bridge/ingest-tasks.js '{"source":"hunter-support","tasks":[{"title":"Draft LinkedIn comments","assignee":"jenny","category":"content","priority":"normal","due_date":"2026-04-06"}]}'
 */

const { Client } = require('pg');

const DB_URL = 'postgresql://superhana@localhost:5432/aloomii';

/**
 * Main ingest function - accepts array of tasks
 */
async function ingestTasks(payload) {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid payload' };
  }

  const { source, tasks = [] } = payload;

  if (!source || !Array.isArray(tasks) || tasks.length === 0) {
    return { success: false, error: 'source and tasks array are required' };
  }

  const client = new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: 2000,
    statement_timeout: 3000,
  });

  let result = { 
    success: false, 
    inserted: 0, 
    skipped: 0, 
    tasks: [] 
  };

  try {
    await client.connect();

    for (const task of tasks) {
      if (!task.title) continue;

      // Dedup: check for exact (title + assignee + due_date) with status != 'done'
      const dedupQuery = `
        SELECT id FROM tasks 
        WHERE title = $1 
          AND assignee = $2 
          AND (due_date = $3 OR (due_date IS NULL AND $3 IS NULL))
          AND status != 'done'
        LIMIT 1
      `;

      const dedupRes = await client.query(dedupQuery, [
        task.title,
        task.assignee || null,
        task.due_date ? new Date(task.due_date) : null
      ]);

      if (dedupRes.rows.length > 0) {
        result.skipped++;
        continue;
      }

      // Insert new task
      const insertQuery = `
        INSERT INTO tasks (
          title, description, assignee, source, category,
          priority, due_date, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const insertRes = await client.query(insertQuery, [
        task.title,
        task.description || null,
        task.assignee || null,
        source,
        task.category || null,
        task.priority || 'normal',
        task.due_date ? new Date(task.due_date) : null,
        task.metadata || null
      ]);

      result.inserted++;
      result.tasks.push({
        id: insertRes.rows[0].id,
        title: task.title
      });
    }

    result.success = true;

  } catch (error) {
    console.error('ingestTasks error:', error.message);
    result.error = error.message;
  } finally {
    try {
      await client.end();
    } catch (e) {
      console.warn('Failed to close client:', e.message);
    }
  }

  return result;
}

/**
 * CLI handler
 */
/**
 * Read all stdin as a string (for piped input)
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
    // Timeout after 3s if no stdin
    setTimeout(() => resolve(data.trim()), 3000);
  });
}

if (require.main === module) {
  (async () => {
    let input = process.argv[2];
    
    // If no CLI arg, try reading from stdin (supports: cat file.json | node ingest-tasks.js)
    if (!input && !process.stdin.isTTY) {
      input = await readStdin();
    }
    
    if (!input) {
      console.error('Usage: node ingest-tasks.js \'<json>\' OR cat file.json | node ingest-tasks.js');
      process.exit(1);
    }

    let payload;
    try {
      payload = JSON.parse(input);
    } catch (e) {
      console.error('Invalid JSON payload');
      process.exit(1);
    }

    const result = await ingestTasks(payload);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { ingestTasks };
