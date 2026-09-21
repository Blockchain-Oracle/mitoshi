#!/usr/bin/env bash
# Re-pull Colosseum's live resource corpus and regenerate the link appendices.
# Colosseum updates this during the hackathon (sponsors/tracks get added), so
# run it every few days. `git diff` afterwards shows exactly what changed.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Fetching corpus..."
curl --fail --silent --show-error \
  -o data/colosseum-resources.json \
  https://ColosseumOrg.github.io/hackathon-resources/current.json
echo "Regenerating link appendices..."
python3 data/gen-links.py
echo "Done. Review with: git diff data/ context/tracks/_links/"
