#!/bin/sh
# Montra macOS launcher; paths are relative to this file.
cd -- "$(dirname -- "$0")" || exit 1
PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.docker/bin:$PATH"
export PATH
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 22+ and reopen. / 请安装 Node.js 22 或更新版本后重新打开。'
  printf '%s' 'Press Enter to close / 按回车关闭：'
  read -r answer
  exit 1
fi
node scripts/launch.mjs
result=$?
if [ "$result" -ne 0 ]; then
  printf '%s' 'Launch failed. Press Enter to close / 启动失败，按回车关闭：'
  read -r answer
fi
exit "$result"
