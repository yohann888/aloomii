#!/usr/bin/env python3
"""Build auth.js — embeds all pages, handles all routes, no dead code."""
import base64, json, re, shutil, subprocess
from pathlib import Path

SRC  = Path("/Users/superhana/Desktop/aloomii/demo")
DEST = Path("/Users/superhana/Desktop/aloomii/chamber-worker/assets")
DEST.mkdir(exist_ok=True)

# ── 1. Fetch live API data ──────────────────────────────────────────────────
print("[1] Fetching live API data...")
ov  = json.loads(subprocess.run(["curl", "-s", "http://localhost:3300/api/chamber-demo/overview"], capture_output=True, text=True).stdout)
evs = json.loads(subprocess.run(["curl", "-s", "http://localhost:3300/api/chamber-demo/events"],   capture_output=True, text=True).stdout)
dr  = json.loads(subprocess.run(["curl", "-s", "http://localhost:3300/api/chamber-demo/directory"], capture_output=True, text=True).stdout)

# Admin data requires local auth
subprocess.run(["curl", "-s", "-c", "/tmp/local-cd-cookies.txt", "-X", "POST",
                "http://localhost:3300/api/chamber-demo/admin/login",
                "-H", "Content-Type: application/json",
                "-d", '{"code":"chamberdemo888"}'], check=True)
adm = json.loads(subprocess.run(["curl", "-s", "-b", "/tmp/local-cd-cookies.txt",
                                  "http://localhost:3300/api/chamber-demo/admin/overview"],
                                  capture_output=True, text=True).stdout)

CHAMBER_DATA = {
    "/api/chamber-demo/overview": ov,
    "/api/chamber-demo/events": evs,
    "/api/chamber-demo/directory": dr,
    "/api/chamber-demo/admin/overview": adm
}

# Preload individual event details so event-detail page renders without a live API
EVENT_DATA = {}
for ev in evs['events']:
    slug = ev['slug']
    detail = json.loads(subprocess.run(['curl', '-s',
        f'http://localhost:3300/api/chamber-demo/events/{slug}'],
        capture_output=True, text=True).stdout)
    EVENT_DATA[f'/api/chamber-demo/events/{slug}'] = detail
    CHAMBER_DATA[f'/api/chamber-demo/events/{slug}'] = detail

print(f"  directory: {len(dr['organizations'])} orgs")
print(f"  events: {len(evs['events'])} events")
print(f"  admin: {adm['summary']['organizations']} orgs, {adm['summary']['publishedEvents']} events")

# ── 2. Copy + patch all demo files ──────────────────────────────────────────
FILES = [
    "chamber-demo.html",
    "chamber-directory.html", "chamber-org-detail.html",
    "chamber-events.html", "chamber-event-detail.html",
    "chamber-join.html", "chamber-member-login.html",
    "chamber-member-consume.html", "chamber-member-dashboard.html",
    "chamber-admin.html", "chamber-admin-org-detail.html",
    "chamber-ui.css", "chamber-ui.js"
]

pages = {}  # name → raw content

for fname in FILES:
    text = (SRC / fname).read_text()
    if fname.endswith(".html"):
        # Fix asset paths
        text = re.sub(r'src="/demo/assets/',  'src="/chamber-demo/assets/',  text)
        text = re.sub(r'url\("/demo/assets/',  'url("/chamber-demo/assets/',  text)
        text = re.sub(r"url\('/demo/assets/",  "url('/chamber-demo/assets/",  text)
        text = text.replace('href="/demo/chamber-ui.css"', 'href="/chamber-demo/chamber-ui.css"')
        text = text.replace('src="/demo/chamber-ui.js"',  'src="/chamber-demo/chamber-ui.js"')
        
        # Link fixes: ensure all go to /chamber-demo/
        text = text.replace('href="/"', 'href="/chamber-demo/"')
        text = text.replace('href="/chamber-demo"', 'href="/chamber-demo/"')
        
        # Remove duplicate inline nav-toggle scripts
        text = re.sub(
            r'\n  <script>\s*document\.querySelector\(\'.nav-toggle\'\)\.addEventListener\(\'click\', \(\) => \{[^}]*classList\.toggle\(\'show\'\);[^}]*\}\);\s*</script>\n',
            '\n', text
        )

        # Inject preloaded data + fetch override at the top of <body>
        inject = f'<script>window.__CHAMBER_DATA__={json.dumps(CHAMBER_DATA, ensure_ascii=False)};</script>\n'
        fetch_override = f'<script>\n(function(){{const _f=fetch;fetch=function(u,o){{const key=typeof u=="string"?u:u instanceof Request?u.url:"";'
        fetch_override += r'if(window.__CHAMBER_DATA__&&window.__CHAMBER_DATA__[key]){return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(window.__CHAMBER_DATA__[key])})};'
        fetch_override += r"if(key==='/api/chamber-demo/admin/login'&&o&&o.method==='POST'){try{const b=JSON.parse(o.body);return Promise.resolve(b.code==='chamberdemo888'?{ok:true,status:200,json:()=>Promise.resolve({ok:true})}:{ok:false,status:401,json:()=>Promise.resolve({error:'Invalid code'})})}catch(e){}};"
        fetch_override += r"if(key==='/api/chamber-demo/member-auth/request-link'&&o&&o.method==='POST'){return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({magicLink:'/chamber-demo/member-dashboard',provider:'mock-worker'})})};"
        fetch_override += r"if(key==='/api/chamber-demo/member/me'){return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({user:{first_name:'Yohann',last_name:'Calpu',email:'yohann@aloomii.com',role:'member_admin'},organization:{name:'Aloomii Inc',tier_name:'Gold',status:'active',payment_status:'current',renewal_date:'2027-04-01',linkedin:'',twitter:'',facebook:''},summary:{hotDeals:2}})})};"
        fetch_override += r"if(key==='/api/chamber-demo/join'&&o&&o.method==='POST'){return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({ok:true,message:'Application received'})})};"
        fetch_override += r'return _f.call(window,u,o);};})();' + '\n</script>\n'
        text = inject + fetch_override + text


    pages[fname] = text
    print(f"  {fname}: {len(text):,} chars")

# Copy static assets
if (SRC / "assets").exists():
    shutil.copytree(SRC / "assets", DEST / "assets", dirs_exist_ok=True)
    print("  assets/")

# ── 3. Embed static assets (small files only) ──────────────────────────────────
ASSETS = {}
for fname in ['caledonia-chamber-logo-new.svg', 'caledonia-chamber-logo.jpg']:
    fpath = DEST / fname
    if fpath.exists():
        key = f'/chamber-demo/assets/{fname}'
        ASSETS[key] = base64.b64encode(fpath.read_bytes()).decode('ascii')
        print(f"  embedded {key}: {len(ASSETS[key])} chars b64")

# ── 4. Build Worker JS ──────────────────────────────────────────────────────
print("\n[4] Building auth.js...")

# B64 encode each page
encoded = {k: base64.b64encode(v.encode("utf-8")).decode("ascii") for k, v in pages.items()}

# Generate PAGES entries
page_entries = ",\n  ".join(
    f"'{k.replace('.html','')}': () => decodeB64('{encoded[k]}')"
    for k, v in pages.items()
)

# Generate smart key lookup:
# /chamber-demo/                   → 'chamber-demo'
# /chamber-demo/directory          → 'chamber-directory'
# /chamber-demo/org-detail/slug    → 'chamber-org-detail'
# /chamber-demo/events/slug        → 'chamber-event-detail'
# /chamber-demo/member-login        → 'chamber-member-login'
# etc.
key_lookup = r"""
const PAGES = {
  """ + page_entries + r"""
};

const ASSETS = """ + json.dumps(ASSETS) + r""";

function decodeB64Asset(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function pageKey(path) {
  path = path.replace(/\/\/$/, '');
  // Remove /chamber-demo prefix
  const stripped = path.replace(/^\/chamber-demo/, '') || '/';
  // Map clean path segments to page keys
  if (stripped === '/'            ) return 'chamber-demo';
  if (stripped === '/directory'   ) return 'chamber-directory';
  if (stripped.startsWith('/directory/')) return 'chamber-org-detail';
  if (stripped === '/events'      ) return 'chamber-events';
  if (stripped.startsWith('/events/')  ) return 'chamber-event-detail';
  if (stripped === '/join'        ) return 'chamber-join';
  if (stripped === '/member-login') return 'chamber-member-login';
  if (stripped === '/member-consume') return 'chamber-member-consume';
  if (stripped === '/member-dashboard') return 'chamber-member-dashboard';
  if (stripped === '/admin'       ) return 'chamber-admin';
  if (stripped.startsWith('/admin/')  ) return 'chamber-admin-org-detail';
  // Default: try to match by prefix
  const seg = stripped.split('/').filter(Boolean)[0];
  const map = {'directory':'chamber-directory','events':'chamber-events',
    'join':'chamber-join','member-login':'chamber-member-login',
    'member-consume':'chamber-member-consume','member-dashboard':'chamber-member-dashboard',
    'admin':'chamber-admin','org-detail':'chamber-org-detail'};
  return map[seg] || 'chamber-demo';
}
"""

auth_js = r"""/**
 * Chamber Demo — Cloudflare Worker
 * Serves at https://aloomii.com/chamber-demo/*
 * Password: chamberdemo888
 */
const AUTH_COOKIE = 'chamber_demo_auth';
const PASS_HASH   = 'chamberdemo888';

function decodeB64(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chamber Demo — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 100%); color: #fff; font-family: 'Outfit', system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 24px; padding: 44px 40px; width: 100%; max-width: 420px; box-shadow: 0 24px 64px rgba(0,0,0,0.4); }
    .badge { display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #D4A843; border: 1px solid #D4A843; border-radius: 20px; padding: 3px 10px; margin-bottom: 18px; }
    h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 700; color: #1B2A4A; margin-bottom: 6px; }
    p { font-size: 14px; color: #64748B; margin-bottom: 32px; line-height: 1.5; }
    label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: #64748B; margin-bottom: 8px; }
    input { width: 100%; padding: 13px 16px; border: 1.5px solid #E2E8F0; border-radius: 10px; font-size: 15px; font-family: inherit; color: #0F1A2E; outline: none; transition: border-color 0.2s; margin-bottom: 20px; }
    input:focus { border-color: #D4A843; }
    button { width: 100%; padding: 14px; background: linear-gradient(135deg, #1B2A4A, #3A4F6F); border: none; border-radius: 10px; color: #fff; font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer; }
    button:hover { opacity: 0.88; }
    .error { color: #C0392B; font-size: 13px; text-align: center; margin-top: 14px; display: none; }
    .error.show { display: block; }
    .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #94A3B8; }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <div class="badge">Member Experience Demo</div>
    <h1>Chamber Demo</h1>
    <p>Enter the demo access password to explore the Caledonia Regional Chamber member experience.</p>
    <form action="/chamber-demo/auth" method="POST">
      <input type="hidden" name="ref" value="/chamber-demo/">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Enter demo password" autocomplete="current-password" required>
      <button type="submit">Enter Demo</button>
    </form>
    <div id="error" class="error">Incorrect password — try again.</div>
    <div class="footer">aloomii.com/chamber-demo</div>
  </div>
  <script>
    if (new URLSearchParams(location.search).has('error')) {
      document.getElementById('error').classList.add('show');
    }
  </script>
</body>
</html>`;

const CONTENT_TYPES = {
  '.html' : 'text/html; charset=utf-8',
  '.css'  : 'text/css',
  '.js'   : 'application/javascript',
  '.svg'  : 'image/svg+xml',
  '.jpg'  : 'image/jpeg',
  '.png'  : 'image/png',
  '.gif'  : 'image/gif',
  '.ico'  : 'image/x-icon',
};

""" + key_lookup + r"""

async function handleRequest(request) {
  const url  = new URL(request.url);
  const path = url.pathname;

  // Public routes — no auth required
  const ASSET_PATHS = [
    '/chamber-demo/chamber-ui.css',
    '/chamber-demo/chamber-ui.js',
  ];
  const isAsset = ASSET_PATHS.includes(path);
  const isAuthPath = path === '/chamber-demo/auth';
  const PUBLIC_PATHS = ['/chamber-demo/', '/chamber-demo/directory', '/chamber-demo/events',
    '/chamber-demo/join', '/chamber-demo/member-login', '/chamber-demo/member-consume'];
  const isPublic = !isAuthPath && (isAsset || path.startsWith('/chamber-demo/assets/') || PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/')));

  // Auth form handler
  if (isAuthPath && request.method === 'POST') {
    const form = await request.formData();
    const pass = form.get('password');
    const ref  = form.get('ref') || '/chamber-demo/';
    if (pass === PASS_HASH) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location'    : ref,
          'Set-Cookie' : `${AUTH_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
          'Content-Type': 'text/plain',
        },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { 'Location': ref + '?error=1' },
    });
  }

  // Check auth cookie — block non-public routes without cookie
  if (!isPublic) {
    const cookies = request.headers.get('Cookie') || '';
    if (!cookies.includes(`${AUTH_COOKIE}=1`)) {
      return new Response(LOGIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  }

  // Root redirect
  if (path === '/chamber-demo') {
    return new Response(null, {
      status: 301,
      headers: { 'Location': '/chamber-demo/' }
    });
  }

  // Serve embedded CSS and JS BEFORE page routing
  if (path === '/chamber-demo/chamber-ui.css') {
    return new Response(PAGES['chamber-ui.css'](), { headers: { 'Content-Type': 'text/css' } });
  }
  if (path === '/chamber-demo/chamber-ui.js') {
    return new Response(PAGES['chamber-ui.js'](), { headers: { 'Content-Type': 'application/javascript' } });
  }

  // Serve embedded HTML pages
  if (path === '/chamber-demo/') {
    return new Response(PAGES['chamber-demo'](), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // Serve embedded assets directly (no origin proxy needed)
  if (path.startsWith('/chamber-demo/assets/')) {
    const b64 = ASSETS[path];
    if (b64) {
      const ext = path.substring(path.lastIndexOf('.'));
      const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
      return new Response(decodeB64Asset(b64), {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
      });
    }
    // Fallback proxy for non-embedded assets (station images)
    const assetPath = path.replace('/chamber-demo/assets/', '/demo/assets/');
    const ext = path.substring(path.lastIndexOf('.'));
    const res = await fetch(`https://aloomii.com${assetPath}`);
    if (res.ok) {
      const rawCT = res.headers.get('Content-Type') || '';
      if (rawCT.includes('text/html') && ext !== '.html') {
        return new Response(`Asset not found: ${assetPath}`, { status: 404 });
      }
      const contentType = CONTENT_TYPES[ext] || rawCT || 'application/octet-stream';
      return new Response(res.body, {
        status: res.status,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
      });
    }
    return new Response(`Asset not found: ${assetPath}`, { status: 404 });
  }

  const k = pageKey(path);
  if (PAGES[k]) {
    return new Response(PAGES[k](), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  return new Response('Not found', { status: 404 });
}

export default { fetch: handleRequest };
"""

auth_js = re.sub(r'\n{3,}', '\n\n', auth_js.strip())
out_path = Path("/Users/superhana/Desktop/aloomii/chamber-worker/auth.js")
out_path.write_text(auth_js)
size = len(auth_js)
print(f"  Written: {size:,} bytes ({size//1024}KB)")

r = subprocess.run(["node", "--check", str(out_path)], capture_output=True, text=True)
print(f"  Syntax: {'OK' if r.returncode == 0 else r.stderr[:300]}")
