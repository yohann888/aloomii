/**
 * Cloudflare Access JWT Verification Middleware — Command Center v2
 *
 * Cryptographically verifies CF_Authorization cookie JWT against
 * Cloudflare Access public keys fetched from:
 *   https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/certs
 *
 * Verifies:
 *   1. JWT signature against Cloudflare public keys (RS256)
 *   2. Audience (AUD) claim matches CF_AUD env var
 *   3. Expiration (EXP) is not passed
 *
 * Usage:
 *   const cfAuth = require('./cloudflare-auth');
 *   app.use(cfAuth);  // applied after route matching, before handler
 */

const https = require('https');
const crypto = require('crypto');

// ─── Key cache ────────────────────────────────────────────────────────────────
let cachedKeys = null;
let cacheTimestamp = 0;
const KEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch and cache Cloudflare Access public keys.
 * Returns: { keys: { [kid]: pem_string }, teamDomain: string }
 */
async function fetchCFAccessKeys(teamDomain) {
  const now = Date.now();
  if (cachedKeys && (now - cacheTimestamp < KEY_CACHE_TTL_MS)) {
    return cachedKeys;
  }

  const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`CF Access certs returned ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const certs = JSON.parse(raw);
          cachedKeys = {
            keys: certs,
            teamDomain,
            fetchedAt: new Date().toISOString(),
          };
          cacheTimestamp = Date.now();
          resolve(cachedKeys);
        } catch (e) {
          reject(new Error(`Failed to parse CF Access certs: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Decode a JWT (base64url segments) without verification — for header extraction only.
 */
function decodeJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const decodeBase64URL = (str) => {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return Buffer.from(padded, 'base64');
  };

  return {
    header: JSON.parse(decodeBase64URL(parts[0]).toString('utf8')),
    payload: JSON.parse(decodeBase64URL(parts[1]).toString('utf8')),
    signature: parts[2],
  };
}

/**
 * Verify a JWT using Cloudflare Access RS256 keys.
 * Uses Node.js crypto.createVerify — zero external dependencies.
 */
function verifyJWT(token, certs) {
  const { header, payload, signature } = decodeJWT(token);

  // Find the matching public key by kid
  const publicKey = certs.public_certs?.find(c => c.kid === header.kid);
  if (!publicKey) {
    throw new Error(`No matching public key found for kid: ${header.kid}`);
  }

  // Construct PEM (CF gives base64-encoded SPKI)
  const der = Buffer.from(publicKey.cert, 'base64');
  const pem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;

  const signedPart = `${token.split('.')[0]}.${token.split('.')[1]}`;
  const sigBuf = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signedPart);
  return verifier.verify(pem, sigBuf);
}

/**
 * Main middleware function.
 * Reads CF_Authorization cookie, verifies JWT, attaches user to req.
 *
 * @param {object} req  - Express-like req object
 * @param {object} res  - Express-like res object
 * @param {function} next - Continues to route handler
 */
async function cfAuth(req, res, next) {
  const teamDomain = process.env.CF_TEAM_DOMAIN;
  const audience   = process.env.CF_AUD;

  if (!audience) {
    return res.status(500).json({ error: 'CF_AUD env var not set — auth misconfigured' });
  }

  // Read cookie (supports both cookie-header string and manual parse)
  let rawCookie = req.headers.cookie || '';
  let token = null;

  if (rawCookie.includes('CF_Authorization=')) {
    const match = rawCookie.match(/CF_Authorization=([^;]+)/);
    token = match ? match[1] : null;
  } else if (req.headers['cf-authorization']) {
    token = req.headers['cf-authorization'];
  }

  if (!token) {
    return res.status(401).json({ error: 'Missing CF_Authorization cookie' });
  }

  try {
    // Decode first to get team_domain from claims (fallback to env)
    const { payload } = decodeJWT(token);
    const resolvedTeam = teamDomain || payload.team_domain || 'aloomii';

    // Fetch keys (cached)
    const { public_certs } = await fetchCFAccessKeys(resolvedTeam);

    // Verify signature
    const valid = verifyJWT(token, { public_certs });
    if (!valid) {
      return res.status(401).json({ error: 'Invalid JWT signature' });
    }

    // Verify audience
    const tokenAudience = payload.aud || payload.audience;
    if (tokenAudience !== audience && !Array.isArray(tokenAudience) && !tokenAudience.includes(audience)) {
      return res.status(401).json({ error: 'JWT audience mismatch' });
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return res.status(401).json({ error: 'JWT has expired' });
    }

    // Attach identity to request
    req.cfUser = {
      email: payload.email || null,
      sub: payload.sub || null,
      aud: tokenAudience,
    };

    next();
  } catch (err) {
    console.error('[cloudflare-auth] Verification failed:', err.message);
    return res.status(401).json({ error: 'Authentication failed: ' + err.message });
  }
}

module.exports = { cfAuth, fetchCFAccessKeys };
