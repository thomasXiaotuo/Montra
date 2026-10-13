#!/bin/zsh
cd "${0:A:h}" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.docker/bin:$PATH"
if ! command -v node >/dev/null; then
  print 'Node.js is required. Install it and reopen. / 请安装 Node.js 后重新打开。'
  read '?Press Enter to close. / 按回车关闭…'
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)'; then
  print 'Node.js 22+ is required. / 请更新到 Node.js 22 或更新版本。'
  read '?Press Enter to close. / 按回车关闭…'
  exit 1
fi
if ! test -d node_modules/mssql; then
  print 'First launch: installing dependencies… / 首次启动：正在安装依赖…'
  npm ci --omit=dev || { read '?Installation failed. Press Enter to close. / 安装失败，按回车关闭…'; exit 1; }
fi
if curl -fsS --max-time 2 http://127.0.0.1:3210/api/health 2>/dev/null | /usr/bin/grep -Eq '"app":"(montra|jizhang-local)"'; then
  open http://127.0.0.1:3210
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  print 'Starting Docker Desktop… / 正在打开 Docker Desktop…'
  open /Applications/Docker.app
  for attempt in {1..30}; do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi
if docker info >/dev/null 2>&1; then
  docker start sqlserver >/dev/null 2>&1 || print 'Could not start sqlserver; check the connection message in the app. / 未能启动 sqlserver，请查看界面连接提示。'
else
  print 'Docker is not running yet. Start it, then refresh the app. / Docker 尚未运行，打开后在界面点刷新。'
fi
print 'Keep this Terminal window open while using the app. / 使用时请保持这个终端窗口打开。'
export LEDGER_OPEN_BROWSER=1
node server.mjs
read '?Service stopped. Press Enter to close. / 服务已停止，按回车关闭…'
