#!/usr/bin/env python3
"""Write the canonical static navigation into eligible HTML pages."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SNIPPET = (ROOT / "snippets" / "canonical-nav.html").read_text()
START = "<!-- CANONICAL_NAV_START -->"
END = "<!-- CANONICAL_NAV_END -->"
BLOCK = f"{START}\n{SNIPPET.rstrip()}\n{END}"
STYLESHEET = '<link rel="stylesheet" href="/snippets/canonical-nav.css">'
SCRIPT = '<script src="/snippets/canonical-nav.js"></script>'
EXCLUDED = (
    # The homepage is the source of truth for this snippet and is never rewritten.
    "index.html",
    # Jenny's portfolio is a preserved port and must not receive Aloomii navigation.
    "jenny/",
    "legal/",
    "playbook/",
    "aloomii-os.html",
    "terms.html",
    "client-terms.html",
    "privacy.html",
    "snippets/",
    "chamber-worker/",
    "demo/",
    "command/",
    "moji/",
    "gtm-audit/",
)


def excluded(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    return relative.startswith(EXCLUDED) or ".bak." in relative


def normalized_homepage_nav() -> str:
    homepage = (ROOT / "index.html").read_text()
    match = re.search(
        r"<!-- NAV -->\s*(<nav\b.*?</nav>\s*<div\b[^>]*class=\"mobile-menu\".*?</div>)",
        homepage,
        re.I | re.S,
    )
    if not match:
        raise RuntimeError("Homepage NAV source could not be found")
    normalized = re.sub(
        r'href="(#(?:builds|team|contact)|#)"',
        lambda m: f'href="/{m.group(1)}"'.replace('href="/#"', 'href="/"'),
        match.group(1).strip(),
    )
    return normalized.replace(
        '<button class="hamburger"',
        '<button id="hamburger" class="hamburger"',
    )


def assert_snippet_matches_homepage() -> None:
    if SNIPPET.strip() != normalized_homepage_nav():
        raise RuntimeError(
            "snippets/canonical-nav.html has drifted from index.html navigation"
        )


def replace_navigation(text: str) -> str | None:
    if START in text and END in text:
        pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
        return pattern.sub(BLOCK, text, count=1)

    nav = re.search(r"<nav\b[^>]*>.*?</nav>", text, re.I | re.S)
    if not nav:
        return None
    mobile = re.search(
        r'<div\b[^>]*class=["\'][^"\']*\bmobile-menu\b[^"\']*["\'][^>]*>.*?</div>',
        text,
        re.I | re.S,
    )
    end = mobile.end() if mobile and mobile.start() >= nav.end() else nav.end()
    return text[: nav.start()] + BLOCK + text[end:]


def main() -> None:
    assert_snippet_matches_homepage()
    changed = []
    for path in sorted(ROOT.rglob("*.html")):
        if excluded(path):
            continue
        original = path.read_text()
        updated = replace_navigation(original)
        if updated is None:
            continue
        if STYLESHEET not in updated:
            updated = updated.replace("</head>", f"  {STYLESHEET}\n</head>", 1)
        if SCRIPT not in updated:
            if "</body>" in updated:
                updated = updated.replace("</body>", f"  {SCRIPT}\n</body>", 1)
            else:
                updated = f"{updated.rstrip()}\n{SCRIPT}\n"
        if updated != original:
            path.write_text(updated)
            changed.append(path.relative_to(ROOT).as_posix())
    print(f"Synced canonical navigation to {len(changed)} pages.")
    for page in changed:
        print(page)


if __name__ == "__main__":
    main()
