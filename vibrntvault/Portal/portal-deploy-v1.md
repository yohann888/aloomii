# Aloomii Portal — Deployment Guide & Technical Specs
**Version:** v1.1 | **Status:** Reviewed by Gemini 3.1 Pro + GPT-5.4 | **Updated:** 2026-04-19

---

## Changelog v1.1
- Neon as separate DB (not self-hosted + portal schema) — resolves Cloudflare Pages TCP limitation
- Added `body_markdown` + `source_path` to `content_items`
- Added `webhook_events` table for idempotency
- Fixed Gumroad to 3 products (not 1)
- Fixed Clerk middleware to protect API routes
- Fixed `purchases` FK: `ON DELETE SET NULL` not `CASCADE`
- Fixed webhook idempotency: `ON CONFLICT DO NOTHING`
- Added `user.updated` + `user.deleted` Clerk webhook handlers
- Added email case normalization in app layer
- Removed risky partial unique index on unclaimed purchases
- Added `price_cents >= 0` CHECK constraint
- Added `claimed_at` + `revoked_reason` to purchases
- Added `view_count >= 0` CHECK to user_content_state

---

## 1. Product Summary

**What:** A gated web portal at `app.aloomii.com` delivering the Aloomii Playbook ($99 digital product) across three editions: Founder, Solo, Operator.

**Core deliverable:** A curated library of AI prompts, tools, and workflows with personal state tracking (favorites, status, notes) per user.

**North star metric:** Weekly active buyers / total buyers at day 30 post-purchase. Target 40-50%.

**Why it exists:** Not to sell an ebook. To build Aloomii's platform layer. The Playbook is the first product on infrastructure that compounds across the entire product ladder: future digital products, client backends, Studio Membership, The Table.

---

## 2. Architecture

### Stack
| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | SSR, API routes, Clerk middleware |
| Database | Neon Postgres (separate DB) | WebSocket-native, edge-compatible |
| Auth | Clerk | Handles sign-up, login, email/password, OAuth |
| Payments | Gumroad | Checkout, webhooks for access grant/revoke |
| Hosting | Cloudflare Pages | Fast, cheap, native Cloudflare integration |
| Content source | Git (Markdown files) | DB stores full Markdown; Git is truth |

### Why Neon (not self-hosted Postgres)
Cloudflare Pages runs on V8 Isolates at the edge — no raw TCP socket access. Neon speaks WebSocket natively, which Cloudflare Workers can use directly. Aloomii's existing CRM stays on self-hosted Postgres 18. The Portal gets its own Neon project (`aloomii-portal`). Completely separate DBs, no shared connection, no bleed risk.

### Git Content Sync
Markdown files in Git (GitHub repo: `yohann888/aloomii-playbook`) are the source of truth. A sync script runs on deploy and on demand:
1. Read all `.md` files from `content/` directory
2. Parse frontmatter for metadata + extract body Markdown
3. Hash each file (`SHA-256`)
4. Upsert into `content_items` (skip if hash matches existing record)

---

## 3. Database Schema (Neon — portal DB)

All tables in `public` schema of the Neon `aloomii-portal` database.

### Tables

#### users
```sql
CREATE TABLE users (
  clerk_user_id    TEXT PRIMARY KEY,
  email            TEXT NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  organization_id  TEXT NOT NULL DEFAULT 'aloomii',
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at   TIMESTAMPTZ,

  CONSTRAINT users_email_unique UNIQUE (email)
);
CREATE INDEX ON users(last_active_at DESC);
CREATE INDEX ON users(organization_id);
```

#### webhook_events
Raw webhook log. Every incoming webhook written here before processing. Enables idempotency, debugging, replay.
```sql
CREATE TABLE webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL CHECK (provider IN ('clerk', 'gumroad')),
  event_type      TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  raw_payload     JSONB NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  processing_result TEXT,
  error_message   TEXT,

  CONSTRAINT webhook_events_provider_external_unique
    UNIQUE (provider, external_id)
);
CREATE INDEX ON webhook_events(provider, received_at DESC);
```

**Idempotency pattern:**
```sql
INSERT INTO webhook_events (id, provider, event_type, external_id, raw_payload)
VALUES (gen_random_uuid(), $provider, $event_type, $external_id, $payload)
ON CONFLICT (provider, external_id) DO NOTHING
RETURNING id;
-- If no row returned: already processed, skip
```

#### topics
```sql
CREATE TABLE topics (
  topic_slug     TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  is_available   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER DEFAULT 0,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON topics(sort_order) WHERE is_available = TRUE;
```

#### products
```sql
CREATE TABLE products (
  product_slug     TEXT PRIMARY KEY,
  topic_slug       TEXT NOT NULL REFERENCES topics(topic_slug) ON UPDATE CASCADE,
  playbook_family  TEXT NOT NULL DEFAULT 'playbook',
  edition          TEXT NOT NULL CHECK (edition IN ('founder','solo','operator')),
  name             TEXT NOT NULL,
  short_name       TEXT,
  description      TEXT,
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  gumroad_product_id TEXT,
  organization_id  TEXT NOT NULL DEFAULT 'aloomii',
  metadata         JSONB NOT NULL DEFAULT '{}',
  is_available     BOOLEAN NOT NULL DEFAULT TRUE,
  launched_at      TIMESTAMPTZ,
  deprecated_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON products(topic_slug) WHERE is_available = TRUE;
CREATE INDEX ON products(gumroad_product_id) WHERE gumroad_product_id IS NOT NULL;
CREATE UNIQUE INDEX ON products(topic_slug, playbook_family, edition)
  WHERE is_available = TRUE;
```

#### purchases
`ON DELETE SET NULL` on `clerk_user_id` preserves audit trail if user is deleted.
```sql
CREATE TABLE purchases (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT REFERENCES users(clerk_user_id) ON DELETE SET NULL,
  buyer_email             TEXT NOT NULL,
  product_slug            TEXT NOT NULL REFERENCES products(product_slug) ON UPDATE CASCADE,
  payment_provider        TEXT NOT NULL,
  external_purchase_id    TEXT NOT NULL,
  external_subscription_id TEXT,
  price_paid_cents        INTEGER CHECK (price_paid_cents >= 0),
  status                  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','refunded','chargeback','canceled','past_due','paused')),
  refunded_at             TIMESTAMPTZ,
  claimed_at              TIMESTAMPTZ,
  access_granted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_revoked_at       TIMESTAMPTZ,
  revoked_reason          TEXT,
  expires_at              TIMESTAMPTZ,
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT purchases_provider_purchase_unique
    UNIQUE (payment_provider, external_purchase_id)
);
CREATE INDEX ON purchases(clerk_user_id);
CREATE INDEX ON purchases(buyer_email) WHERE clerk_user_id IS NULL;
CREATE INDEX ON purchases(product_slug);
CREATE INDEX ON purchases(status) WHERE status = 'active';
CREATE UNIQUE INDEX ON purchases(clerk_user_id, product_slug)
  WHERE status = 'active' AND clerk_user_id IS NOT NULL;
```

#### content_items
Full Markdown body stored here. `source_path` = file path in Git. `content_hash` = SHA-256 for change detection.
```sql
CREATE TABLE content_items (
  content_slug      TEXT PRIMARY KEY,
  topic_slug        TEXT NOT NULL REFERENCES topics(topic_slug) ON UPDATE CASCADE,
  content_type      TEXT NOT NULL CHECK (content_type IN ('prompt','tool','workflow','swipe')),
  title             TEXT NOT NULL,
  category          TEXT,
  tags              TEXT[],
  edition_affinity  TEXT[] DEFAULT '{}',
  is_published      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER DEFAULT 0,
  difficulty        TEXT CHECK (difficulty IN ('beginner','intermediate','advanced')),
  time_minutes      INTEGER CHECK (time_minutes > 0),
  body_markdown     TEXT NOT NULL,
  source_path       TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT content_items_hash_length CHECK (char_length(content_hash) = 64)
);
CREATE INDEX ON content_items(topic_slug) WHERE is_published = TRUE;
CREATE INDEX ON content_items(content_type) WHERE is_published = TRUE;
CREATE INDEX ON content_items(category) WHERE is_published = TRUE;
CREATE INDEX ON content_items USING GIN (tags);
CREATE INDEX ON content_items USING GIN (edition_affinity);
```

#### user_content_state
The stickiness engine. `status` defaults to `'untried'`. `ON DELETE RESTRICT` prevents hard-deleting content that has user notes.
```sql
CREATE TABLE user_content_state (
  clerk_user_id     TEXT NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  content_slug      TEXT NOT NULL REFERENCES content_items(content_slug)
                      ON UPDATE CASCADE ON DELETE RESTRICT,
  is_favorite       BOOLEAN NOT NULL DEFAULT FALSE,
  status            TEXT CHECK (status IN ('untried','tested','customized')) DEFAULT 'untried',
  personal_notes    TEXT,
  favorited_at      TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ,
  last_viewed_at    TIMESTAMPTZ,
  view_count        INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (clerk_user_id, content_slug)
);
CREATE INDEX ON user_content_state(clerk_user_id, favorited_at DESC)
  WHERE is_favorite = TRUE;
CREATE INDEX ON user_content_state(clerk_user_id, status, status_changed_at DESC)
  WHERE status IS NOT NULL;
CREATE INDEX ON user_content_state(clerk_user_id, last_viewed_at DESC)
  WHERE last_viewed_at IS NOT NULL;
```

#### usage_events
```sql
CREATE TABLE usage_events (
  id            BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT REFERENCES users(clerk_user_id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  content_slug  TEXT,
  topic_slug    TEXT,
  product_slug  TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  session_id    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON usage_events(clerk_user_id, created_at DESC);
CREATE INDEX ON usage_events(event_type, created_at DESC);
CREATE INDEX ON usage_events(content_slug, created_at DESC) WHERE content_slug IS NOT NULL;
```

#### updates
```sql
CREATE TABLE updates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  body_markdown        TEXT NOT NULL,
  update_type          TEXT NOT NULL
    CHECK (update_type IN ('new_content','improvement','fix','announcement')),
  topic_slug           TEXT REFERENCES topics(topic_slug) ON UPDATE CASCADE ON DELETE SET NULL,
  product_slug          TEXT REFERENCES products(product_slug) ON UPDATE CASCADE ON DELETE SET NULL,
  related_content_slug  TEXT REFERENCES content_items(content_slug) ON UPDATE CASCADE ON DELETE SET NULL,
  editions             TEXT[],
  is_published         BOOLEAN NOT NULL DEFAULT TRUE,
  published_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON updates(published_at DESC) WHERE is_published = TRUE;
CREATE INDEX ON updates USING GIN (editions);
```

### Views

#### active_buyers
```sql
CREATE VIEW active_buyers AS
SELECT
  u.clerk_user_id, u.email, u.first_name, u.organization_id, u.last_active_at,
  p.product_slug, pr.topic_slug, pr.playbook_family, pr.edition,
  p.payment_provider, p.access_granted_at, p.expires_at,
  CASE
    WHEN u.last_active_at > NOW() - INTERVAL '7 days'  THEN 'weekly_active'
    WHEN u.last_active_at > NOW() - INTERVAL '30 days' THEN 'monthly_active'
    ELSE 'inactive'
  END AS activity_status
FROM users u
JOIN purchases p ON p.clerk_user_id = u.clerk_user_id
JOIN products pr ON pr.product_slug = p.product_slug
WHERE p.status = 'active'
  AND (p.expires_at IS NULL OR p.expires_at > NOW());
```

#### user_editions
```sql
CREATE VIEW user_editions AS
SELECT DISTINCT ON (u.clerk_user_id, pr.topic_slug)
  u.clerk_user_id, pr.topic_slug, pr.playbook_family, pr.edition
FROM users u
JOIN purchases p ON p.clerk_user_id = u.clerk_user_id
JOIN products pr ON pr.product_slug = p.product_slug
WHERE p.status = 'active'
  AND (p.expires_at IS NULL OR p.expires_at > NOW())
ORDER BY u.clerk_user_id, pr.topic_slug;
```

---

## 4. Authentication (Clerk)

### Setup
1. Clerk application (Web type)
2. Redirect URLs: `https://app.aloomii.com/`, `https://app.aloomii.com/app`
3. Webhook URL: `https://app.aloomii.com/api/webhooks/clerk`
4. Env vars: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

### Clerk Webhooks (all three required)
- `user.created` — upsert users record
- `user.updated` — sync first_name, last_name, email changes
- `user.deleted` — delete users (purchases set clerk_user_id NULL via FK)

### Webhook Signature Verification
**Mandatory.** Verify `svix-signature` header using the `svix` package:
```typescript
import { Webhook } from 'svix';
const webhook = new Webhook(CLERK_SECRET_KEY);
webhook.verify(rawBody, req.headers); // throws on mismatch
```

### Middleware (Clerk v5)
```typescript
// middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';

export const clerk = clerkMiddleware({
  publicRoutes: ['/', '/api/webhooks/clerk', '/api/webhooks/gumroad'],
});

export const config = {
  matcher: [
    '/((?!.*\\..*|_next).*)',
    '/api/webhooks/:path*',
    '/api/content/:path*',
    '/api/sync/:path*',
  ],
};
```

### Server-Side Access Check
```typescript
// lib/access.ts
export async function hasActiveAccess(clerkUserId: string, productSlug: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT 1 FROM purchases
    WHERE clerk_user_id = $1 AND product_slug = $2
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
  `, [clerkUserId, productSlug]);
  return result.rows.length > 0;
}

export async function getUserEditions(clerkUserId: string, topicSlug: string): Promise<string[]> {
  const result = await pool.query(`
    SELECT array_agg(DISTINCT edition) AS editions
    FROM user_editions
    WHERE clerk_user_id = $1 AND topic_slug = $2
  `, [clerkUserId, topicSlug]);
  return result.rows[0]?.editions ?? [];
}
```

---

## 5. Payments (Gumroad)

### Products
Three separate Gumroad products, one per edition. Add `gumroad_product_id` to products table after creation.

### Webhook Handler (full idempotent flow)
```typescript
export async function POST(req: Request) {
  const rawBody = await req.text();

  // 1. Verify signature
  verifyGumroadSignature(rawBody, req.headers.get('x-gumroad-signature'));

  // 2. Deduplicate via webhook_events
  const { id: eventId } = await pool.query(`
    INSERT INTO webhook_events (id, provider, external_id, event_type, raw_payload)
    VALUES (gen_random_uuid(), 'gumroad', $1, $2, $3::jsonb)
    ON CONFLICT (provider, external_id) DO NOTHING
    RETURNING id
  `, [formData.purchase.id, formData.purchase.status, JSON.stringify(formData)]);

  if (!eventId) {
    return NextResponse.json({ ok: true, note: 'already_processed' });
  }

  // 3. Process by status
  const status = formData.purchase?.status ?? formData.status;
  switch (status) {
    case 'active':     await handleActive(formData);     break;
    case 'refunded':   await handleRefunded(formData);   break;
    case 'chargeback': await handleChargeback(formData); break;
    case 'canceled':   await handleCanceled(formData);   break;
    case 'past_due':   await handlePastDue(formData);    break;
  }

  // 4. Mark processed
  await pool.query(
    'UPDATE webhook_events SET processed_at = NOW() WHERE id = $1',
    [eventId]
  );

  return NextResponse.json({ ok: true });
}
```

### Account Claiming (Apple Pay masked email)
```typescript
// POST /api/claim — Body: { purchaseId: string }
await pool.query(`
  UPDATE purchases
  SET clerk_user_id = $1, claimed_at = NOW(), updated_at = NOW()
  WHERE payment_provider = 'gumroad'
    AND external_purchase_id = $2
    AND clerk_user_id IS NULL
    AND status = 'active'
  RETURNING id
`, [clerkUserId, purchaseId]);
```

---

## 6. Next.js Application Structure

```
aloomii-portal/
├── app/
│   ├── page.tsx                   # Landing / marketing page
│   ├── app/
│   │   ├── layout.tsx            # ClerkProvider + shell
│   │   ├── page.tsx             # Home dashboard
│   │   ├── prompts/page.tsx
│   │   ├── tools/page.tsx
│   │   ├── workflows/page.tsx
│   │   ├── favorites/page.tsx
│   │   ├── claim/page.tsx       # Apple Pay claim flow
│   │   └── content/[slug]/page.tsx
│   ├── api/
│   │   ├── webhooks/clerk/route.ts
│   │   ├── webhooks/gumroad/route.ts
│   │   ├── content/route.ts
│   │   ├── claim/route.ts
│   │   └── sync/route.ts        # Admin only
│   └── layout.tsx
├── components/
│   ├── AloomiPortal.tsx          # The v1 UI component
│   └── ...
├── lib/
│   ├── db.ts                     # Neon connection pool
│   ├── access.ts                  # hasActiveAccess, getUserEditions
│   ├── gumroad.ts                 # Signature verification + parsing
│   └── email.ts                   # normalizeEmail: lower(trim(email))
├── scripts/
│   └── sync-content.ts            # Git → content_items
├── content/                       # Markdown source of truth
│   ├── ai/
│   │   ├── prompts/
│   │   ├── tools/
│   │   └── workflows/
│   └── README.md
├── middleware.ts
└── package.json
```

---

## 7. Deployment

### Cloudflare Pages
1. Connect `yohann888/aloomii-portal` repo
2. Build command: `npm run build`, output: `.next`
3. Environment variables in Cloudflare dashboard
4. Custom domain: `app.aloomii.com`

### Env vars
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/aloomii-portal?sslmode=require
GUMROAD_SECRET_KEY=...
NEXT_PUBLIC_APP_URL=https://app.aloomii.com
```

### GitHub Actions: Content Sync
On push to `main`:
```yaml
- name: Sync content
  run: npx ts-node scripts/sync-content.ts
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Pre-Launch Checklist
- [ ] Neon project `aloomii-portal` created
- [ ] Clerk app with redirect URLs + webhook URL
- [ ] Three Gumroad products (Founder / Solo / Operator)
- [ ] Migration applied to Neon DB
- [ ] Seed data: topic `ai`, three products
- [ ] All env vars in Cloudflare Pages
- [ ] `app.aloomii.com` DNS + SSL verified
- [ ] Test purchase flow end-to-end
- [ ] Yohann's Clerk user ID added (dev admin)

---

## 8. What Not to Build v1

- User-generated content or community features
- AI prompt execution inside the portal (v2 scope)
- Multiple topics beyond `ai`
- White-label or client portal variants
- Subscription billing beyond Gumroad
- Admin UI (DB edits acceptable for v1)
- Mobile app or PWA

---

## 9. Open Questions

1. **Gumroad product IDs?** Three products need Gumroad IDs. (Yohann to provide)
2. **Clerk user ID for Yohann?** For dev admin access. (Yohann to provide)
3. **Real Markdown content?** The v1 component has hardcoded sample prompts. When does actual content get written?
4. **Claim UI `/app/claim`?** User inputs Gumroad purchase ID to link Apple Pay masked-email purchase.
5. **Neon branch strategy?** Separate dev/staging branch on Neon?
