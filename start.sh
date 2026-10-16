#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 22+ first. / 请先安装 Node.js 22 或更新版本。'
  exit 1
fi
exec node scripts/launch.mjs
