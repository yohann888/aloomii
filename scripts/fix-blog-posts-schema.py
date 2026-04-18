#!/usr/bin/env python3
"""Fix BreadcrumbList JSON-LD on all blog post pages."""
import os, re

blog_dir = "/Users/superhana/Desktop/aloomii/blog"
BLOG_URL = "https://aloomii.com/blog"

# Slug to readable title (derived from slug)
def slug_to_title(slug):
    return slug.replace("-", " ").title()

fixed = []
missing = []
errors = []

for entry in os.listdir(blog_dir):
    post_path = f"{blog_dir}/{entry}/index.html"
    if not os.path.isfile(post_path) or entry == "_astro":
        continue

    with open(post_path, "r") as f:
        html = f.read()

    post_url = f"https://aloomii.com/blog/{entry}"
    post_title = slug_to_title(entry)
    new_breadcrumb = (
        f'{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":['
        f'{{"@type":"ListItem","position":1,"name":"Home","item":"https://aloomii.com/"}},'
        f'{{"@type":"ListItem","position":2,"name":"Blog","item":"https://aloomii.com/blog"}},'
        f'{{"@type":"ListItem","position":3,"name":"{post_title}","item":"{post_url}"}}]}}'
    )

    if '"@type":"BreadcrumbList"' not in html:
        # Missing entirely - inject after the Organization JSON-LD
        # Find the Organization JSON-LD script tag and add after it
        org_match = re.search(r'(<script type="application/ld\+json">\{[^}]*"@type":"Organization"[^}]*\}</script>)', html)
        if org_match:
            inject_after = org_match.end()
            html = html[:inject_after] + f'\n<script type="application/ld+json">{new_breadcrumb}</script>' + html[inject_after:]
            fixed.append(f"{entry} (added new)")
        else:
            # Try Blog JSON-LD as anchor
            blog_match = re.search(r'(<script type="application/ld\+json">\{[^}]*"@type":"Blog"[^}]*\}</script>)', html)
            if blog_match:
                inject_after = blog_match.end()
                html = html[:inject_after] + f'\n<script type="application/ld+json">{new_breadcrumb}</script>' + html[inject_after:]
                fixed.append(f"{entry} (added after Blog)")
            else:
                missing.append(entry)
    else:
        # Has BreadcrumbList - check if post item (item 3) is present
        m = re.search(r'"@type":"BreadcrumbList".*?"itemListElement":\[(.*?)\]', html, re.DOTALL)
        if m and '"name":"' + post_title + '"' not in m.group(1) and '"name":"' + entry.replace("-", " ") + '"' not in m.group(1).lower():
            # Post item not present - need to add it
            # Replace the existing 2-item list with 3-item list
            old_schema_match = re.search(r'<script type="application/ld\+json">\{?"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":\[.*?\]</script>', html, re.DOTALL)
            if old_schema_match:
                old_schema = old_schema_match.group()
                new_schema = f'<script type="application/ld+json">{new_breadcrumb}</script>'
                html = html.replace(old_schema, new_schema)
                fixed.append(f"{entry} (upgraded to 3 items)")
            else:
                # Try alternate format
                alt_match = re.search(r'<script type="application/ld\+json">[^<]*?"@type":"BreadcrumbList"[^<]*</script>', html, re.DOTALL)
                if alt_match:
                    old_schema = alt_match.group()
                    new_schema = f'<script type="application/ld+json">{new_breadcrumb}</script>'
                    html = html.replace(old_schema, new_schema)
                    fixed.append(f"{entry} (upgraded alt format)")
                else:
                    errors.append(f"{entry} (has schema but cant find tag)")
        elif m and '"name":"' + post_title + '"' in m.group(1):
            fixed.append(f"{entry} (already complete)")

    with open(post_path, "w") as f:
        f.write(html)

print(f"Fixed: {len(fixed)}")
print(f"Missing (injection failed): {missing}")
print(f"Errors: {errors}")
if fixed:
    print("Sample fixes:")
    for x in fixed[:5]:
        print(f"  {x}")
if missing:
    print("Missing (could not inject):")
    for x in missing:
        print(f"  {x}")
if errors:
    print("Errors:")
    for x in errors:
        print(f"  {x}")