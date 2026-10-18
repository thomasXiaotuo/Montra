#!/bin/sh
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '请先安装 Node.js 22 或更新版本，然后重新打开此文件。' 'https://nodejs.org/'
  read -r answer
  exit 1
fi
if [ ! -f node_modules/wrangler/bin/wrangler.js ]; then
  npm ci --include=dev || exit 1
fi
node scripts/cloud-setup.mjs
