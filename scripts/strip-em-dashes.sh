#!/bin/bash
# Strip em dashes from all blog HTML and replace with clean alternatives
# Usage: bash scripts/strip-em-dashes.sh
# Run before committing any blog content.

BLOG_DIR="$(dirname "$0")/../blog"
count=0

for f in "$BLOG_DIR"/*/index.html; do
  before=$(grep -c " — " "$f" 2>/dev/null || echo 0)
  if [ "$before" -gt 0 ]; then
    # Replace " — " with ": " when it's mid-sentence introducing something
    # and with ". " at sentence boundaries. Simple approach: replace all with " "
    # Human should review replacements — this is a safety net, not a substitute for writing without them.
    sed -i '' 's/ — /. /g' "$f"
    after=$(grep -c " — " "$f" 2>/dev/null || echo 0)
    echo "Fixed $(basename $(dirname $f)): $before → $after em dashes"
    count=$((count + before - after))
  fi
done

echo ""
echo "Stripped $count em dashes. Review replacements before committing."
