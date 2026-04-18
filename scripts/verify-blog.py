#!/usr/bin/env python3
"""Final verification of all tasks."""
import re, os

with open('/Users/superhana/Desktop/aloomii/blog/index.html') as f:
    html = f.read()

print('=== TASK 1 VERIFICATION ===')
blog_cards = list(re.finditer(r'<a href="/blog/[^"]+" class="blog-card"', html))
print(f'Total blog cards: {len(blog_cards)}')

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
href_counts = {}
for m in blog_cards:
    href = re.search(r'<a href="(/blog/[^"]+)"', m.group()).group(1)
    href_counts[href] = href_counts.get(href, 0) + 1

all_ok = True
for slug in target_slugs:
    count = href_counts.get(f'/blog/{slug}', 0)
    status = 'PASS' if count == 1 else f'FAIL (count={count})'
    if count != 1: all_ok = False
    print(f'  {slug}: {status}')

dupes = {k: v for k, v in href_counts.items() if v > 1}
print(f'Any remaining duplicates: {dupes}')

print()
print('=== TASK 4a VERIFICATION ===')
bad = html.count('min read read')
print(f"'min read read' occurrences: {bad} (should be 0)")

print()
print('=== TASK 2a VERIFICATION ===')
desktop_nav = html.split('nav-links')[1].split('</ul>')[0]
print(f'Services (/offerings): {"#/offerings" in desktop_nav}')
print(f'How It Works (/how): {"#/how" in desktop_nav}')
print(f'Studio (/studio): {"/studio" in desktop_nav}')
print(f'Old aloomii-os.html: {"aloomii-os.html" in desktop_nav}')
mobile_nav = html.split('mobile-menu')[1].split('</div>')[0]
print(f'Mobile nav Services: {"#/offerings" in mobile_nav}')
print(f'Mobile nav Studio: {"/studio" in mobile_nav}')

print()
print('=== TASK 3a+b VERIFICATION ===')
print(f'Category filter URL-aware: {"URLSearchParams" in html and "category" in html}')
print(f'Pagination prevBtn: {"prevBtn" in html}')
print(f'Pagination nextBtn: {"nextBtn" in html}')
print(f'Pagination JS (CARDS_PER_PAGE): {"CARDS_PER_PAGE" in html}')

print()
print('=== TASK 2b VERIFICATION ===')
with open('/Users/superhana/Desktop/aloomii/aloomii-os.html') as f:
    ao = f.read()
print(f'aloomii-os.html has canonical tag: {"canonical" in ao}')
canonical_count = ao.count('aloomii-os.html')
print(f'aloomii-os.html self-reference count: {canonical_count}')

print()
print('=== TASK 5 VERIFICATION ===')
blog_dir = '/Users/superhana/Desktop/aloomii/blog'
all_posts = [e for e in os.listdir(blog_dir) if os.path.isfile(f'{blog_dir}/{e}/index.html') and e != '_astro']
complete = 0
for e in all_posts:
    with open(f'{blog_dir}/{e}/index.html') as f:
        h = f.read()
    if 'BreadcrumbList' in h:
        items = re.findall(r'"@type":\s*"ListItem"', h)
        if len(items) >= 3:
            complete += 1
print(f'Posts with complete 3-item BreadcrumbList: {complete}/{len(all_posts)}')

print()
print('=== TASK 4b METADATA CHECK (sample) ===')
sample_card = re.search(r'<a href="/blog/gtm-stack-what-founders-50k-mrr-actually-use"[^>]*>(.*?)</a>', html, re.DOTALL)
if sample_card:
    card = sample_card.group()
    p = re.search(r'<p>(.*?)</p>', card)
    bl = re.search(r'card-byline[^>]*>([^<]+)', card)
    cat = re.search(r'category-pill[^>]*>([^<]+)', card)
    title = re.search(r'<h2>(.*?)</h2>', card)
    print(f'Sample: gtm-stack-what-founders-50k-mrr-actually-use')
    print(f'  Category: {cat.group(1).strip() if cat else "MISSING"}')
    print(f'  Title: {title.group(1)[:60] if title else "MISSING"}')
    print(f'  Teaser: {p.group(1)[:80] if p else "MISSING"}...')
    print(f'  Byline: {bl.group(1).strip() if bl else "MISSING"}')

print()
if all_ok:
    print('ALL 8 TARGET SLUGS: PASS')
else:
    print('SOME SLUGS FAILED')