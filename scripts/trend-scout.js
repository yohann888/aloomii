#!/usr/bin/env node
/**
 * trend-scout.js — Daily social trend intelligence
 * MIGRATED: Uses lib/core/router.js (Vendor Agnostic)
 * Usage: node scripts/trend-scout.js [--brand vibrnt|aloomii|all] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const router = require('../lib/core/router');

const WORKSPACE = '/Users/superhana/.openclaw/workspace';
const OUTPUT_DIR = path.join(WORKSPACE, 'content/trends');
const today = new Date().toISOString().split('T')[0];
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const brand = process.argv.includes('--brand')
  ? process.argv[process.argv.indexOf('--brand') + 1]
  : 'all';

// Read ICP config (same toggle as signal-scout)
let icpConfig = { sprint: { enabled: true }, ai_workforce: { enabled: true } };
try {
  const yaml = fs.readFileSync(path.join(WORKSPACE, 'config/signal-scout-icps.yaml'), 'utf8');
  const sprintMatch = yaml.match(/sprint:\s*\n\s*enabled:\s*(true|false)/);
  const workforceMatch = yaml.match(/ai_workforce:\s*\n\s*enabled:\s*(true|false)/);
  if (sprintMatch) icpConfig.sprint.enabled = sprintMatch[1] === 'true';
  if (workforceMatch) icpConfig.ai_workforce.enabled = workforceMatch[1] === 'true';
} catch (e) { /* default to both on */ }

const sprintActive = icpConfig.sprint.enabled;
const workforceActive = icpConfig.ai_workforce.enabled;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function getTrends(prompt, type) {
  try {
    const response = await router.query({
      task: 'creative',
      prompt: prompt
    });
    return { content: response };
  } catch (e) {
    console.error(`❌ Failed to get trends for ${type}:`, e.message);
    return { content: 'Error fetching trends.' };
  }
}

async function main() {
  console.log(`\n🔍 Trend Scout (Sovereign) — ${today}\n`);

  const results = {};

  // 1. VIBRNT AI
  if (brand === 'vibrnt' || brand === 'all') {
    console.log('Fetching VIBRNT AI trends...');
    const prompt = `Search X/Twitter for what's actually trending in women's fashion and aesthetics RIGHT NOW (${today}).
VIBRNT is a women's graphic tee brand built around 12 distinct moods: bold, playful, adventurous, cozy, confident, mystical, dark, sassy, nostalgic, zen, chill, and fierce. Graphics are printed on demand. The goal of this daily scan is purely to inform what to design next. Only surface insights that translate directly into printable visuals for women.

Find me the top 10 insights across these parameters:
1. Mood moment of the day & week — Which of VIBRNT's 12 moods is having a cultural moment on X right now among women? Look for outfit posts, aesthetic boards, and creator content that maps to one or more of these moods with high engagement. Name the mood and describe the visual vibe driving it.
2. Visual themes women are wearing or wanting — What specific graphic imagery (symbols, creatures, motifs, textures, scenes) is showing up in high-performing women's fashion posts this week? Prioritize things that could realistically live on a tee.
3. Text & slogan energy — What phrases, attitudes, or one-liners are resonating with women on X right now — in captions, on clothing in posts, or in comment sections? Flag anything that maps to a VIBRNT mood.
4. Aesthetic or subculture gaining ground — One emerging visual world (e.g. dark academia, cottagecore, bimbocore, etc.) that maps to a VIBRNT mood and is gaining traction but isn't yet oversaturated in the graphic tee space.
5. Color palette of the moment — What specific colors, combinations, or finishes (e.g. washed-out pastels, deep jewel tones, high-contrast black & white, metallics) are dominating women's fashion posts with strong engagement this week? Map it to the closest VIBRNT mood if possible.
6. Design direction to avoid — What graphic tee aesthetic is currently overdone or getting backlash among women on X? Flag it so VIBRNT doesn't produce something that feels stale.
Be specific. Real examples. Real accounts. Real numbers if available. Return exactly 10 bulleted insights starting with - **[Insight Title]**: [Description]`;
    
    results.vibrnt = await getTrends(prompt, 'vibrnt');
  }

  // 2. Aloomii (B2B) — ICP-aware
  if (brand === 'aloomii' || brand === 'all') {
    console.log('Fetching Aloomii/B2B trends...');

    // Sprint ICP block — founders with marketing problems
    const sprintBlock = sprintActive ? `
SPRINT ICP SIGNALS (B2B SaaS founders $10K-$100K MRR with no working marketing):
- Founders venting that word-of-mouth is slowing down or referrals dried up
- Posts about hiring a marketer and it not working, or content not converting
- "No time for LinkedIn" or "posting into the void" frustration from founders
- Founders asking how to get podcast appearances or media coverage
- Anyone asking "how do I get my first 100 customers beyond referrals"
- Posts about growing only on word-of-mouth and hitting a ceiling
- Founders who just hit $10K-$50K MRR and realize they have no marketing system
- Viral content angles: founder-led marketing, building in public, GTM without a team
- Best hashtags for this audience right now (#b2bmarketing #foundersales #foundergtm #buildinpublic)` : '';

    // AI Workforce block — financial/insurance services
    const workforceBlock = workforceActive ? `
AI WORKFORCE ICP SIGNALS (insurance brokers, financial advisors, wealth managers):
- Posts about client retention automation, renewal tracking, follow-up gaps
- Insurance or financial services firms announcing SDR/AE hires (buying signal)
- Pain points around relationship management in regulated industries
- Fintech/insurtech funding announcements this week
- Any viral posts about AI in financial services or insurance` : '';

    const prompt = `Search X/Twitter and the web for what B2B founders are talking about RIGHT NOW (${today}).
Find me the top 10 insights across these parameters:

CORE (always):
1. Top trending topics on X this week for B2B founders / AI-native GTM
2. Most engaged "build in public" or founder story posts this week
3. The #1 pain point B2B founders are venting about right now (sales, hiring, marketing, AI?)
4. Any viral posts about AI sales tools, outbound automation, or SDR replacement
5. Best hashtags for founder/B2B/SaaS content on X right now
${sprintBlock}
${workforceBlock}

Specific posts, real data, real accounts, engagement numbers where available. No generic predictions. Return exactly 10 bulleted insights starting with - **[Insight Title]**: [Description]`;

    results.aloomii = await getTrends(prompt, 'aloomii');
  }

  // 3. YouTube (Web)
  if (brand === 'all') {
    console.log('Fetching YouTube trends...');
    const prompt = `Search the web for what YouTube video formats are getting the most views RIGHT NOW (week of ${today}) in:
1. Fashion / outfit / styling / GRWM content
2. AI tools / SaaS / startup founder content
Give me:
- Top 3 video title formats driving views
- Thumbnail styles working right now
- 1 underutilized angle with breakout potential
- Any trending sounds or formats crossing over from TikTok to YouTube Shorts
Be specific. Real channels, real view counts if available.`;

    results.youtube = await getTrends(prompt, 'youtube');
  }

  // Build Report
  const report = [`# Trend Scout Report — ${today}`, `_Source: Sovereign Core Router_`, ``];
  if (results.vibrnt) report.push(`## 👗 VIBRNT AI Trends`, ``, results.vibrnt.content, ``);
  if (results.aloomii) report.push(`## 🤖 Aloomii / B2B Trends`, ``, results.aloomii.content, ``);
  if (results.youtube) report.push(`## 📺 YouTube Trends`, ``, results.youtube.content, ``);

  const reportText = report.join('\n');
  const outputFile = path.join(OUTPUT_DIR, `trends-${today}.md`);
  fs.writeFileSync(outputFile, reportText);
  console.log(`\n✅ Report saved: ${outputFile}`);

  // Summary logic (simplified for router output)
  console.log('\n📣 Discord summary ready (mock):');
  console.log(`📊 **Trend Scout — ${today}**\nOutput generated via Router.`);
}

main();
