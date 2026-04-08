#!/usr/bin/env node
/**
 * verify-build.js — Post-build verification for Vibrnt dashboard
 * Checks for known recurring issues before deploy.
 * Exit code 1 = FAIL (do not deploy)
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist', 'index.html');
let errors = 0;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  errors++;
}

function pass(msg) {
  console.log(`  PASS: ${msg}`);
}

console.log('Vibrnt Build Verification\n');

// 1. Check dist/index.html exists and has embedded data
if (!fs.existsSync(DIST)) {
  fail('dist/index.html does not exist');
} else {
  const html = fs.readFileSync(DIST, 'utf-8');
  
  // Check embedded data exists
  if (!html.includes('__VIBRNT_DATA__')) {
    fail('No embedded data found (__VIBRNT_DATA__ missing)');
  } else {
    pass('Embedded data present');
  }

  // Extract and validate data
  const m = html.match(/window\.__VIBRNT_DATA__ = ({.*?});/);
  if (!m) {
    fail('Could not parse embedded data');
  } else {
    const data = JSON.parse(m[1]);
    
    // Check products
    const products = (data.catalog && data.catalog.products) || [];
    if (products.length === 0) {
      fail('No products in catalog');
    } else {
      pass(`${products.length} products in catalog`);
    }

    // Check for duplicate products (same mood + style)
    const seen = new Set();
    for (const p of products) {
      const key = `${(p.moods || []).sort().join(',')}|${(p.style || '').slice(0, 30)}`;
      if (seen.has(key)) {
        fail(`Duplicate product detected: "${p.name}" has same mood+style as another product`);
      }
      seen.add(key);
    }
    if (!seen.size || errors === 0) pass('No duplicate products');

    // Check product-to-trend linking
    for (const p of products) {
      if (!p.relatedTrend) {
        fail(`Product "${p.name}" has no linked trend`);
      }
    }
    if (products.every(p => p.relatedTrend)) pass('All products linked to trends');

    // Check for .toLowerCase() on array moods (the recurring bug)
    if (html.includes(".moods || '').toLowerCase()") || html.includes("p.moods || '').toLowerCase()")) {
      fail('Found unsafe .toLowerCase() on moods (array type bug)');
    } else {
      pass('No unsafe mood string operations');
    }

    // Check trends have source URLs
    const allTrends = data.allTrends || [];
    const withUrls = allTrends.filter(t => t.sourceUrl && t.sourceUrl.length > 0);
    if (allTrends.length > 0 && withUrls.length === 0) {
      console.log(`  WARN: No trends have source URLs (${allTrends.length} trends total)`);
    } else if (allTrends.length > 0) {
      pass(`${withUrls.length}/${allTrends.length} trends have source URLs`);
    }

    // Check for encoding issues (garbled UTF-8 characters)
    // Common garbled patterns: Ã, â, Â (these appear when UTF-8 is double-encoded)
    const bodyTexts = (data.scripts || []).map(s => s.body || '').join('');
    if (/Ã[^\s]|â[^\s]{2}|Â[^\s]/.test(bodyTexts) && !/[ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞß]/.test(bodyTexts)) {
      // Only flag if these look like garbled text, not intentional special chars
      console.log('  WARN: Possible garbled UTF-8 characters in script bodies');
    }
  }
}

console.log(`\n${errors === 0 ? '✅ All checks passed' : `❌ ${errors} check(s) failed — DO NOT DEPLOY`}`);
process.exit(errors > 0 ? 1 : 0);
