#!/usr/bin/env python3
"""Repair blog/index.html: restore 3 missing posts, remove remaining duplicate."""
import re

with open("/Users/superhana/Desktop/aloomii/blog/index.html", "r") as f:
    html = f.read()

# ── 1. REMOVE REMAINING DUPLICATE: how-to-set-up-openclaw (earlier/lower-quality) ──
# Find both occurrences
cards = list(re.finditer(r'<a href="/blog/how-to-set-up-openclaw-always-on-business-assistant" class="blog-card"[^>]*>.*?</a>', html, re.DOTALL))
print(f"how-to-set-up-openclaw occurrences: {len(cards)}")
if len(cards) == 2:
    for i, m in enumerate(cards):
        p = re.search(r'<p>(.*?)</p>', m.group())
        teaser = p.group(1)[:80] if p else "(none)"
        print(f"  Card {i+1} (pos {m.start()}-{m.end()}): {teaser}...")
    # Remove the earlier (first) one
    html = html[:cards[0].start()] + html[cards[0].end():]
    print("  ✓ Removed earlier duplicate, kept later/better one")

# ── 2. RESTORE 3 MISSING POSTS ─────────────────────────────────────────────────
# Category pill CSS class map
def category_css(cat):
    if cat == "AI Sales System": return "ai-sales"
    if cat == "Industry Playbooks": return "industry"
    if cat == "Content Intelligence": return "content-intel"
    return "comparisons"

missing_posts = [
    {
        "slug": "real-cost-ill-do-marketing-when-i-have-time",
        "category": "Industry Playbooks",
        "title": 'The Real Cost of "I\'ll Do Marketing When I Have Time"',
        "teaser": 'Every bootstrapped founder has said it. "I will focus on GTM once the product is stable." Six months later, pipeline is thin and competitors have compounded. Here is the actual cost of waiting, in real numbers.',
        "date": "March 24, 2026",
        "readtime": "6 min",
    },
    {
        "slug": "invisible-founder-invisible-company-b2b-buyers",
        "category": "Content Intelligence",
        "title": "Invisible Founder, Invisible Company: Why B2B Buyers Choose the Brand They Have Already Heard Of",
        "teaser": "In B2B sales, deals rarely go to the best product. They go to the most familiar name. Here is why founder visibility is the most underrated competitive advantage at seed stage, and how to build it.",
        "date": "March 24, 2026",
        "readtime": "7 min",
    },
    {
        "slug": "openclaw-setup-mistakes-that-kill-roi",
        "category": "AI Sales System",
        "title": "The OpenClaw Setup Mistakes That Kill ROI (And How to Avoid Them)",
        "teaser": "Most founders abandon their OpenClaw configuration within two weeks. It's not the tool. It's six setup mistakes that kill ROI before the agent ships a single hour of value.",
        "date": "March 18, 2026",
        "readtime": "9 min",
    },
]

# Insert before the pagination div (which comes after </section>)
insert_marker = '''<!-- Pagination -->
 <div class="pagination" id="pagination"'''

insert_html = ""
for post in missing_posts:
    css = category_css(post["category"])
    card = f'''<a href="/blog/{post["slug"]}" class="blog-card" data-category="{post["category"]}">
 <div class="card-meta">
  <span class="category-pill category-pill--{css}"> {post["category"]} </span>
 </div>
 <h2>{post["title"]}</h2>
 <p>{post["teaser"]}</p>
 <span class="card-byline"> Yohann Calpu · {post["date"]} · {post["readtime"]} </span>
</a>
'''
    insert_html += card
    print(f'  + Restored: {post["slug"]}')

html = html.replace(insert_marker, insert_html + insert_marker)

# ── VERIFY ─────────────────────────────────────────────────────────────────────
cards = list(re.finditer(r'<a href="/blog/[^"]+" class="blog-card"', html))
href_counts = {}
for m in cards:
    href = re.search(r'<a href="(/blog/[^"]+)"', m.group()).group(1)
    href_counts[href] = href_counts.get(href, 0) + 1
dupes = {k: v for k, v in href_counts.items() if v > 1}
print(f"\nTotal cards: {len(cards)}")
print(f"Duplicates: {dupes}")

target_slugs = [
    'gtm-stack-what-founders-50k-mrr-actually-use',
    'real-cost-ill-do-marketing-when-i-have-time',
    'invisible-founder-invisible-company-b2b-buyers',
    'openclaw-setup-mistakes-that-kill-roi',
    'nemoclaw-regulated-industries-insurance-financial-advisors',
    '5-openclaw-skills-b2b-founders',
    'openclaw-vs-hiring-an-ea-cost-comparison-2026',
    'how-to-set-up-openclaw-always-on-business-assistant',
]
print("\nTarget slug verification:")
for slug in target_slugs:
    count = href_counts.get(f'/blog/{slug}', 0)
    status = "✓" if count == 1 else f"✗ (count={count})"
    print(f"  {slug}: {status}")

with open("/Users/superhana/Desktop/aloomii/blog/index.html", "w") as f:
    f.write(html)
print("\n✓ Written to disk")