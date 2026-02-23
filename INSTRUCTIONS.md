# Aloomii Website — Deployment & Maintenance Instructions

## Quick Reference

| Item | Value |
|------|-------|
| **Live site** | https://aloomii.com |
| **Cloudflare Pages URL** | https://aloomii.pages.dev |
| **Cloudflare project** | `aloomii` |
| **Local folder** | `/Users/jenny/Downloads/claude code/aloomii/` |
| **Contact email** | hello@aloomii.com |

---

## How to Deploy Changes

Every time you edit any file, redeploy with this one command:

```bash
npx wrangler pages deploy "/Users/jenny/Downloads/claude code/aloomii" --project-name=aloomii
```

That's it. Changes go live in ~30 seconds.

---

## How to Log In (if session expired)

```bash
npx wrangler login
```

This opens a browser window. Click "Allow" to authorize. Then run the deploy command above.

Check if you're logged in:
```bash
npx wrangler whoami
```

---

## Site Pages

### Homepage (`index.html`)
- Main marketing page with hero animation, services, and logo sections
- Hero uses **Unicorn Studio** (loads from CDN, needs internet)
- Services section: 2x2 grid + 1 centered

### Aloomii OS Dashboard (`aloomii-os.html`)
- Dark-themed dashboard showing AI agent fleet metrics
- Data loads from `./data/metrics.json` — if that file doesn't exist, shows demo/fallback numbers
- To update live metrics: create a `data/` folder and put `metrics.json` in it with this format:

```json
{
  "ai_leverage_ratio": { "value": "23.5" },
  "goal_accuracy": { "value": 94.5 },
  "signal_velocity": { "total_signals": 36, "hot_leads": 18 },
  "network_growth": { "total_contacts": 26 },
  "content_throughput": { "drafts_ready": 16, "published": 0 },
  "asset_library": { "models": 21, "designs": 52 },
  "timestamp": "2026-02-21T12:00:00Z"
}
```

---

## How to Add a New Page

1. Create a new `.html` file in the `aloomii/` folder
2. Copy the `<nav>` and mobile menu from `index.html`
3. Add a link to the new page in the nav on ALL existing pages:
   - `index.html` — both `<ul class="nav-links">` and `<div class="mobile-menu">`
   - `aloomii-os.html` — both `<ul class="nav-links">` and `<div class="mobile-menu">`
4. Deploy

---

## How to Update Logos

Logo images live in `images/logos/`. To swap one:

1. Drop the new image file into `images/logos/`
2. Update the `src` in the HTML:
   ```html
   <img src="images/logos/your-new-logo.png" alt="Company Name">
   ```
3. Deploy

### Logo sections:
- **Past Experience** (8 logos): White bg, 4x2 grid, large, full color
- **Current Clients** (6 logos): Dark grey bg, 3x2 grid, medium, full color
- **Worked Deals** (10 logos): Black bg, 5x2 grid, forced white via CSS filter

---

## Navigation Links

Current nav items (in order):
1. **Home** → `index.html`
2. **Aloomii OS** → `aloomii-os.html`
3. **Client Application** → Google Form (opens in new tab)
4. **Contact** → scrolls to footer on homepage
5. **Email icon** → `mailto:hello@aloomii.com`

To change the Client Application form URL, search for `1FAIpQLSf` in both HTML files and replace the full Google Form URL.

---

## Brand Colors

| Color | Hex | Used For |
|-------|-----|----------|
| Teal (primary) | `#009e96` | Service headings, dashboard accent |
| Purple | `#663399` | Dashboard secondary accent |
| Blue | `#56cbf9` | Dashboard tertiary accent |
| Body text (light) | `#555555` | Homepage paragraph text |
| Body text (dark) | `#f0f0f0` | Dashboard text |

---

## Custom Domain Management

Domain DNS is managed through Cloudflare. To check or change settings:

1. Go to https://dash.cloudflare.com
2. Click on `aloomii.com` in your domains
3. **DNS** tab shows all records
4. **Workers & Pages** → `aloomii` project → **Custom domains** tab

---

## Troubleshooting

**Unicorn Studio hero not showing?**
- Only works when served over HTTP/HTTPS (not `file://`)
- Check that the project ID `ZU1wuWl1J4Sp9Tl2q1mr` is still active on your Unicorn Studio account

**Deploy fails with "not authenticated"?**
- Run `npx wrangler login` and re-authorize

**Changes not showing after deploy?**
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- Cloudflare may cache for a few minutes — wait 2-3 min

**Want to roll back a deploy?**
- Go to Cloudflare Dashboard → Workers & Pages → aloomii → Deployments
- Click on any previous deployment and click "Rollback to this deployment"
