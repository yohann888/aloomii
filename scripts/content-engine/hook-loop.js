#!/usr/bin/env node
'use strict';

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadJSON(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getAnthropicApiKey() {
  try {
    const profiles = loadJSON(path.join(process.env.HOME, '.openclaw/agents/main/agent/auth-profiles.json'));
    const key = profiles?.profiles?.['anthropic:default']?.key;
    if (key) return key;
  } catch {}
  const config = loadJSON(path.join(process.env.HOME, '.openclaw/openclaw.json'));
  return config?.models?.providers?.anthropic?.apiKey;
}

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function callSonnet(prompt, maxTokens = 300) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('Anthropic API key not found');
  const res = await httpPost('https://api.anthropic.com/v1/messages', {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  }, {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = (res?.content || [])
    .filter(x => x?.type === 'text' && x?.text)
    .map(x => x.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Sonnet returned no content');
  return text;
}

function normalizeHook(text) {
  return String(text || '').replace(/^"|"$/g, '').trim();
}

async function runHookLoop({ business, icp, topic, funnelStage = 'top', platform = 'linkedin' }) {
  const runId = crypto.randomUUID();
  const sharedRules = `Rules:\n- No questions as openers\n- No \"I\" as the first word\n- Lead with contrast, tension, or a specific number\n- Under 20 words\n- Must work without reading the rest of the post\n- Write only the hook.`;

  const candidateA = normalizeHook(await callSonnet(
    `You are a content strategist writing for a B2B founder.\nContext:\n- Business: ${business}\n- ICP: ${icp}\n- Topic: ${topic}\n- Funnel stage: ${funnelStage}\n- Platform: ${platform}\n\n${sharedRules}`
  ));

  const critique = await callSonnet(
    `You are a ruthless content critic. Your job is finding flaws.\nHere is a ${platform} hook targeting ${icp}:\n\"${candidateA}\"\n\nTear it apart:\n1. What is generic about this?\n2. Would this ICP stop scrolling? Why or why not?\n3. What emotional trigger is it trying to hit? Does it land?\n4. What is the strongest word? Weakest word?\n5. On a scale of 1-10, how likely is this to get scrolled past?\n\nBe specific and brutal. No compliments.`,
    500
  );

  const candidateB = normalizeHook(await callSonnet(
    `You are a rival copywriter. You have not seen the original hook.\nA critic reviewed a ${platform} hook targeting ${icp} about ${topic} and found these problems:\n${critique}\n\nWrite a completely new hook that addresses every weakness.\n${sharedRules}`
  ));

  const candidateAB = normalizeHook(await callSonnet(
    `You are a synthesis editor. Here are two ${platform} hooks targeting ${icp} about ${topic}.\nHook 1: \"${candidateA}\"\nHook 2: \"${candidateB}\"\n\nCreate a third hook that takes the strongest elements from each and is better than either.\n${sharedRules}`
  ));

  const judgeRaw = await callSonnet(
    `You are evaluating ${platform} hooks. Target audience: ${icp}. Topic: ${topic}. Goal: stop the reader and make them read more.\n\nHook A: \"${candidateA}\"\nHook B: \"${candidateB}\"\nHook AB: \"${candidateAB}\"\n\nScore each hook 1-10 on:\n- scroll_stopping\n- specificity\n- tension\n- memorability\n\nReturn strict JSON with this shape:\n{\n  \"winner\": \"A|B|AB\",\n  \"reason\": \"...\",\n  \"scores\": {\n    \"A\": {\"scroll_stopping\":0,\"specificity\":0,\"tension\":0,\"memorability\":0},\n    \"B\": {\"scroll_stopping\":0,\"specificity\":0,\"tension\":0,\"memorability\":0},\n    \"AB\": {\"scroll_stopping\":0,\"specificity\":0,\"tension\":0,\"memorability\":0}\n  }\n}`,
    700
  );

  let judge;
  try {
    // Strip markdown code fences before parsing
    let cleaned = judgeRaw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    judge = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch {
    judge = { winner: 'AB', reason: 'Fallback winner', scores: {} };
  }

  const candidates = [
    { type: 'A', hook_text: candidateA },
    { type: 'B', hook_text: candidateB },
    { type: 'AB', hook_text: candidateAB },
  ].map(c => {
    const scoreParts = judge?.scores?.[c.type] || {};
    const total = (scoreParts.scroll_stopping || 0) + (scoreParts.specificity || 0) + (scoreParts.tension || 0) + (scoreParts.memorability || 0);
    return {
      ...c,
      recommended: judge?.winner === c.type,
      score_total: total,
      metadata: {
        candidate_type: c.type,
        recommended: judge?.winner === c.type,
        score_total: total,
        scores: scoreParts,
        critique,
        judge_reasoning: judge?.reason || null,
        brief: { business, icp, topic, funnel_stage: funnelStage, platform },
      }
    };
  });

  const recommended = candidates.find(c => c.recommended) || candidates[2] || candidates[0];

  return { runId, recommended, candidates };
}

module.exports = { runHookLoop };
