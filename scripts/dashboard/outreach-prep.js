/**
 * Outreach Prep Engine
 * Takes a contact or signal, returns: score, research, draft
 * No email finder — asks for email in the DM itself
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '../../..');
const GEMINI_SCRIPT = path.join(WORKSPACE, 'scripts/gemini-search.sh');

function geminiSearch(query, timeoutMs = 15000) {
  try {
    const result = execFileSync('bash', [GEMINI_SCRIPT, query], {
      timeout: timeoutMs,
      encoding: 'utf8',
      cwd: WORKSPACE
    });
    return result.trim();
  } catch (err) {
    return null;
  }
}

async function researchContact(contact) {
  const results = {};
  
  // LinkedIn bio + recent activity
  if (contact.handle || contact.name) {
    const query = `LinkedIn profile ${contact.name} ${contact.handle || ''} ${contact.company || ''}. Extract: current role, company, recent posts/topics, background summary`;
    results.linkedin = geminiSearch(query, 12000);
  }
  
  // Company research
  if (contact.company) {
    const query = `${contact.company} company: what they do, stage, funding, size, recent news`;
    results.company = geminiSearch(query, 12000);
  }
  
  // Pain signal research (if we have a signal context)
  if (contact.signal_text) {
    const query = `Founder said: "${contact.signal_text.substring(0, 200)}". What pain points does this reveal? What angle would resonate for a GTM service that runs outbound for founders?`;
    results.painAnalysis = geminiSearch(query, 12000);
  }
  
  return results;
}

function calculateLeadScore(contact, signals, villagePaths) {
  let score = 0;
  const reasons = [];
  
  // Base: tier
  if (contact.tier === '1') { score += 30; reasons.push('Tier 1 contact'); }
  else if (contact.tier === '2') { score += 20; reasons.push('Tier 2 contact'); }
  else { score += 10; reasons.push('Tier 3+ contact'); }
  
  // Signals
  if (signals.length > 0) {
    const avgSignalScore = signals.reduce((s, sig) => s + (parseFloat(sig.score) || 3), 0) / signals.length;
    score += Math.round(avgSignalScore * 8);
    reasons.push(`${signals.length} signal(s), avg ${avgSignalScore.toFixed(1)}/5`);
  }
  
  // Village warm paths
  if (villagePaths && villagePaths.length > 0) {
    score += 15;
    reasons.push(`Warm path via ${villagePaths[0].connector || 'mutual connection'}`);
  }
  
  // Recency
  if (contact.last_outreach_date) {
    const daysSince = Math.floor((Date.now() - new Date(contact.last_outreach_date).getTime()) / (1000*60*60*24));
    if (daysSince > 30) { score += 10; reasons.push('No touch in 30+ days'); }
    else if (daysSince < 7) { score -= 10; reasons.push('Touched recently'); }
  } else {
    score += 10; reasons.push('Never contacted');
  }
  
  // Cap at 100
  score = Math.min(100, Math.max(0, score));
  
  return { score, reasons, priority: score >= 70 ? 'hot' : score >= 50 ? 'warm' : 'cold' };
}

function generateDraft(contact, signal, channel = 'linkedin_dm') {
  const name = contact.name?.split(' ')[0] || 'there';
  const company = contact.company || 'your company';
  
  let context = '';
  if (signal) {
    context = signal.signal_text || signal.body || '';
    if (context.length > 120) context = context.substring(0, 120) + '...';
  }
  
  const templates = {
    linkedin_dm: () => {
      if (signal) {
        return `Hey ${name}, saw your post about ${context}. ${signal.angle || "We've been helping founders at your stage replace their SDR function entirely."} Mind if I DM you? Also, what's the best email to reach you at?`;
      }
      return `Hey ${name} — noticed ${company} is building something interesting. We've been running GTM for B2B founders so their pipeline fills while they build. Worth a 15-min chat this week? What's the best email to reach you at?`;
    },
    
    x_dm: () => {
      if (signal) {
        return `${name} — ${context}. We're building exactly the layer that replaces the SDR function for founders. Mind if I reach out via email?`;
      }
      return `${name} — ${company} looks like it's at the stage where founder-led sales starts to break. We've fixed that for 5+ teams. Mind if I email you?`;
    },
    
    reddit_reply: () => {
      if (signal) {
        return `Hey ${name}, saw your post about ${context}. ${signal.angle || "We've been helping founders at your stage with exactly this."} Would love to share what's worked. Mind if I DM you? Also, what's the best email to reach you at?`;
      }
      return `Hey ${name} — your post resonated. We've been solving this exact problem for founders. Worth a quick chat? What's the best email to reach you at?`;
    },
    
    email: () => {
      if (signal) {
        return `Subject: ${name} — ${context.substring(0, 40)}...\n\n${name},\n\nSaw your post about ${context}. ${signal.angle || "We've been helping founders at your stage replace their SDR function entirely."}\n\nWorth a 15-min call this week?\n\nAlso, what's the best email to reach you at?`;
      }
      return `Subject: ${company} — quick question\n\n${name},\n\nNoticed ${company} is building something interesting. We've been running GTM for B2B founders so their pipeline fills while they build.\n\nWorth a 15-min chat this week?\n\nAlso, what's the best email to reach you at?`;
    }
  };
  
  const draft = templates[channel] ? templates[channel]() : templates.linkedin_dm();
  
  return {
    draft,
    channel,
    includes_email_ask: true,
    estimated_chars: draft.length,
    tone: 'direct-warm'
  };
}

async function prepOutreach(contact, options = {}) {
  const { signal, villagePaths, channel = 'linkedin_dm' } = options;
  
  // 1. Research
  const research = await researchContact({ ...contact, signal_text: signal?.body || signal?.signal_text });
  
  // 2. Score
  const signals = signal ? [signal] : [];
  const scoring = calculateLeadScore(contact, signals, villagePaths);
  
  // 3. Draft
  const draft = generateDraft(contact, signal, channel);
  
  return {
    contact: {
      id: contact.id,
      name: contact.name,
      handle: contact.handle,
      company: contact.company,
      tier: contact.tier,
      last_outreach_date: contact.last_outreach_date
    },
    score: scoring,
    research,
    draft,
    village_paths: villagePaths || [],
    timestamp: new Date().toISOString()
  };
}

module.exports = { prepOutreach, calculateLeadScore, generateDraft, researchContact };

// CLI usage
if (require.main === module) {
  const contact = {
    id: process.argv[2] || 'test',
    name: process.argv[3] || 'Test Contact',
    handle: process.argv[4],
    company: process.argv[5],
    tier: '2'
  };
  
  prepOutreach(contact, { channel: 'linkedin_dm' })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
