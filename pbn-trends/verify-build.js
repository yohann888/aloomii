#!/usr/bin/env node
// PBN Content Dashboard - verify-build.js
// Must pass before deploy. Hard gate.

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist/index.html');

let errors = 0;

function fail(msg) {
  console.error('FAIL:', msg);
  errors++;
}

function pass(msg) {
  console.log('PASS:', msg);
}

if (!fs.existsSync(DIST)) {
  fail('dist/index.html does not exist. Run build-static.js first.');
  process.exit(1);
}

const html = fs.readFileSync(DIST, 'utf-8');

// Check data is present
if (!html.includes('window.__PBN_TRENDS_DATA__')) {
  fail('__PBN_TRENDS_DATA__ not found in output');
} else {
  pass('__PBN_TRENDS_DATA__ present');
}

// Extract and parse JSON data
const dataMatch = html.match(/window\.__PBN_TRENDS_DATA__ = ({[\s\S]*?});/);
if (!dataMatch) {
  fail('Could not extract JSON data from output');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(dataMatch[1]);
  pass('JSON parses cleanly');
} catch (e) {
  fail('JSON parse error: ' + e.message);
  process.exit(1);
}

// Schema validation
if (!data.schemaVersion) fail('Missing schemaVersion');
else pass('schemaVersion present: ' + data.schemaVersion);

if (!data.week) fail('Missing week');
else pass('week: ' + data.week);

if (!data.winningHookType) fail('Missing winningHookType');
else pass('winningHookType: ' + data.winningHookType);

if (!Array.isArray(data.winningHooks)) fail('winningHooks must be array');
else if (data.winningHooks.length === 0) fail('winningHooks is empty');
else pass(`winningHooks: ${data.winningHooks.length} items`);

if (!Array.isArray(data.topPerformingExamples)) fail('topPerformingExamples must be array');
else if (data.topPerformingExamples.length === 0) fail('topPerformingExamples is empty');
else pass(`topPerformingExamples: ${data.topPerformingExamples.length} items`);

if (!Array.isArray(data.failingHooks)) fail('failingHooks must be array');
else pass(`failingHooks: ${data.failingHooks.length} items`);

// Schema v2 checks (warn-only for backwards compat)
if (!Array.isArray(data.trendingTopics)) pass('trendingTopics: missing (schema v1 fallback)');
else pass(`trendingTopics: ${data.trendingTopics.length} items`);

if (!Array.isArray(data.captionTemplates)) pass('captionTemplates: missing (schema v1 fallback)');
else pass(`captionTemplates: ${data.captionTemplates.length} items`);

if (!data.hashtags) pass('hashtags: missing (schema v1 fallback)');
else pass(`hashtags: ${(data.hashtags.recommended||[]).length} rec, ${(data.hashtags.avoid||[]).length} avoid`);

if (!Array.isArray(data.platformTrends)) pass('platformTrends: missing (schema v1 fallback)');
else pass(`platformTrends: ${data.platformTrends.length} items`);

// Check object shapes
data.winningHooks.forEach((h, i) => {
  if (typeof h.text !== 'string') fail(`winningHooks[${i}].text must be string`);
  if (typeof h.metric !== 'string') fail(`winningHooks[${i}].metric must be string`);
  if (typeof h.score !== 'number') fail(`winningHooks[${i}].score must be number`);
});

data.topPerformingExamples.forEach((e, i) => {
  if (typeof e.text !== 'string') fail(`topPerformingExamples[${i}].text must be string`);
  if (typeof e.likes !== 'number') fail(`topPerformingExamples[${i}].likes must be number`);
  if (typeof e.views !== 'number') fail(`topPerformingExamples[${i}].views must be number`);
  if (typeof e.source !== 'string') fail(`topPerformingExamples[${i}].source must be string`);
});

// Forbidden characters
const forbidden = ['\u2014', '\u2013', '\u201C', '\u201D', '\u2018', '\u2019'];
const raw = JSON.stringify(data);
forbidden.forEach(char => {
  if (raw.includes(char)) fail(`Forbidden character found: U+${char.charCodeAt(0).toString(16).toUpperCase()}`);
});
pass('No forbidden characters');

// XSS safety
if (html.includes('</script>') && html.split('</script>').length > 3) {
  fail('Possible </script> injection in data');
} else {
  pass('No </script> injection risk');
}

// Size check
if (html.length < 5000) fail(`Output too small (${html.length} bytes) - likely empty build`);
else pass(`Output size: ${html.length} bytes`);

console.log('');
if (errors > 0) {
  console.error(`FAILED: ${errors} error(s). Do not deploy.`);
  process.exit(1);
} else {
  console.log('All checks passed. Safe to deploy.');
}
