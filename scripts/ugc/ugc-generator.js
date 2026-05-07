/**
 * ugc-generator.js — Multi-model UGC script generation
 * Routes to Anthropic (Opus) or OpenClaw gateway (Kimi, DeepSeek) based on model_id.
 * Accepts a pre-rendered prompt — never rebuilds it internally.
 * Returns { text, model_used } so the caller can record the actual model.
 */

const https = require('https');
const http  = require('http');
const { buildUgcPrompt } = require('./ugc-prompt-builder');

const TIMEOUT_MS  = 300000; // 300 seconds
const GATEWAY_URL = 'http://localhost:18789';

// ─── Supported models ────────────────────────────────────────────────────────
const SUPPORTED_MODELS = {
  'anthropic/claude-opus-4-7':   { provider: 'anthropic', id: 'claude-opus-4-7',          label: 'Claude Opus' },
  'ollama/kimi-k2.6:cloud':      { provider: 'gateway',   id: 'ollama/kimi-k2.6:cloud',   label: 'Kimi K2.6'  },
  'ollama/deepseek-v4-pro:cloud':{ provider: 'gateway',   id: 'ollama/deepseek-v4-pro:cloud', label: 'DeepSeek V4 Pro' },
};

const DEFAULT_MODEL = 'anthropic/claude-opus-4-7';

function loadJSON(path) {
  try { return JSON.parse(require('fs').readFileSync(path, 'utf8')); } catch { return null; }
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

function getGatewayToken() {
  const config = loadJSON(require('path').join(process.env.HOME, '.openclaw/openclaw.json'));
  return config?.gateway?.auth?.token || null;
}

// ─── Anthropic direct call ───────────────────────────────────────────────────
function callAnthropic(model_id, prompt, max_tokens = 2000) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('Anthropic API key not found');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model_id,
      max_tokens,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-length': Buffer.byteLength(body)
      },
      timeout: TIMEOUT_MS
    }, res => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) {
            reject(new Error(`Anthropic error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            return;
          }
          resolve(parsed.content?.[0]?.text || '');
        } catch(e) { reject(new Error(`Anthropic parse error: ${e.message}`)); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic API timeout (300s)')); });
    req.write(body);
    req.end();
  });
}

// ─── OpenClaw gateway call (OpenAI-compatible) ───────────────────────────────
function callGateway(model_id, prompt, max_tokens = 2000) {
  const token = getGatewayToken();
  const url   = new URL('/v1/chat/completions', GATEWAY_URL);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model_id,
      max_tokens,
      messages: [{ role: 'user', content: prompt }]
    });

    const opts = {
      hostname: url.hostname,
      port:     parseInt(url.port, 10) || 80,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'content-type':   'application/json',
        'content-length': Buffer.byteLength(body),
        ...(token ? { 'authorization': `Bearer ${token}` } : {})
      }
    };

    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) {
            reject(new Error(`Gateway error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            return;
          }
          resolve(parsed.choices?.[0]?.message?.content || '');
        } catch(e) { reject(new Error(`Gateway parse error: ${e.message}\nRaw: ${buf.substring(0,200)}`)); }
      });
    });

    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error(`Gateway timeout (300s) for model ${model_id}`)); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * generateUgcScript(painSignal, formData, options)
 *
 * @param painSignal  — DB row from pain_signals
 * @param formData    — character + story_angle + cta fields
 * @param options     — { renderedPrompt?, model_id?, max_tokens? }
 *   renderedPrompt: pre-built prompt string from DB template (skips buildUgcPrompt)
 *   model_id: one of SUPPORTED_MODELS keys (default: anthropic/claude-opus-4-7)
 *
 * @returns { text: string, model_used: string }
 */
async function generateUgcScript(painSignal, formData, options = {}) {
  const model_id  = options.model_id || DEFAULT_MODEL;
  const max_tokens = options.max_tokens || 2000;

  const modelConfig = SUPPORTED_MODELS[model_id];
  if (!modelConfig) {
    throw new Error(`Unsupported model: ${model_id}. Allowed: ${Object.keys(SUPPORTED_MODELS).join(', ')}`);
  }

  // Use pre-rendered prompt if provided, otherwise build from scratch
  const prompt = options.renderedPrompt || buildUgcPrompt(painSignal, formData);

  let text;
  if (modelConfig.provider === 'anthropic') {
    text = await callAnthropic(modelConfig.id, prompt, max_tokens);
  } else {
    text = await callGateway(modelConfig.id, prompt, max_tokens);
  }

  return { text, model_used: model_id };
}

module.exports = { generateUgcScript, getAnthropicApiKey, SUPPORTED_MODELS, DEFAULT_MODEL };
