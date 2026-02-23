# Aloomii Website - Development Context

## Project Overview
Static HTML website for Aloomii (aloomii.com) — a business & creative strategy consultancy. Migrated from Squarespace to self-hosted on Cloudflare Pages.

## Site Structure

```
aloomii/
├── index.html              # Main homepage
├── aloomii-os.html         # Aloomii OS dashboard page
├── CLAUDE.md               # This file
├── INSTRUCTIONS.md          # Deployment & maintenance guide
└── images/
    └── logos/
        ├── Aloomii - final.png    # Nav/brand logo
        ├── ibm.png                # Past Experience logos (8)
        ├── jpmorgan.png
        ├── maersk.png
        ├── mto.png
        ├── gpc.png
        ├── ameriprise.png
        ├── unum.png
        ├── dexmedia.png
        ├── logo-bis.png           # Current Clients logos (6)
        ├── logo-pp.png
        ├── logo1-cc.png
        ├── logo1-cs.png
        ├── logo1-tt.png
        ├── logo1-eg.png
        ├── -logo1-ab.svg.png      # Worked Deals logos (10)
        ├── logo-av.png
        ├── -logo1-dk.png
        ├── -logo1-tv.png
        ├── -logo1-ml.png
        ├── logo-raas.png
        ├── -logo1-pg.svg.png
        ├── -logo1-tz.png
        ├── -logo1-socio.png
        └── -logo1-dl.png
```

## Hosting & Deployment

- **Platform**: Cloudflare Pages
- **Project name**: `aloomii`
- **Default URL**: https://aloomii.pages.dev
- **Custom domain**: aloomii.com (DNS managed by Cloudflare)
- **Deploy command**: `npx wrangler pages deploy "/Users/jenny/Downloads/claude code/aloomii" --project-name=aloomii`

## Pages

### index.html (Homepage)
- **Navigation**: Fixed sticky nav with blur backdrop. Links: Home, Aloomii OS, Client Application (Google Form), Contact, Email icon
- **Hero**: Unicorn Studio animated header (project ID: `ZU1wuWl1J4Sp9Tl2q1mr`). Responsive desktop (1440x900) and mobile (390x844) versions
- **Services**: 2x2 grid + 1 centered card layout. 5 service offerings with teal headings (#009e96)
- **AI Philosophy**: Dark section with centered text. "Great Ideas + Great AI" messaging
- **Past Experience**: White background, 4x2 logo grid, full-color logos, large size
- **Current Clients**: Dark grey gradient background (#3a3a3a to #222222), 3x2 grid, medium logos, full-color
- **Worked Deals**: Black background, 5x2 grid, white-filtered logos (brightness(0) invert(1))
- **Footer**: Email link, Client Terms, Privacy, Terms and Conditions

### aloomii-os.html (Dashboard)
- **Purpose**: Live fleet dashboard + sales page showing AI agent operations and value proposition
- **Design**: Dark theme (#080810 background) with Space Grotesk font
- **Color scheme**: Accent teal (#009e96), purple (#663399), blue (#56cbf9)
- **Password gate**: Requires password to view (obfuscated in JS, stored in sessionStorage as `alos_auth`)
- **Navigation**: Same nav as homepage but styled for dark theme
- **Scanline effect**: CSS pseudo-element for retro CRT aesthetic

**Dashboard section (top):**
- Header: "ALOOMII OS DASHBOARD · LIVE" with pulsing green dot and pulsing "LIVE" text
- Active Agent Fleet: 11 agent pills with glowing pulsing teal dots (large size: 1.05rem, 10px dots with box-shadow glow)
- Proof Bar: 23.5x output leverage, 11 autonomous agents, 24/7 always running
- Sales Pipeline (LIVE): Hot leads, signals, opportunities, network contacts, est. pipeline value — fetches from `/public_metrics.json`
- System Economics: Weekly AI cost, human-equivalent value, value breakdown bar chart, ROI callout (146x)
- "Last updated" timestamp footer (hugs bottom of ROI metric)
- Data sources: `./data/metrics.json` (dashboard), `/public_metrics.json` (pipeline + economics)

**"What Aloomii Does" section (below dashboard):**
- Eyebrow: "What Aloomii Does"
- Headline: "We replace your SDR. We upgrade your AE. $2,500/mo instead of $145,000/yr."
- Subhead: "Most founders are doing the work of 10 people. Aloomii changes the ratio."
- 5 outcome cards: Find more leads, Ship faster, Never let a relationship go cold, Content that never stops, Run like a company 10x your size
- Newsletter signup form

**Agent labels (11 total — must stay consistent across all sections):**
🔍 Lead Intelligence, 🤝 Relationship Ops, ✍️ Content at Scale, ⚙️ Dev Velocity, 🔎 Code Review, 📊 Executive Oversight, 🌐 Network Enrichment, 📚 Knowledge Management, 🔮 Opportunity Scanner, 🛡️ Fleet Audit, 🎬 Media Production

**CSS architecture:**
- Dashboard styles use CSS variables from `:root` (--bg, --card, --border, --border-hot, --accent, etc.)
- Card backgrounds: `--card: rgba(255,255,255,0.06)`, borders: `--border: rgba(255,255,255,0.12)`
- Pipeline stats have teal-tinted backgrounds: `rgba(0,158,150,0.07)`
- Second `<style>` block (inline) handles the "What Aloomii Does" section, proof bar, pipeline, economics, and newsletter styles
- `.live-text` class pulses opacity (2s infinite), `.live-dot` class pulses scale+opacity
- Section headline uses `clamp(1.4rem, 3.5vw, 2.24rem)` — was intentionally reduced 30% from original

## Design Decisions

### Brand Colors
- **Primary accent (teal)**: #009e96 (darker version of #00c8be)
- **Purple**: #663399
- **Blue**: #56cbf9
- **Service heading color**: #009e96
- **Body text**: #555555 (homepage), #f0f0f0 (dashboard)

### Typography
- **Homepage**: Inter (Google Fonts)
- **Dashboard**: Space Grotesk + Space Mono (Google Fonts)

### Logo Section Spacing
- Logo grids use `auto` columns with `justify-content: center` (not `1fr`) to pack logos tightly
- Past Experience: column-gap `calc(1200px * 0.015)`, row-gap `2px`
- Current Clients: column-gap `calc(1200px * 0.0195)`, row-gap `calc(2px * 14.4)`
- Worked Deals: column-gap `calc(1200px * 0.03)`, row-gap `2px`

### Mobile Responsiveness
- Hamburger menu at <=768px
- Unicorn Studio switches between desktop/mobile containers at 768px breakpoint
- Logo grids collapse to 2-column on mobile
- Dashboard hero stacks vertically at <=640px

### Security/Privacy (Dashboard)
- Team size not disclosed (removed "2 humans" reference — never re-add)
- Pipeline numbers use generic language ("active connections" not "warm contacts")
- No timezone-specific locale formatting
- Data fetch paths: `./data/metrics.json` (dashboard metrics), `/public_metrics.json` (pipeline + economics)
- Footer states "Zero PII · Aggregate metrics only"
- Password gate protects entire page (sessionStorage-based)

## External Dependencies
- Google Fonts: Inter, Space Grotesk, Space Mono
- Unicorn Studio: v2.0.4 via CDN (homepage hero only)
- Client Application: Google Form (https://docs.google.com/forms/d/e/1FAIpQLSfbePsaenibdhlKScCehiccHCNZ7DnNmKl3QJEFhNZn97pahA/viewform)

## Common Tasks

### Update content and redeploy
1. Edit HTML files locally
2. Run: `npx wrangler pages deploy "/Users/jenny/Downloads/claude code/aloomii" --project-name=aloomii`

### Add a new page
1. Create new `.html` file in the aloomii root
2. Include the same nav structure (copy from index.html or aloomii-os.html)
3. Add nav link to ALL existing pages (both desktop nav-links and mobile-menu)
4. Deploy

### Add/replace logos
1. Drop image files into `images/logos/`
2. Update the `<img>` tag `src` in the relevant section
3. Deploy
