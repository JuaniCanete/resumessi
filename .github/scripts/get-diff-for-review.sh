#!/bin/sh
# Shared by .github/workflows/opencode.yml (both jobs): fetch main, dump the
# filtered unified diff, cap it for the review prompt, guarantee non-empty.
set -e
git fetch origin main --depth=1
git diff -U3 origin/main -- . ":!package-lock.json" ":!*.db" ":!*.db-wal" ":!*.db-shm" ":!*.log" ":!public/dist/" > /tmp/diff_raw.txt || true
node .github/scripts/cap-diff.js
if [ ! -s /tmp/diff_capped.txt ]; then
	echo "[NO TEXT DIFF — report nothing, VERDICT: Approved]" > /tmp/diff_capped.txt
fi
echo "diff_size=$(wc -c < /tmp/diff_capped.txt) bytes"
