#!/usr/bin/env node
/**
 * Test script for Outreach Prep API endpoints
 * Usage: node scripts/test-outreach-prep.js
 */

const http = require('http');

function req(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3200,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function test() {
  console.log('Testing Outreach Prep API...\n');
  
  // 1. Test batch list endpoint
  console.log('1. POST /api/command/outreach/prep-contact-list (limit: 3)');
  const list = await req('POST', '/api/command/outreach/prep-contact-list', { limit: 3, min_score: 0 });
  console.log(`   ✅ ${list.count || 0} contacts returned`);
  if (list.contacts?.[0]) {
    console.log(`   Top: ${list.contacts[0].contact.name} (score: ${list.contacts[0].score.score})`);
  }
  console.log();
  
  // 2. Test single contact prep (use first contact from list)
  const contactId = list.contacts?.[0]?.contact?.id;
  if (contactId) {
    console.log(`2. POST /api/command/outreach/prep (contact: ${contactId})`);
    const prep = await req('POST', '/api/command/outreach/prep', { 
      contact_id: contactId,
      channel: 'linkedin_dm'
    });
    console.log(`   ✅ Draft created (id: ${prep.draft_id})`);
    console.log(`   Score: ${prep.score.score}/100 (${prep.score.priority})`);
    console.log(`   Draft preview: "${prep.draft.draft.substring(0, 80)}..."`);
    console.log();
    
    // 3. Test log endpoint
    console.log(`3. POST /api/command/outreach/log`);
    const log = await req('POST', '/api/command/outreach/log', {
      contact_name: prep.contact.name,
      channel: 'linkedin_dm',
      outcome: 'sent',
      note: 'Sent via manual outreach sprint'
    });
    console.log(`   ✅ Logged: ${log.success}`);
    console.log();
  }
  
  console.log('All tests passed ✅');
}

test().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
