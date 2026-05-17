# Aloomii Local SEO Competency Plan

**Version:** 1.0  
**Date:** 2026-05-16  
**Author:** Leo (Chief of Staff)  
**Model:** Kimi K2.6  
**Status:** Draft — pending Yohann review

---

## Executive Summary

Build a Local SEO competency we can dog-food on Aloomii first, then sell to local businesses in Hamilton and surrounding areas. The service targets the 32-36% GBP signal weight and layers in AI automation for scale.

**Thesis:** Local SEO is a recurring, measurable service with clear deliverables — perfect for our AI + human review model. We prove it on ourselves, then sell the playbook.

---

## 1. Competency Design

### Service Tiers

| Tier | Price | Target | Deliverables |
|------|-------|--------|--------------|
| **Basic** | $497/mo | Solo practitioners, contractors | GBP optimization, 2 reviews/mo, 1 local page, NAP audit |
| **Growth** | $1,497/mo | Small firms (3-10 staff) | Everything in Basic + 4 reviews/mo, 2 local pages, citation building, monthly reporting |
| **Dominance** | $2,997/mo | Competitive markets (dentists, attorneys) | Everything in Growth + 8 reviews/mo, schema automation, link building, GBP posts 2x/week, behavioral tracking |

**AI vs Human Split:**
- **AI (80%):** GBP post generation, review response drafting, schema markup, citation monitoring, rank tracking, content outlines
- **Human (20%):** GBP category selection, review authenticity check, backlink quality approval, client communication, strategy pivots

### Required Tools / Tech Stack

| Tool | Purpose | Cost | Integration |
|------|---------|------|-------------|
| Google Business Profile API | GBP data, posts, reviews | Free | Custom integration |
| BrightLocal or WhiteSpark | Citation tracking, rank monitoring | ~$79/mo | API or manual CSV |
| ReviewTrackers or Podium | Review aggregation + responses | ~$200/mo | Webhook → our system |
| Screaming Frog or Sitebulb | On-page audit | ~$200/yr | One-time exports |
| Schema Pro or custom | JSON-LD schema generation | Free (custom) | Built into our platform |
| Google Search Console API | Performance data | Free | Custom integration |
| Google Analytics 4 API | Behavioral signals | Free | Custom integration |

**Total tool cost per client:** ~$100-300/mo depending on tier.

### Agent Fleet Extensions

1. **local-gbp-agent** — Monitors GBP, drafts posts, flags review velocity drops
2. **local-review-agent** — Generates review response drafts, monitors sentiment, alerts on negative trends
3. **local-citation-agent** — Scans directories for NAP consistency, flags mismatches
4. **local-content-agent** — Generates location page outlines, local blog topics, schema markup
5. **local-rank-tracker** — Daily rank checks for target keywords, alerts on drops

---

## 2. Dog Food Plan (Apply to Aloomii)

### Aloomii's Local Context
- **Base:** Hamilton, Ontario
- **Service area:** Hamilton, Toronto, Burlington, Oakville, Kitchener-Waterloo, Guelph, Brantford (SAB model)
- **Current local presence:** Minimal — no GBP, no local pages, no NAP footprint

### 30-60-90 Day Execution Plan

#### Days 1-30: Foundation
**Week 1: GBP + NAP**
- [ ] Create/claim Aloomii Google Business Profile
  - Primary category: "Marketing Consultant" or "Business Consultant" (test both)
  - Secondary: "Internet Marketing Service", "Business Development Service"
  - Description: AI-powered GTM for B2B founders in Ontario
  - Photos: Team (Yohann + Jenny), office/workspace, Hamilton landmarks
  - Services: "AI Sales Intelligence", "Founder GTM Sprint", "B2B Pipeline Building"
  - Hours: Set accurately (even if by appointment)
  - Attributes: Women-led (Jenny), Online appointments, On-site services
- [ ] Run NAP audit — search "Aloomii" + variations across web
- [ ] Standardize NAP: Name, Address, Phone across all properties
- [ ] Add Aloomii to: Apple Business Connect, Bing Places, Yelp (if relevant), LinkedIn Company Page

**Week 2: On-Page**
- [ ] Create `/local` page on aloomii.com:
  - Title: "B2B GTM Services for Founders in Hamilton & Toronto | Aloomii"
  - H1: "AI-Powered GTM for Ontario Founders"
  - Content: Local stats, founder density in Hamilton/Toronto, Ontario-specific pain points
  - Schema: LocalBusiness JSON-LD
  - NAP in footer sitewide
- [ ] Create city-specific service pages:
  - `/hamilton-b2b-gtm`
  - `/toronto-founder-sales`
  - `/ontario-startup-marketing`
- [ ] Internal link from blog posts to local pages

**Week 3: Review System**
- [ ] Build review request workflow:
  - Post-client offboarding: auto-send review request (email + SMS)
  - Template: Google review link + 3 prompts ("What was your biggest win?", "How did Aloomii change your pipeline?", "Would you recommend us?")
  - Incentivize: Mention reviews help other Ontario founders
- [ ] Get 5 seed reviews from:
  - Past clients (Westland, BiS, SpiceNet if willing)
  - Partners (Village.do, Gamma)
  - Podcast guests who benefited

**Week 4: Citation + Directory**
- [ ] Submit to 20+ directories:
  - Canada-specific: YellowPages.ca, Canada411, Yelp.ca
  - Industry: Clutch.co, GoodFirms, G2 (if applicable)
  - Local: Hamilton Chamber of Commerce, Toronto Board of Trade
  - Founder-focused: IndieHackers, Product Hunt
- [ ] Ensure 100% NAP match across all

#### Days 31-60: Content + Links
**Week 5-6: Local Content**
- [ ] Publish 4 blog posts:
  1. "Why Hamilton is the Hidden Gem for B2B Founders in Ontario"
  2. "Toronto Startup Founders: 5 GTM Mistakes That Kill Pipeline"
  3. "How Ontario's Manufacturing Legacy Creates Modern SaaS Opportunities"
  4. "From Kitchener to King Street: Scaling B2B Sales Across Ontario"
- [ ] Each post: 1,500+ words, local keywords, link to `/local` and city pages
- [ ] LocalBusiness schema on every page

**Week 7-8: Link Building**
- [ ] Guest post / get mentioned:
  - Hamilton Economic Development blog
  - Toronto Star / Globe and Mail (small business section)
  - Ontario startup newsletters (Betakit, Communitech)
  - Local podcast: "The Hamilton Podcast", "Toronto Tech Talks"
- [ ] Sponsor or speak at:
  - Hamilton Tech Week
  - Toronto Startup Fest (even virtual)
  - Communitech events in Kitchener
- [ ] Unstructured mentions:
  - Get Aloomii mentioned in Reddit r/Hamilton, r/toronto, r/Entrepreneur (organic, not spam)
  - HARO (Help A Reporter Out) — respond to journalist queries about AI + SMBs

#### Days 61-90: Scale + Measure
**Week 9-10: Behavioral Optimization**
- [ ] Add UTM tracking to GBP posts
- [ ] A/B test GBP post types: tips vs. client wins vs. questions
- [ ] Track: clicks-to-call, direction requests, website visits from GBP
- [ ] Optimize for "open now" + "near me" queries

**Week 11-12: Advanced Signals**
- [ ] Implement LocalBusiness schema with `areaServed` for all Ontario cities
- [ ] Add `hasOfferCatalog` schema for service listings
- [ ] Set up Google Search Console geo-targeting
- [ ] Build simple dashboard: rank positions, GBP insights, review velocity, citation score

### Local Keywords for Aloomii

| Keyword | Volume | Intent | Page |
|---------|--------|--------|------|
| "B2B sales Hamilton" | Low | Service | `/hamilton-b2b-gtm` |
| "founder GTM Toronto" | Low | Service | `/toronto-founder-sales` |
| "AI sales Ontario" | Low | Service | `/local` |
| "startup marketing Kitchener" | Low | Service | `/ontario-startup-marketing` |
| "one-person business sales" | Medium | Informational | Blog post |
| "how to get B2B clients Ontario" | Low | Informational | Blog post |
| "SaaS founder Hamilton" | Very Low | Service | `/hamilton-b2b-gtm` |

**Strategy:** Target low-volume, high-intent service keywords. Informational content captures broader searches and links to service pages.

---

## 3. System Integration

### New DB Tables

```sql
-- Local SEO client configuration
CREATE TABLE local_seo_clients (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES contacts(id),
    tier TEXT NOT NULL CHECK (tier IN ('basic', 'growth', 'dominance')),
    gbp_url TEXT,
    gbp_place_id TEXT,
    primary_category TEXT,
    secondary_categories TEXT[],
    service_area TEXT[], -- for SABs
    target_keywords TEXT[],
    competitor_gbp_ids TEXT[],
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GBP performance metrics
CREATE TABLE gbp_metrics (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES contacts(id),
    date DATE NOT NULL,
    views_search INTEGER,
    views_maps INTEGER,
    clicks_website INTEGER,
    clicks_phone INTEGER,
    clicks_directions INTEGER,
    photo_views INTEGER,
    post_views INTEGER,
    query_count INTEGER,
    UNIQUE(client_id, date)
);

-- Review tracking
CREATE TABLE gbp_reviews (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES contacts(id),
    review_id TEXT UNIQUE NOT NULL,
    reviewer_name TEXT,
    rating INTEGER,
    comment TEXT,
    sentiment_score NUMERIC(3,2),
    keywords TEXT[],
    responded BOOLEAN DEFAULT FALSE,
    response_text TEXT,
    review_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Citation tracking
CREATE TABLE citations (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES contacts(id),
    directory_name TEXT NOT NULL,
    directory_url TEXT,
    nap_match_score NUMERIC(3,2),
    listing_url TEXT,
    status TEXT DEFAULT 'pending', -- pending, live, needs_update, missing
    last_checked TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rank tracking
CREATE TABLE local_rankings (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES contacts(id),
    keyword TEXT NOT NULL,
    location TEXT NOT NULL, -- "Hamilton, ON" or lat,lng
    rank_position INTEGER,
    map_pack_position INTEGER, -- 1-3 or null if not in pack
    search_volume INTEGER,
    tracked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, keyword, location, DATE(tracked_at))
);
```

### New Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `gbp-metrics-sync` | Daily at 06:00 | Pull GBP insights via API |
| `review-monitor` | Every 2 hours | Check for new reviews, flag negative sentiment |
| `citation-audit` | Weekly (Sundays) | Scan directories for NAP consistency |
| `rank-tracker` | Daily at 04:00 | Check rank positions for target keywords |
| `gbp-post-generator` | 2x/week (Mon/Thu) | Draft GBP posts for human approval |
| `local-content-queue` | Weekly | Generate blog/page outlines for review |
| `competitor-monitor` | Weekly | Track competitor GBP changes, reviews, posts |

### Command Center UI Panels

Add to `dashboard.aloomii.com` / Command Center:

1. **Local SEO Overview Card** (per client)
   - GBP health score (0-100)
   - Review velocity (last 30 days)
   - Rank positions for top 5 keywords
   - Citation consistency score
   - Last audit date

2. **GBP Activity Feed**
   - Posts published (with engagement)
   - New reviews (with sentiment)
   - Photo uploads
   - Q&A activity

3. **Rank Tracking Chart**
   - Line chart: rank position over time for each keyword
   - Map pack indicator (in pack / not in pack)
   - Competitor comparison (optional)

4. **Review Management Panel**
   - New reviews requiring response
   - Response drafts (AI-generated)
   - Sentiment trend (positive/neutral/negative over time)
   - Review request campaign status

5. **Citation Health Matrix**
   - Grid: directories × NAP fields
   - Green/yellow/red for match status
   - One-click "fix" button (generates correction instructions)

### API Endpoints to Add

```
GET  /api/local-seo/clients              # List local SEO clients
GET  /api/local-seo/:clientId/overview    # Health score + metrics
GET  /api/local-seo/:clientId/rankings   # Rank tracking data
GET  /api/local-seo/:clientId/reviews    # Reviews + responses
POST /api/local-seo/:clientId/reviews/:id/respond  # Submit response
GET  /api/local-seo/:clientId/citations  # Citation matrix
POST /api/local-seo/:clientId/gbp-post  # Create GBP post draft
GET  /api/local-seo/:clientId/competitors # Competitor tracking
```

### Integration with Existing Systems

- **Contacts table:** Add `local_seo_client` boolean, `gbp_place_id`
- **Signal Scout:** Extend to monitor local competitor mentions ("best [service] in [city]")
- **Content Engine:** Add "local SEO content" mode — generates city-specific blog posts, GBP posts
- **UGC Farm:** Repurpose local customer stories/reviews into GBP posts, short-form content
- **Client Dashboard:** New "Local SEO" tab alongside existing pipeline/revenue views

---

## 4. Go-to-Market for Locals

### First Local ICP

**Profile:** Solo attorneys and small law firms (2-5 partners) in Hamilton, Burlington, Oakville

**Why them:**
- High lifetime value per client ($3K-$50K+ per case)
- Local SEO is existential ("personal injury lawyer Hamilton" is high-intent)
- Currently paying $2K-$5K/mo to agencies with opaque reporting
- Can afford $1,497-$2,997/mo
- Clear ROI measurement: one new client pays for 6-12 months of service

**Pain points:**
- "My last agency took 6 months to show any results"
- "I don't know what they're actually doing"
- "Reviews are a nightmare to manage"
- "I show up on page 2 for my own name"

### Positioning: "AI-Powered Local SEO" vs Traditional Agencies

**The pitch:**
> "Most agencies bill you for hours you'll never see. We bill for outcomes you can verify every week. Our AI monitors your rankings 24/7, drafts responses to reviews before you wake up, and posts to your GBP twice a week — every output reviewed by a human before it goes live. You see every action in your dashboard. No black box."

**Differentiators:**
1. **Transparent:** Every action logged in client dashboard
2. **Fast:** GBP posts go live same-day, not next week
3. **Accountable:** Rank tracking + GBP metrics visible 24/7
4. **Proven:** We used this system to build our own local presence first

### Proof from Dog-Fooding

After 90 days on ourselves:
- **Metric 1:** Aloomii ranks #1-3 for "B2B GTM Hamilton" (if achieved)
- **Metric 2:** 15+ reviews on GBP (if achieved)
- **Metric 3:** 200%+ increase in GBP views/clicks (if achieved)
- **Metric 4:** 5+ local backlinks/mentions (if achieved)
- **Asset:** Before/after dashboard screenshots
- **Asset:** Case study blog post: "How We Built Aloomii's Local Presence in 90 Days"

### Pricing vs Current Sprint

| Service | Price | Client Type |
|---------|-------|-------------|
| The Sprint (current) | $3,000/mo | B2B founders, remote/SAAS |
| Local SEO — Basic | $497/mo | Solo practitioners |
| Local SEO — Growth | $1,497/mo | Small firms (3-10) |
| Local SEO — Dominance | $2,997/mo | Competitive markets |

**Cross-sell opportunity:** Local SEO clients who are also B2B founders → upgrade to Sprint for broader GTM.

### Sales Motion

1. **Lead source:**
   - GBP search: "SEO agency Hamilton" (eat our own dog food)
   - Local events: Hamilton Chamber networking, Toronto Startup Fest
   - Referrals: existing clients with local connections
   - Content: "How a Hamilton Law Firm Got 10x More Clients from Google"

2. **Discovery call (30 min):**
   - Audit their GBP live during the call
   - Show 3 competitor GBPs that are beating them
   - Identify 2 quick wins they can do today
   - Present 90-day roadmap

3. **Close:**
   - No contract, month-to-month (differentiator from agency 6-month lock-ins)
   - First month 50% off if they commit within 48 hours
   - Money-back guarantee if no rank improvement in 60 days

---

## 5. Next Steps (This Week)

### Immediate Actions (Days 1-3)

1. **Yohann to review this plan** — approve/modify tiers, pricing, ICP
2. **Create Aloomii GBP** — Yohann + Jenny photos, service descriptions
3. **Audit current NAP** — search "Aloomii" everywhere, document inconsistencies
4. **Add local_seo_clients table** — run migration, test schema
5. **Research 3 competitor law firm GBPs** — document what's working

### Week 1 Commitments

- [ ] GBP created and verified
- [ ] `/local` page drafted (AI) + human review
- [ ] 5 seed review requests sent
- [ ] NAP 100% consistent across 5+ directories
- [ ] `local-gbp-agent` cron job scaffolded

### 30-Day Success Metrics

| Metric | Target |
|--------|--------|
| GBP created + verified | 100% |
| Reviews on GBP | 5+ |
| Local pages published | 4+ |
| Directories submitted | 20+ |
| NAP consistency score | 100% |
| First local keyword ranking | Top 10 for 1 keyword |

---

## 6. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| GBP verification delays | Medium | Use real address, verify via postcard/video call |
| Review generation slow | Medium | Start with warm contacts, build automated workflow |
| Algorithm update shifts weights | Low | Monitor Google announcements, pivot within 30 days |
| Local competition high (Toronto) | High | Focus on Hamilton/Burlington first, prove then expand |
| Client churn if no quick wins | Medium | Promise 60-day rank improvement guarantee |
| Tool costs eat margin | Low | Start with free tools, upgrade only when client count justifies |

---

## Appendix: GBP Post Templates (AI-Generated)

### Template 1: Client Win
```
[Service] just helped a [industry] founder in [city] [specific outcome].

"[Short quote from client]"

If you're a [ICP] in [region] struggling with [pain], let's talk.

[CTA: Book a free 15-min audit]
```

### Template 2: Tip/Insight
```
3 things [ICP] in [city] should know about [topic]:

1. [Specific tip]
2. [Specific tip]
3. [Specific tip]

Which one surprised you? Comment below.
```

### Template 3: Behind the Scenes
```
[Photo of team/workspace]

This is where [specific work] happens for [city] [ICP].

[1 sentence about process/value]

[CTA: Learn more about our [service]]
```

---

## Document Control

- **Author:** Leo (Chief of Staff)
- **Model used:** Kimi K2.6 (ollama/kimi-k2.6:cloud)
- **Original request:** DeepSeek V4 Pro timed out twice — Kimi drafted as fallback
- **Next review:** Yohann approval required before Phase 1 execution
- **Dependencies:** GBP API access, photo assets from Yohann/Jenny, NAP audit completion
