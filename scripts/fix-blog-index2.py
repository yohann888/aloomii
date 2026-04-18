#!/usr/bin/env python3
"""Fix blog/index.html - complete pass: dedup remaining 5, fix nav, add pagination."""
import re

with open("/Users/superhana/Desktop/aloomii/blog/index.html", "r") as f:
    html = f.read()

orig_len = len(html)

# ─── 1. REMOVE 5 REMAINING DUPLICATE CARDS (keep later/better version) ─────────
# Strategy: use regex to find all blog-card blocks, then remove the specific earlier ones.

cards = list(re.finditer(r'<a href="/blog/[^"]+" class="blog-card"[^>]*>.*?</a>', html, re.DOTALL))
print(f"Total cards before dedup: {len(cards)}")

# For each slug, find both cards and remove the earlier one
slug_card_map = {}
for m in cards:
    match = re.search(r'<a href="(/blog/[^"]+)"', m.group())
    if match:
        href = match.group(1)
        if href not in slug_card_map:
            slug_card_map[href] = []
        slug_card_map[href].append(m)

dupe_slugs = [
    "/blog/openclaw-setup-mistakes-that-kill-roi",
    "/blog/nemoclaw-regulated-industries-insurance-financial-advisors",
    "/blog/5-openclaw-skills-b2b-founders",
    "/blog/openclaw-vs-hiring-an-ea-cost-comparison-2026",
    "/blog/how-to-set-up-openclaw-always-on-business-assistant",
]

removed = 0
for slug in dupe_slugs:
    entries = slug_card_map.get(slug, [])
    if len(entries) == 2:
        # Remove the earlier (first) one
        earlier = entries[0]
        later = entries[1]
        # Verify they're truly different teasers
        p1 = re.search(r'<p>(.*?)</p>', entries[0].group())
        p2 = re.search(r'<p>(.*?)</p>', entries[1].group())
        t1 = p1.group(1) if p1 else ""
        t2 = p2.group(1) if p2 else ""
        print(f"  {slug}")
        print(f"    Earlier teaser: {t1[:60]}...")
        print(f"    Later teaser:  {t2[:60]}...")
        html = html[:earlier.start()] + html[earlier.end():]
        removed += 1
        print(f"    ✓ Removed earlier duplicate")
    elif len(entries) == 1:
        print(f"  {slug}: only 1 occurrence, skipping")
    else:
        print(f"  {slug}: {len(entries)} occurrences, unexpected")

print(f"Removed {removed} duplicate cards")

# Verify all duplicates gone
remaining_cards = list(re.finditer(r'<a href="/blog/[^"]+" class="blog-card"', html))
href_counts = {}
for m in remaining_cards:
    href = re.search(r'<a href="(/blog/[^"]+)"', m.group()).group(1)
    href_counts[href] = href_counts.get(href, 0) + 1
dupes_after = {k: v for k, v in href_counts.items() if v > 1}
print(f"Remaining duplicates: {dupes_after}")
print(f"Total cards after dedup: {len(remaining_cards)}")

# ─── 2. FIX "min read read" BUG ───────────────────────────────────────────────
count = html.count("min read read")
html = html.replace("min read read", "min read")
print(f"\nFixed {count} 'min read read' → 'min read'")

# ─── 3. FIX DESKTOP NAV ────────────────────────────────────────────────────────
old_nav = '<ul class="nav-links"> <li><a href="/">Home</a></li> <li><a href="/aloomii-os.html">Aloomii AI Workforce</a></li>  <li><a href="/table" style="color:#009e96;font-weight:600;">The Table</a></li> <li><a href="/blog" aria-current="page">Blog</a></li> <li><a href="/#contact">Contact</a></li> </ul>'
new_nav = '<ul class="nav-links"> <li><a href="/">Home</a></li> <li><a href="/#offerings">Services</a></li> <li><a href="/#how">How It Works</a></li> <li><a href="/table" style="color:#009e96;font-weight:600;">The Table</a></li> <li><a href="/studio">Studio</a></li> <li><a href="/blog" aria-current="page">Blog</a></li> <li><a href="/#contact">Contact</a></li> </ul>'
if old_nav in html:
    html = html.replace(old_nav, new_nav)
    print("  ✓ Fixed desktop nav")
else:
    print("  ✗ Desktop nav pattern not found")

# ─── 4. FIX MOBILE NAV ─────────────────────────────────────────────────────────
old_mobile = '<div class="mobile-menu" id="mobileMenu" aria-hidden="true"> <a href="/">Home</a> <a href="/aloomii-os.html">Aloomii AI Workforce</a>  <a href="/blog">Blog</a> <a href="/#contact">Contact</a> </div>'
new_mobile = '<div class="mobile-menu" id="mobileMenu" aria-hidden="true"> <a href="/">Home</a> <a href="/#offerings">Services</a> <a href="/#how">How It Works</a> <a href="/table">The Table</a> <a href="/studio">Studio</a> <a href="/blog">Blog</a> <a href="/#contact">Contact</a> </div>'
if old_mobile in html:
    html = html.replace(old_mobile, new_mobile)
    print("  ✓ Fixed mobile nav")
else:
    print("  ✗ Mobile nav pattern not found")

# ─── 5. ADD PAGINATION HTML ────────────────────────────────────────────────────
old_close = '</section>\n </div>\n </main>'
new_close = '''</section>
 <!-- Pagination -->
 <div class="pagination" id="pagination" role="navigation" aria-label="Blog pagination">
  <button class="pagination-btn" id="prevBtn" disabled>&larr; Previous</button>
  <span class="pagination-info" id="paginationInfo">Page 1 of 1</span>
  <button class="pagination-btn" id="nextBtn" disabled>Next &rarr;</button>
 </div>
 </div>
 </main>'''
if old_close in html:
    html = html.replace(old_close, new_close)
    print("  ✓ Added pagination HTML")
else:
    print("  ✗ Grid closing pattern not found")

# ─── 6. ADD PAGINATION JS (before hamburger script) ───────────────────────────
pagination_js = '''<script type="module">
(function(){
  var CARDS_PER_PAGE = 12;
  var grid = document.getElementById('blogGrid');
  var pagination = document.getElementById('pagination');
  if(!grid || !pagination) return;
  var allCards = Array.from(grid.querySelectorAll('.blog-card'));
  var totalPages = Math.ceil(allCards.length / CARDS_PER_PAGE);
  var currentPage = 1;
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var info = document.getElementById('paginationInfo');

  function getPageFromURL(){
    var p = new URLSearchParams(window.location.search).get('page');
    return p ? Math.max(1, Math.min(parseInt(p)||1, totalPages)) : 1;
  }
  function updateURL(page){
    var t = new URLSearchParams(window.location.search);
    if(page===1) t.delete('page'); else t.set('page', String(page));
    window.history.pushState({}, "", window.location.pathname + (t.toString() ? '?'+t.toString() : ''));
  }
  function showPage(page){
    currentPage = page;
    var start = (page-1) * CARDS_PER_PAGE;
    allCards.forEach(function(c, i){
      c.style.display = (i>=start && i<start+CARDS_PER_PAGE) ? '' : 'none';
    });
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    info.textContent = 'Page ' + page + ' of ' + totalPages;
    updateURL(page);
    pagination.style.display = totalPages > 1 ? '' : 'none';
    window.scrollTo({top: grid.offsetTop-80, behavior: 'smooth'});
  }
  if(prevBtn) prevBtn.addEventListener('click', function(){ if(currentPage>1) showPage(currentPage-1); });
  if(nextBtn) nextBtn.addEventListener('click', function(){ if(currentPage<totalPages) showPage(currentPage+1); });
  window.addEventListener('popstate', function(){ showPage(getPageFromURL()); });
  pagination.style.display = totalPages > 1 ? '' : 'none';
  showPage(getPageFromURL());
})();
</script>
<script type="module">'''

old_hamburger = '<script type="module">const e=document.getElementById("hamburger")'
if old_hamburger in html:
    html = html.replace(old_hamburger, pagination_js)
    print("  ✓ Added pagination JS")
else:
    print("  ✗ Hamburger script pattern not found")

# ─── WRITE ──────────────────────────────────────────────────────────────────────
print(f"\nOriginal: {orig_len} chars")
print(f"Final:    {len(html)} chars")
print(f"Change:   {len(html)-orig_len:+d} chars")

with open("/Users/superhana/Desktop/aloomii/blog/index.html", "w") as f:
    f.write(html)
print("✓ Written to disk")