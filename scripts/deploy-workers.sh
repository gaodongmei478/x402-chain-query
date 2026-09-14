#!/usr/bin/env bash
# Seller Workers deploy. Never echo secret values.
# Default facilitator = PayAI (no CDP keys required).
set -euo pipefail
cd "$(dirname "$0")/.."

need() { [ -n "${!1:-}" ] || { echo "MISSING env: $1" >&2; exit 1; }; }
need CLOUDFLARE_API_TOKEN

if [ ! -d node_modules ]; then
  npm ci
fi

# Optional CDP only if still pointing at Coinbase facilitator
if [ -n "${CDP_API_KEY_ID:-}" ] && [ -n "${CDP_API_KEY_SECRET:-}" ]; then
  echo "[optional] wrangler secret put CDP_API_KEY_ID"
  printf '%s' "$CDP_API_KEY_ID" | npx wrangler secret put CDP_API_KEY_ID
  echo "[optional] wrangler secret put CDP_API_KEY_SECRET"
  printf '%s' "$CDP_API_KEY_SECRET" | npx wrangler secret put CDP_API_KEY_SECRET
else
  echo "[skip] CDP secrets not set (OK for PayAI/Heurist/Mogami defaults)"
fi

echo "[deploy] wrangler deploy"
npx wrangler deploy
echo "Done. Probe /health on printed workers URL."
