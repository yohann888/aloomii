/**
 * ugc-generator.js — Direct Anthropic API call to opus for UGC script generation
 * 300s timeout, model: claude-opus-4-7
 */

const https = require('https');
const { buildUgcPrompt } = require('./ugc-prompt-builder');

const OPUS_MODEL = 'claude-opus-4-7';
const OPUS_TIMEOUT_MS = 300000; // 300 seconds

function loadJSON(path) {
  try {
    const fs = require('fs');
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch { return null; }
}

function getAnthropicApiKey() {
  try {
    const profiles = loadJSON(require('path').join(process.env.HOME, '.openclaw/agents/main/agent/auth-profiles.json'));
    const key = profiles?.profiles?.['anthropic:default']?.key;
    if (key) return key;
  } catch {}
  const config = loadJSON(require('path').join(process.env.HOME, '.openclaw/openclaw.json'));
  return config?.models?.providers?.anthropic?.apiKey;
}

async function generateUgcScript(painSignal, formData) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('Anthropic API key not found. Check auth-profiles.json or openclaw.json');

  const prompt = buildUgcPrompt(painSignal, formData);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: OPUS_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: OPUS_TIMEOUT_MS
    }, res => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed.error) {
            reject(new Error(`Anthropic API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            return;
          }
          const text = parsed.content?.[0]?.text || parsed.completion || '';
          resolve(text);
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic API timeout (300s)')); });
    req.write(body);
    req.end();
  });
}

module.exports = { generateUgcScript, getAnthropicApiKey };
