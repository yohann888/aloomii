#!/usr/bin/env python3
"""Fix blog/index.html: dedup cards, fix nav, add pagination, fix template bugs."""

import re

path = "/Users/superhana/Desktop/aloomii/blog/index.html"

with open(path, "r", encoding="utf-8") as f:
    html = f.read()

original_len = len(html)
print(f"Original length: {original_len}")

# ─── TASK 1b: REMOVE 8 DUPLICATE BLOG CARDS ───────────────────────────────────
# Cards appear twice in the file. Keep the later (higher-quality) versions,
# remove the earlier (lower-quality) versions.

duplicates_to_remove = [
    # gtm-stack: keep later (109-116), remove earlier (21-28)
    ('<a href="/blog/gtm-stack-what-founders-50k-mrr-actually-use" class="blog-card" data-category="Industry Playbooks">\n <div class="card-meta">\n  <span class="category-pill category-pill--industry"> Industry Playbooks </span>\n </div>\n <h2>The GTM Stack Nobody Talks About: What Founders at $50K MRR Actually Use</h2>\n <p>Not the aspirational stack. The actual one. What B2B founders at $10K to $100K MRR are actually using for content, outreach, signal monitoring, and competitive intelligence, and what most wish they had figured out sooner.</p>\n <span class="card-byline"> Yohann Calpu · March 24, 2026 · 7 min </span>\n</a>',
     ''),
    # real-cost: both identical, remove earlier (29-36)
    ('<a href="/blog/real-cost-ill-do-marketing-when-i-have-time" class="blog-card" data-category="Industry Playbooks">\n <div class="card-meta">\n  <span class="category-pill category-pill--industry"> Industry Playbooks </span>\n </div>\n <h2>The Real Cost of "I\'ll Do Marketing When I Have Time"</h2>\n <p>Every bootstrapped founder has said it. "I will focus on GTM once the product is stable." Six months later, pipeline is thin and competitors have compounded. Here is the actual cost of waiting, in real numbers.</p>\n <span class="card-byline"> Yohann Calpu · March 24, 2026 · 6 min </span>\n</a>',
     ''),
    # invisible-founder: both identical, remove earlier (37-44)
    ('<a href="/blog/invisible-founder-invisible-company-b2b-buyers" class="blog-card" data-category="Content Intelligence">\n <div class="card-meta">\n  <span class="category-pill category-pill--content-intel"> Content Intelligence </span>\n </div>\n <h2>Invisible Founder, Invisible Company: Why B2B Buyers Choose the Brand They Have Already Heard Of</h2>\n <p>In B2B sales, deals rarely go to the best product. They go to the most familiar name. Here is why founder visibility is the most underrated competitive advantage at seed stage, and how to build it.</p>\n <span class="card-byline"> Yohann Calpu · March 24, 2026 · 7 min </span>\n</a>',
     ''),
    # openclaw-setup-mistakes: keep later (209-216), remove earlier (157-164)
    ('<a href="/blog/openclaw-setup-mistakes-that-kill-roi" class="blog-card" data-category="AI Sales System">\n <div class="card-meta">\n  <span class="category-pill category-pill--ai-sales"> AI Sales System </span>\n </div>\n <h2>The OpenClaw Setup Mistakes That Kill ROI (And How to Avoid Them)</h2>\n <p>Most founders who try to DIY their OpenClaw setup abandon it within 2 weeks. Learn the 6 core mistakes. from memory architecture to missing heartbeats. and how to fix them.</p>\n <span class="card-byline"> Yohann Calpu · March 18, 2026 · 9 min read </span>\n</a>',
     ''),
    # nemoclaw: keep later (217-224), remove earlier (165-172)
    ('<a href="/blog/nemoclaw-regulated-industries-insurance-financial-advisors" class="blog-card" data-category="Industry Playbooks">\n <div class="card-meta">\n  <span class="category-pill category-pill--industry"> Industry Playbooks </span>\n </div>\n <h2>NemoClaw for Regulated Industries: How Insurance Brokers and Financial Advisors Can Deploy AI Agents Without the Compliance Headache</h2>\n <p>NemoClaw is a variant of OpenClaw designed for regulated industries. data stays local, no third-party cloud exposure, audit-trail friendly. Learn how to deploy safely.</p>\n <span class="card-byline"> Yohann Calpu · March 18, 2026 · 10 min read </span>\n</a>',
     ''),
    # 5-openclaw-skills: keep later (225-232), remove earlier (173-180)
    ('<a href="/blog/5-openclaw-skills-b2b-founders" class="blog-card" data-category="AI Sales System">\n <div class="card-meta">\n  <span class="category-pill category-pill--ai-sales"> AI Sales System </span>\n </div>\n <h2>5 Custom OpenClaw Skills Every B2B Founder Should Have Running by Friday</h2>\n <p>OpenClaw skills are plug-in capabilities that extend what your AI agent can do. These 5 skills. from Morning Brief to Signal Scout. deliver the fastest ROI for founders.</p>\n <span class="card-byline"> Yohann Calpu · March 18, 2026 · 10 min read </span>\n</a>',
     ''),
    # openclaw-vs-hiring: keep later (233-240), remove earlier (181-188)
    ('<a href="/blog/openclaw-vs-hiring-an-ea-cost-comparison-2026" class="blog-card" data-category="Comparisons">\n <div class="card-meta">\n  <span class="category-pill category-pill--comparisons"> Comparisons </span>\n </div>\n <h2>OpenClaw vs Hiring an EA: What a Configured AI Agent Actually Costs in 2026</h2>\n <p>An EA costs $45K-$75K/yr plus benefits. A properly configured OpenClaw agent handles scheduling, research, email triage, and CRM updates 24/7 for a fraction of the cost.</p>\n <span class="card-byline"> Yohann Calpu · March 18, 2026 · 8 min read </span>\n</a>',
     ''),
    # how-to-set-up-openclaw: keep later (241-248), remove earlier (189-196)
    ('<a href="/blog/how-to-set-up-openclaw-always-on-business-assistant" class="blog-card" data-category="AI Sales System">\n <div class="card-meta">\n  <span class="category-pill category-pill--ai-sales"> AI Sales System </span>\n </div>\n <h2>How to Set Up OpenClaw as Your Always-On Business Assistant (Step-by-Step)</h2>\n <p>OpenClaw is an AI agent framework that lets founders deploy a personal assistant that runs 24/7. This guide walks through what OpenClaw is and how to get started.</p>\n <span class="card-byline"> Yohann Calpu · March 18, 2026 · 9 min read </span>\n</a>',
     ''),
]

removed_count = 0
for old, new in duplicates_to_remove:
    if old in html:
        html = html.replace(old, new)
        removed_count += 1
        print(f"  ✓ Removed duplicate card")
    else:
        print(f"  ✗ Pattern not found (may already be removed or different whitespace)")

print(f"\nRemoved {removed_count}/8 duplicate cards")

# ─── TASK 4a: FIX "min read read" BUG ────────────────────────────────────────
# Replace "min read read" with "min read" in card-byline spans
# But we need to be careful not to break "min listen" or similar
count = html.count("min read read")
html = html.replace("min read read", "min read")
print(f"Fixed {count} instances of 'min read read' → 'min read'")

# Also fix the featured post card-byline (which ends with "read read\n")
# Already covered by the replace above

# ─── TASK 2a: FIX HEADER NAVIGATION ───────────────────────────────────────────
old_nav_desktop = '''<ul class="nav-links">
 <li><a href="/">Home</a></li>
 <li><a href="/aloomii-os.html">Aloomii AI Workforce</a></li>
  <li><a href="/table" style="color:#009e96;font-weight:600;">The Table</a></li>
 <li><a href="/blog" aria-current="page">Blog</a></li>
 <li><a href="/#contact">Contact</a></li>
 </ul>'''

new_nav_desktop = '''<ul class="nav-links">
 <li><a href="/">Home</a></li>
 <li><a href="/#offerings">Services</a></li>
 <li><a href="/#how">How It Works</a></li>
 <li><a href="/table" style="color:#009e96;font-weight:600;">The Table</a></li>
 <li><a href="/studio">Studio</a></li>
 <li><a href="/blog" aria-current="page">Blog</a></li>
 <li><a href="/#contact">Contact</a></li>
 </ul>'''

if old_nav_desktop in html:
    html = html.replace(old_nav_desktop, new_nav_desktop)
    print("  ✓ Fixed desktop nav")
else:
    print("  ✗ Desktop nav pattern not found")

old_nav_mobile = '''<div class="mobile-menu" id="mobileMenu" aria-hidden="true">
 <a href="/">Home</a>
 <a href="/aloomii-os.html">Aloomii AI Workforce</a>
  <a href="/blog">Blog</a>
 <a href="/#contact">Contact</a>
 </div>'''

new_nav_mobile = '''<div class="mobile-menu" id="mobileMenu" aria-hidden="true">
 <a href="/">Home</a>
 <a href="/#offerings">Services</a></li>
 <a href="/#how">How It Works</a></li>
 <a href="/table">The Table</a>
 <a href="/studio">Studio</a>
 <a href="/blog">Blog</a>
 <a href="/#contact">Contact</a>
 </div>'''

if old_nav_mobile in html:
    html = html.replace(old_nav_mobile, new_nav_mobile)
    print("  ✓ Fixed mobile nav")
else:
    print("  ✗ Mobile nav pattern not found")

# ─── TASK 3a: MAKE CATEGORY FILTER FUNCTIONAL (Option A - query params) ──────
# The filter buttons already exist with data-filter attributes.
# We need to make them update URL query params and filter accordingly.
# Replace the JS filter script with a URL-param-aware version.

old_filter_js = '''document.addEventListener("DOMContentLoaded",()=>{const a=document.querySelectorAll(".filter-btn"),o=document.querySelectorAll("[data-category]");a.forEach(e=>{e.addEventListener("click",()=>{const c=e.getAttribute("data-filter");a.forEach(t=>t.classList.remove("active")),e.classList.add("active"),o.forEach(t=>{const n=t.getAttribute("data-category"),s=c==="all"||n===c;t instanceof HTMLElement&&(t.style.display=s?"":"none")})})})});'''

new_filter_js = '''document.addEventListener("DOMContentLoaded",()=>{const a=document.querySelectorAll(".filter-btn"),o=document.querySelectorAll("[data-category]");function u(){const p=new URLSearchParams(window.location.search),c=p.get("category")||"all";a.forEach(e=>{e.classList.toggle("active",e.getAttribute("data-filter")===c)}),o.forEach(e=>{const n=e.getAttribute("data-category"),s=c==="all"||n===c;e instanceof HTMLElement&&(e.style.display=s?"":"none")})}a.forEach(e=>{e.addEventListener("click",()=>{const c=e.getAttribute("data-filter"),t=new URLSearchParams(window.location.search);c==="all"?t.delete("category"):t.set("category",c);const n=window.location.pathname+(t.toString()?"?"+t.toString():"");window.history.pushState({},"",n),u()})}),window.addEventListener("popstate",u),u()});'''

if old_filter_js in html:
    html = html.replace(old_filter_js, new_filter_js)
    print("  ✓ Updated category filter JS (URL param-aware)")
else:
    print("  ✗ Filter JS pattern not found, trying alternate")
    # Try multiline version
    alt_pattern = re.search(r'document\.addEventListener\("DOMContentLoaded",\(\)=>\{const a=document\.querySelectorAll\("\.filter-btn"\),o=document\.querySelectorAll\("\[data-category\]"\);a\.forEach\(e=>\{e\.addEventListener\("click",\(\)=>\{const c=e\.getAttribute\("data-filter"\);a\.forEach\(t=>t\.classList\.remove\("active"\)\),e\.classList\.add\("active"\),o\.forEach\(t=>\{const n=t\.getAttribute\("data-category"\),s=c==="all"\|\|n===c;t instanceof HTMLElement&&\(t\.style\.display=s\?"":"none"\)\}\)\}\)\}\)\}\);', html)
    if alt_pattern:
        html = html[:alt_pattern.start()] + new_filter_js + html[alt_pattern.end():]
        print("  ✓ Updated category filter JS (regex method)")
    else:
        print("  ✗ Could not find filter JS at all")

# ─── TASK 3b: ADD PAGINATION ───────────────────────────────────────────────────
# We need to:
# 1. Wrap blog-grid cards in pages (12 per page)
# 2. Add pagination controls at the bottom

# Count cards currently in blog-grid
card_pattern = re.findall(r'<a href="/blog/', html)
total_cards = len(card_pattern)
print(f"\nTotal blog cards after dedup: {total_cards}")

# The blog grid section starts after the featured post and ends before footer
# We'll insert pagination HTML and JS before </section> closing the blog-grid
# Find the blog-grid section closing tag

old_grid_footer = '''</section>
 </div>
 </main>'''

# New pagination HTML + updated grid closing
pagination_html = '''</section>
 <!-- Pagination -->
 <div class="pagination" id="pagination" role="navigation" aria-label="Blog pagination">
  <button class="pagination-btn" id="prevBtn" disabled>&larr; Previous</button>
  <span class="pagination-info" id="paginationInfo">Page 1 of 1</span>
  <button class="pagination-btn" id="nextBtn" disabled>Next &rarr;</button>
 </div>
 </div>
 </main>'''

if old_grid_footer in html:
    html = html.replace(old_grid_footer, pagination_html)
    print("  ✓ Added pagination HTML")
else:
    print("  ✗ Grid footer pattern not found")

# Add pagination JS - insert before the nav hamburger script
old_hamburger_script = '''<script type="module">const e=document.getElementById("hamburger"),t=document.getElementById("mobileMenu");'''
pagination_js = '''<script type="module">/* ── Pagination ── */
(function(){
  const CARDS_PER_PAGE = 12;
  const grid = document.getElementById('blogGrid');
  const featured = document.querySelector('.blog-featured');
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const info = document.getElementById('paginationInfo');
  if(!grid || !pagination) return;
  const allCards = Array.from(grid.querySelectorAll('.blog-card'));
  const totalPages = Math.ceil(allCards.length / CARDS_PER_PAGE);
  let currentPage = 1;
  function getPageFromURL(){
    const p=new URLSearchParams(window.location.search).get('page');
    return p?Math.max(1,Math.min(parseInt(p)||1,totalPages)):1;
  }
  function updateURL(page){
    const t=new URLSearchParams(window.location.search);
    page===1?t.delete('page'):t.set('page',String(page));
    window.history.pushState({},"",window.location.pathname+(t.toString()?'?'+t.toString():''));
  }
  function showPage(page){
    currentPage=page;
    allCards.forEach((c,i)=>{
      const start=(page-1)*CARDS_PER_PAGE;
      c.style.display=i>=start&&i<start+CARDS_PER_PAGE?'':'none';
    });
    prevBtn.disabled=page<=1;
    nextBtn.disabled=page>=totalPages;
    info.textContent='Page '+page+' of '+totalPages;
    updateURL(page);
    pagination.style.display=totalPages>1?'':'none';
    window.scrollTo({top:grid.offsetTop-80,behavior:'smooth'});
  }
  prevBtn&&prevBtn.addEventListener('click',()=>{if(currentPage>1) showPage(currentPage-1);});
  nextBtn&&nextBtn.addEventListener('click',()=>{if(currentPage<totalPages) showPage(currentPage+1);});
  window.addEventListener('popstate',()=>{showPage(getPageFromURL());});
  pagination.style.display=totalPages>1?'':'none';
  showPage(getPageFromURL());
})();
</script>
<script type="module">const e=document.getElementById("hamburger"),t=document.getElementById("mobileMenu");'''

if old_hamburger_script in html:
    html = html.replace(old_hamburger_script, pagination_js)
    print("  ✓ Added pagination JS")
else:
    print("  ✗ Hamburger script pattern not found")

# ─── TASK 5: ADD BREADCRUMB JSON-LD TO BLOG POST TEMPLATES ────────────────────
# Blog post pages need to be checked for BreadcrumbList schema.
# We'll check a sample post page.
print("\n── TASK 5: Checking blog post pages for BreadcrumbList schema ──")

post_dirs = [
    "gtm-stack-what-founders-50k-mrr-actually-use",
    "openclaw-setup-mistakes-that-kill-roi",
    "how-to-set-up-openclaw-always-on-business-assistant",
]
for post_dir in post_dirs:
    post_path = f"/Users/superhana/Desktop/aloomii/blog/{post_dir}/index.html"
    try:
        with open(post_path, "r", encoding="utf-8") as f:
            post_html = f.read()
        has_breadcrumb_schema = '"@type":"BreadcrumbList"' in post_html
        has_breadcrumb_visible = "Home" in post_html and "Blog" in post_html and post_dir.replace("-", " ") in post_html
        print(f"  {post_dir}: schema={has_breadcrumb_schema}, visible={has_breadcrumb_visible}")
        if not has_breadcrumb_schema:
            print(f"  → MISSING BreadcrumbList JSON-LD in {post_dir}")
    except Exception as e:
        print(f"  Error reading {post_path}: {e}")

print("\n── SUMMARY ──")
print(f"Final length: {len(html)}")
print(f"Change: {len(html) - original_len:+d} chars")
with open(path, "w", encoding="utf-8") as f:
    f.write(html)
print("✓ Written to disk")