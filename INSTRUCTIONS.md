# Aloomii Website — Deployment & Maintenance Instructions

## Quick Reference

| Item | Value |
|------|-------|
| **Live site** | https://aloomii.com |
| **Cloudflare Pages URL** | https://aloomii.pages.dev |
| **GitHub repo** | https://github.com/yohann888/aloomii |
| **Cloudflare project** | `aloomii` |
| **Contact email** | hello@aloomii.com |

---

## ⚠️ DEPLOY RULE — READ FIRST

**NEVER run `wrangler pages deploy` directly.** It will overwrite the live site with only the files on your local machine — deleting anything that was committed from another machine.

**The only correct deploy path is Git:**

```bash
git add -A
git commit -m "your message"
git push origin main
```

GitHub Actions automatically deploys to Cloudflare Pages on every push to `main`. Changes are live in ~60 seconds. Both Yohann's machine and Jenny's machine must use this workflow.

---

## How to Set Up (first time on a new machine)

```bash
# Clone the repo
git clone https://github.com/yohann888/aloomii.git
cd aloomii

# Make changes, then deploy via git:
git add -A
git commit -m "describe your change"
git push origin main
```

---

## How to Add a Blog Article

1. Create `/blog/your-article-slug.html` — copy the structure from an existing article
2. Add the article card to `/blog/index.html`
3. Commit and push:
```bash
git add -A
git commit -m "Blog: add [article title]"
git push origin main
```

---

## How to Add a New Page

1. Create a new `.html` file in the root folder
2. Copy the `<nav>` and mobile menu from `index.html`
3. Add a nav link on ALL existing pages:
   - `index.html` — both `<ul class="nav-links">` and `<div class="mobile-menu">`
   - `aloomii-os.html` — both `<ul class="nav-links">` and `<div class="mobile-menu">`
   - `blog/index.html` — nav
4. Commit and push (see above)

---

## How to Update Logos

Logo images live in `images/logos/`. To swap one:

1. Drop the new image file into `images/logos/`
2. Update the `src` in the HTML
3. Commit and push

### Logo sections:
- **Past Experience** (8 logos): White bg, 4x2 grid, large, full color
- **Current Clients** (6 logos): Dark grey bg, 3x2 grid, medium, full color
- **Worked Deals** (10 logos): Black bg, 5x2 grid, forced white via CSS filter

---

## Site Pages

### Homepage (`index.html`)
- Main marketing page with hero animation, services, and logo sections
- Hero uses **Unicorn Studio** (loads from CDN, needs internet)

### Aloomii OS Dashboard (`aloomii-os.html`)
- Dark-themed dashboard showing AI agent fleet metrics
- Data loads from KV store via Cloudflare Workers function

### Blog (`blog/index.html`)
- Lists all published articles
- Individual articles live at `blog/{slug}.html`

---

## Brand Colors

| Color | Hex | Used For |
|-------|-----|----------|
| Teal (primary) | `#009e96` | Headings, accents, CTAs |
| Body text | `#444444` | Paragraph text |
| Dark bg | `#0a0a0a` | Dark sections, nav bg |
| Muted | `#888888` | Dates, captions |

---

## Navigation (current)
1. **Home** → `index.html`
2. **Aloomii AI Workforce** → `aloomii-os.html`
3. **Blog** → `blog/`
4. **Contact** → `#contact` (scroll anchor)

---

## Troubleshooting

**Deploy via GitHub Actions failed?**
- Check Actions tab at https://github.com/yohann888/aloomii/actions
- Secrets needed: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

**Unicorn Studio hero not showing?**
- Only works over HTTP/HTTPS (not `file://`)
- Check project ID `ZU1wuWl1J4Sp9Tl2q1mr` is active on Unicorn Studio

**Changes not showing after push?**
- Hard refresh: `Cmd+Shift+R` (Mac)
- Wait 2–3 min for Cloudflare cache to clear

**Need to roll back?**
- Cloudflare Dashboard → Workers & Pages → aloomii → Deployments → click any prior deploy → "Rollback"
- OR: `git revert HEAD && git push origin main`

**Need to check what's actually live vs local?**
- Visit https://aloomii.com and compare to local files
- NEVER assume your local folder is the source of truth
