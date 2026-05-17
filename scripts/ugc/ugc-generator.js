/**
 * ugc-generator.js — Multi-model UGC script generation
 * Routes to OpenClaw gateway (Kimi, DeepSeek) based on model_id.
 * Accepts a pre-rendered prompt — never rebuilds it internally.
 * Returns { text, model_used } so the caller can record the actual model.
 */

const http  = require('http');
const { buildUgcPrompt } = require('./ugc-prompt-builder');

const TIMEOUT_MS  = 300000; // 300 seconds

// ─── Supported models (Anthropic/Opus removed per Yohann directive) ──────────
const SUPPORTED_MODELS = {
  'ollama/kimi-k2.6:cloud':      { id: 'ollama/kimi-k2.6:cloud',      label: 'Kimi K2.6'  },
  'ollama/deepseek-v4-pro:cloud':{ id: 'ollama/deepseek-v4-pro:cloud', label: 'DeepSeek V4 Pro' },
};

const DEFAULT_MODEL = 'ollama/kimi-k2.6:cloud';

// ─── OpenClaw gateway call (OpenAI-compatible) ───────────────────────────────
function callGateway(model_id, prompt, max_tokens = 2000) {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const url = new URL('/v1/chat/completions', OLLAMA_URL);
  const ollamaModel = model_id.replace('ollama/', '');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: ollamaModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens,
      temperature: 0.7,
      top_p: 0.9,
    });

    const opts = {
      hostname: url.hostname,
      port: parseInt(url.port, 10) || 11434,
      path: url.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    };

    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (chunk) => (buf += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) {
            reject(new Error(`Ollama error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            return;
          }
          const choice = parsed.choices?.[0];
          const msg = choice?.message || {};
          let text = msg.content || msg.reasoning || '';
          text = text.replace(/^\s*<think>.*?<\/think>\s*/s, '').trim();
          resolve(text);
        } catch (e) {
          reject(new Error(`Ollama parse error: ${e.message}\nRaw: ${buf.substring(0, 200)}`));
        }
      });
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Ollama timeout (300s) for model ${model_id}`));
    });
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
 *   model_id: one of SUPPORTED_MODELS keys (default: ollama/kimi-k2.6:cloud)
 *
 * @returns { text: string, model_used: string }
 */
async function generateUgcScript(painSignal, formData, options = {}) {
  const model_id   = options.model_id || DEFAULT_MODEL;
  const max_tokens = options.max_tokens || 2000;

  const modelConfig = SUPPORTED_MODELS[model_id];
  if (!modelConfig) {
    throw new Error(`Unsupported model: ${model_id}. Allowed: ${Object.keys(SUPPORTED_MODELS).join(', ')}`);
  }

  const prompt = options.renderedPrompt || buildUgcPrompt(painSignal, formData);
  const text = await callGateway(modelConfig.id, prompt, max_tokens);

  return { text, model_used: model_id };
}

module.exports = { generateUgcScript, SUPPORTED_MODELS, DEFAULT_MODEL };
