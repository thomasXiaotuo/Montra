#!/bin/sh
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Please install Node.js 22+ first: https://nodejs.org/'
  exit 1
fi
if [ ! -f node_modules/wrangler/bin/wrangler.js ]; then
  npm ci --include=dev || exit 1
fi
exec node scripts/cloud-setup.mjs
