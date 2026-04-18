#!/usr/bin/env python3
"""Fix BreadcrumbList JSON-LD on all blog post pages - pass 2 for missing posts."""
import os, re

blog_dir = "/Users/superhana/Desktop/aloomii/blog"

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

    # Skip if already has complete BreadcrumbList with 3 items
    if '"@type":"BreadcrumbList"' in html:
        m = re.search(r'"@type":"BreadcrumbList".*?"itemListElement":\[(.*?)\]', html, re.DOTALL)
        if m:
            items = re.findall(r'"@type":"ListItem"', m.group(1))
            if len(items) >= 3:
                continue  # already complete

    post_url = f"https://aloomii.com/blog/{entry}"
    post_title = slug_to_title(entry)
    new_breadcrumb = (
        f'<script type="application/ld+json">\n  {{\n    "@context": "https://schema.org",\n    "@type": "BreadcrumbList",\n    "itemListElement": [\n      {{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://aloomii.com/" }},\n      {{ "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://aloomii.com/blog" }},\n      {{ "@type": "ListItem", "position": 3, "name": "{post_title}", "item": "{post_url}" }}\n    ]\n  }}\n  </script>'
    )

    # Find last </script> before </head> to inject after
    head_end = html.find('</head>')
    if head_end == -1:
        errors.append(f"{entry} (no </head> found)")
        continue

    last_script = html.rfind('</script>', 0, head_end)
    if last_script == -1:
        errors.append(f"{entry} (no </script> found)")
        continue

    inject_after = last_script + len('</script>')
    html = html[:inject_after] + '\n' + new_breadcrumb + html[inject_after:]
    fixed.append(entry)

    with open(post_path, "w") as f:
        f.write(html)

print(f"Fixed: {len(fixed)}")
if fixed:
    print("First 10:", fixed[:10])
if errors:
    print("Errors:")
    for x in errors:
        print(f"  {x}")