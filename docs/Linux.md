# Montra Linux 使用说明（无需 Docker）

版本号：**1.3.1-linux**；共同核心版本：**1.3.1**。Linux 版默认直接连接原生或远程 SQL Server，不需要安装或运行 Docker。与 Windows/macOS 版共享记账和 SQL 工作台功能。

这是需要 Node.js 与数据库的源码版本，并非免安装二进制软件。完整解压 montra-1.3.1-linux.zip，首次安装需要联网。不要从其他系统复制 node_modules。

## 一、环境要求

- Node.js 22+，推荐 24 LTS。按 [Node.js 官方下载页](https://nodejs.org/en/download) 选择 Linux 和 CPU 架构，安装后确保 node 与 npm 在 PATH 中。发行版自带版本可能较旧。
- 本地数据库示例使用 **Ubuntu 22.04 LTS x86-64 + SQL Server 2022**。SQL Server 对操作系统和架构有要求；其他发行版请按 [微软 Linux 安装支持表](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/setup?view=sql-server-ver16) 选择适配的版本，不要套用 Ubuntu 命令。
- ARM Linux 或不支持本地安装 SQL Server 的发行版，可以直接连接另一台受支持的 x64 SQL Server；本机同样无需 Docker。
- 桌面浏览器。自动打开浏览器需要 xdg-open；Ubuntu 可安装 xdg-utils。无图形桌面时设置 LEDGER_OPEN_BROWSER=0，自行安排浏览器访问；网页仍只监听本机 127.0.0.1，不会自动开放外网端口。
- 数据库请预留足够磁盘和内存；小型本地环境建议至少约 4 GB 可用内存。实际要求以所选 SQL Server 版本为准。

检查 Node.js 与系统：

```sh
node --version
npm --version
uname -m
cat /etc/os-release
```

## 二、安装原生 SQL Server（已有数据库则跳过）

下列步骤仅用于 **Ubuntu 22.04 x64 上新安装 SQL Server 2022**。如果原来已有实例，不要重新安装、重配或删除数据目录。其他系统使用对应的 [微软安装教程](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-ubuntu?tabs=ubuntu2204&view=sql-server-ver16)。

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc -o /tmp/montra-microsoft.asc
sudo install -m 644 /tmp/montra-microsoft.asc /etc/apt/trusted.gpg.d/microsoft.asc
curl -fsSL https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list -o /tmp/montra-mssql-server.list
sudo install -m 644 /tmp/montra-mssql-server.list /etc/apt/sources.list.d/mssql-server-2022.list
sudo apt-get update
sudo apt-get install -y mssql-server
sudo /opt/mssql/bin/mssql-conf setup
```

最后一步交互选择 **Express**（适合轻量个人记账），接受对应许可并设置自己的 sa 强密码；Developer 仅适用于开发测试。密码保留在自己电脑上，不写入分享的文件。然后启动并检查服务：

```sh
sudo systemctl enable --now mssql-server
systemctl status mssql-server --no-pager
```

默认 TCP 端口为 1433；若被占用，可用下面的管理命令选其他端口，并同步修改 Montra 的 SQL_PORT：

```sh
sudo /opt/mssql/bin/mssql-conf set network.tcpport 14330
sudo systemctl restart mssql-server
```

仅本机使用不需要开放面向公网的数据库端口。远程数据库由管理员提供地址、端口、账号和所需网络访问。

## 三、配置软件连接

进入完整解压目录（替换为实际路径），首次创建配置：

```sh
cd "/你的路径/montra-1.3.1-linux"
test -f .env || cp .env.example .env
nano .env
```

已有 .env 不要覆盖。填写自己的实际密码；端口若修改过要保持一致：

```dotenv
SQL_USE_DOCKER=0
SQL_SERVER=127.0.0.1
SQL_PORT=1433
SQL_USER=sa
SQL_PASSWORD='填写你自己的实际密码'
SQL_DATABASE=jizhang
PORT=3210
```

SQL_USE_DOCKER=0 禁用容器启动与容器密码读取；Linux 不填此项时也默认禁用。数据库密码须配置或在页面输入。本程序使用 SQL 账号认证。

远程数据库不需本机安装 SQL Server，只需把 SQL_SERVER、SQL_PORT、SQL_USER、SQL_PASSWORD 改为实际值。Mac 上已有历史账单时，连接其可访问的 SQL Server，或先备份并恢复到 Linux，不能靠复制源码自动获得账单。

## 四、安装依赖与准备账本

```sh
npm ci --omit=dev
```

已有 jizhang.dbo.jilu 表可以直接启动；全新数据库使用有建库权限的 SQL 账号初始化：

```sh
npm run db:init
```

只创建缺失的数据库与表，不删除已有记录。新建数据库从空账单开始。使用权限受限账号时，请让管理员先建库建表。

## 五、启动与停止

```sh
sh start.sh
```

也可 chmod +x start.sh 后执行 ./start.sh。入口读取项目根目录 .env，安装缺失依赖并打开 http://127.0.0.1:3210。更改 PORT 后打开相应地址。启动窗口和页面底部显示版本。

入口不会安装、启动或配置 SQL Server 服务；数据库服务需要按第二节单独准备。网页使用期间保留终端，按 Ctrl+C 关闭网页服务。手动方式 npm start 不会自动打开浏览器。

## 原生数据库备份（不使用 Docker）

可按 [微软说明](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-ubuntu?tabs=ubuntu2204&view=sql-server-ver16) 安装可选 mssql-tools18，然后以有备份权限的账号连接 /opt/mssql-tools18/bin/sqlcmd -S 127.0.0.1 -U sa -C（密码按提示输入）。本程序本身不依赖 sqlcmd。

先在数据库服务器上准备备份目录：

```sh
sudo install -d -o mssql -g mssql -m 750 /var/opt/mssql/backup
```

在 SQL 提示符执行（为每次备份使用新的文件名）：

```sql
BACKUP DATABASE [jizhang]
TO DISK = N'/var/opt/mssql/backup/jizhang-20261016.bak'
WITH COPY_ONLY, CHECKSUM;
GO
RESTORE VERIFYONLY FROM DISK = N'/var/opt/mssql/backup/jizhang-20261016.bak' WITH CHECKSUM;
GO
EXIT
```

备份文件在数据库服务器上，以合适的权限另存到安全位置。跨机恢复使用 SQL Server 的 RESTORE，参照 docs/使用与数据.md；SQL Server 备份不能恢复到更旧的主版本。

## 日常使用

启动后浏览器进入 `http://127.0.0.1:3210`；若修改了 `.env` 的 `PORT`，使用新端口。启动窗口和页面底部均显示版本，`/api/health` 可查看版本信息。

1. 页面显示“账本已连接”后，选择收入或支出，输入正数金额（最多两位小数）、日期、类别和备注，点“保存账单”。
2. 通过月份、类别、收支类型或搜索框查找记录。“所有月份”可以查看跨月记录；账单每页 50 笔。
3. 页面右上角可以切换中文/English。保存后刷新统计；每 10 秒自动同步数据库变化。
4. 下方 SQL 工作台可以执行 `SELECT` 查询，按 ⌘/Ctrl+Enter 执行。示例只填入编辑器，不自动执行。
5. 现有界面通过 SQL 工作台修改记录：先查询并确认 `id`，再执行如 `UPDATE dbo.jilu SET note=N'修正备注' WHERE id=123;`。把 123 换成实际编号，操作前先备份。当前表单用于新增记录，没有逐行编辑按钮。
6. 月结余和累计盈亏是已录入的收入减支出，统计截至今天；未来日期的记录不计入截至今天的汇总。金额不自动换汇，也不包含记账前的银行余额。

使用期间保持启动窗口打开。停止网页服务按 Ctrl+C，不删除账单。SQL Server 作为系统服务运行；按需用 sudo systemctl stop mssql-server 暂停服务，这不会删除账单。

## 数据、更新与跨电脑迁移

原生 SQL Server 的默认数据目录是 /var/opt/mssql/data，也可以由管理员改到其他位置；不是 Montra 项目文件夹。复制软件不会迁移账单。不要直接移动正在运行的数据库文件。

升级：先停止 Montra，备份 `.env` 和 SQL Server 数据库；把新版本解压到新目录，复制自己的 `.env`，连接原数据库，再安装依赖并启动。不要覆盖旧的 node_modules，也不要为升级卸载 SQL Server 或重建数据库。

在 Mac、Linux、Windows 之间迁移时，重新安装相应平台依赖，使用 SQL Server 的 BACKUP/RESTORE 搬运数据库。不要复制运行中的 `.mdf/.ldf`，也不要直接复制 Docker 的虚拟磁盘。详细操作见项目中的 `docs/使用与数据.md`。三个版本不会自动跨电脑同步。

## 常见问题

- **Node.js 找不到或版本太旧**：安装 Node.js 22+，推荐 24 LTS；安装完重新打开终端，确认 `node --version` 和 `npm --version`。
- **首次依赖安装失败**：检查网络和代理，在项目目录手动运行 `npm ci --omit=dev` 后重试。首次安装需要联网；已装好的依赖可重复使用。
- **数据库未连接**：先运行 systemctl status mssql-server --no-pager 检查服务，再检查 .env 的服务器、端口、账号、密码和数据库名称；本机服务日志可用 sudo journalctl -u mssql-server -n 50 --no-pager 查看。新数据库准备好后才运行 `npm run db:init`。已有数据库密码变更后可在页面重试连接。
- **端口占用**：HTTP 端口由 `.env` 的 `PORT` 控制；SQL Server 端口由 `SQL_PORT` 控制。修改配置后重启。SQL Server 的端口在 mssql-conf 中配置，变更后需要重启数据库服务。
- **重复启动**：同一端口已运行 Montra 时，入口会打开现有实例；升级后要先关闭旧实例才能使用新版本。
- **没有自动打开浏览器**：手动打开启动窗口输出的地址即可；Linux 无图形桌面时不会有浏览器窗口。
- **密码包含 `$` 或 `#`**：在 `.env` 中用单引号包住密码，避免配置解析歧义；不要把真实密码上传或发给他人。

本软件仅供本机单人使用，HTTP 绑定 `127.0.0.1`。SQL 工作台会操作真实数据；不要向公网开放界面。

