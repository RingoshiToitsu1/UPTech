#!/usr/bin/env bash
# Usage: ./scripts/set-domain.sh mydomain.com
# Swaps the placeholder domain in every page, the sitemap and robots.txt, and writes CNAME for GitHub Pages.
set -e
[ -z "$1" ] && { echo "Usage: $0 mydomain.com"; exit 1; }
D="${1#https://}"; D="${D#http://}"; D="${D%/}"
cd "$(dirname "$0")/.."
grep -rl "https://yourdomain.com" --include="*.html" --include="*.xml" --include="*.txt" . | while read -r f; do
  sed -i.bak "s#https://yourdomain.com#https://$D#g" "$f" && rm "$f.bak"
done
echo "$D" > CNAME
echo "Done. Domain set to https://$D (CNAME written)."
