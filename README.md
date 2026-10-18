# Montra

## 云端日常使用（1.8.1）

你的三个系统版本使用同一个云端网址。已连接云端的包解压后，双击 `open-ledger.html` 或系统启动入口即可使用；只需浏览器和网络，无需安装 Node.js、Docker 或 SQL Server。输入原账本密码登录，在“设置 → 退出登录”退出；退出不会删除账单，也不影响其他设备。一个私有登录下可以添加多本账本，电脑和手机共享。Cloudflare 账号只用于管理和发布。

下方 SQL Server 安装步骤仅用于可选的本机模式；本机数据与云端数据不持续双向同步。未连接云端的源码包仍按本机说明安装。详见 [云端说明](docs/cloud.md)。

## 1.8.1 · 三平台版本

| 版本 | 版本号 | 启动入口 | 从环境、安装到使用 |
|---|---|---|---|
| macOS | 1.8.1-macos | launch.command / start.command | [macOS 使用说明](docs/macOS.md) |
| Linux | 1.8.1-linux | sh start.sh | [Linux 使用说明](docs/Linux.md) |
| Windows | 1.8.1-windows | launch.cmd / start.cmd | [Windows 使用说明](docs/Windows.md) |

**Windows 和 Linux 版默认连接原生 SQL Server，无需 Docker。分别按系统说明安装 SQL Server 并设置 SQL_PASSWORD；SQL_USE_DOCKER=0 会彻底禁用 Docker 调用。Windows 也无需 WSL。**

共同核心版本是 1.8.1，平台版本号在各平台包的 VERSION、release.json、启动窗口、界面底部和 /api/health 中标识。这是需要安装 Node.js 和连接 SQL Server 的源码版本，不是免安装二进制软件。

请先按自己的系统阅读对应说明。已有 SQL Server 不强制使用 Docker。复制项目不等于迁移旧账单，详见 [数据与迁移](docs/data-and-migration.md)；改动记录见 [CHANGELOG.md](CHANGELOG.md)。

三个入口都读取项目根目录 .env 的 PORT 和 SQL_CONTAINER。使用容器时请先自行打开 Docker；入口只安装缺失运行依赖并尝试启动已有容器，新库初始化需要单独完成。远程 SQL Server 不会尝试启动本机 Docker。

*Your money, your way.*
[English](README.en.md) | [简体中文](README.md)

一个本地运行的收支记账软件：用界面快速记账，也可以在 SQL 工作台查询账单，也可使用独立终端管理 SQL。三种方式共享 SQL Server 中同一张 `dbo.jilu` 表。

**MIT 开源许可证 · Node.js 22+ · SQL Server 2022 · macOS / Linux / Windows 启动入口**

## 1.8.1：可选密码、SQL 编辑和英文文件名

访问密码现在可以在“访问设置”中开启或关闭，开启时最低 4 个字符（如 abcd、5656、ab56）。新安装默认不启用密码，升级会保留原设置。SQL 工作台默认允许查询、新增和修改账单。请先停止旧版，在原账本连接配置下运行：

```sh
npm ci --omit=dev
npm run db:secure
```

新账本先运行 `npm run db:init`，再运行加固命令。加固会备份全部账单并配置专用低权限账号，不修改原记录。使用旧版密码的账本仍可从终端提示的 `.montra/initial-access-password.json` 读取初始密码，之后在“访问设置”选择开启、关闭或修改。`npm run db:backup` 可导出受本机文件权限保护的账单备份。详细权限、远程证书、升级和忘记密码的处理见 [安全说明](SECURITY.md)。`.montra`、`.env`、密码和备份都不能分享。

## 功能

页面右上角可切换简体中文和 English。首次使用按浏览器支持的语言选择，其他语言默认英文；手动选择会保存在当前浏览器。切换时保留账单表单、筛选条件和 SQL 草稿，用户的类别、备注、查询结果与原始 SQL Server 报错不会翻译。界面日期按所选语言显示，原生日期/月历选择器按浏览器及系统语言显示。

- 快速记录收入、支出、日期、类别和备注；快捷类别和键盘保存。
- 本月截至今天的收入、支出、结余；所有月份截至今天的累计盈亏。
- 切换月份，按类别、收支类型和备注搜索；账单分页与支出类别分布。
- 账单逐行编辑：修改日期、收入/支出、金额、类别和备注，保存后同步更新统计；支持取消与并发冲突提示。
- 访问设置可选密码开关，开启时最低 4 字符；启动脚本、说明及私密文件均使用英文文件名。
- 保存后立即更新；每 10 秒同步终端对数据库的修改。
- 内置 SQL 工作台：编辑代码、⌘ / Ctrl + Enter 执行、支持 GO 分批、多结果表格、PRINT、影响行数与报错行号。
- SQL 示例只填入编辑器，不自动执行。使用字符串值展示结果，不执行结果中的 HTML。

金额沿用数据库的记账单位，不进行币种转换。累计盈亏是已记录收入减支出，不代表银行卡余额，不包含记账前的存款。

## 需要准备

- [Node.js](https://nodejs.org/) 22 或更新版本。
- [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)，或者已有可连接的 SQL Server。
- 默认连接 `127.0.0.1:1433`，数据库 `jizhang`，容器 `sqlserver`。

Apple M 芯片运行 SQL Server 容器需要模拟 x86-64。模拟是否可用取决于 Docker 和系统版本，微软不正式支持模拟环境；稳定使用建议连接另一台 x64 SQL Server。详见 [SQL Server 容器说明](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-docker-container-deployment?view=sql-server-ver16)。

## 使用现有账本

先停止旧版服务，按上方安全升级步骤执行 `npm run db:secure`，再启动本版。

下载源码并解压，双击 `launch.command`。先自行打开 Docker Desktop。入口首次启动会安装运行依赖、尝试启动配置的已有容器，并在浏览器打开 http://127.0.0.1:3210。

使用期间保留启动时打开的终端窗口。按 Control+C 关闭界面服务，不会删除数据库。若 Mac 没有为 `.command` 保留可执行权限，可在项目目录运行 `chmod +x launch.command`。

仅 macOS 默认使用 Docker；其他系统默认请按上方原生数据库说明。已明确设置 SQL_USE_DOCKER=1 的 Docker 环境也可手动启动：

```sh
npm ci --omit=dev
docker start sqlserver
npm start
```

然后打开 http://127.0.0.1:3210。

已有数据不会迁移或重新创建。只有初始化/加固命令可从已有本机容器读取管理密码；日常网页使用专用低权限凭据。Windows/Linux 默认不调用 Docker。密码不会发送给浏览器。若曾修改数据库账号密码，可在页面连接提示中输入当前密码；只保留在本次服务进程的内存中。

## 从零安装（新使用者）

不要对已有同名容器运行下面的新容器步骤；已有账本请用上一节。

1. 复制 `.env.example` 为 `.env`，填写自己设置的 `SQL_PASSWORD`。建议至少 12 位，包含大小写字母、数字和符号。不要把 `.env` 上传到 GitHub。
2. 在项目文件夹打开终端：

```sh
npm ci --omit=dev
docker compose up -d
docker compose logs --tail 30
```

3. 日志出现 `SQL Server is now ready for client connections` 后执行：

```sh
npm run db:init
npm run db:secure
npm start
```

4. 在浏览器打开 http://127.0.0.1:3210，开始录入自己的账单。

`db:init` 只创建缺失的数据库和表，不删除或覆盖已有数据。新数据库是空的，源码不含个人账单。Docker 的命名卷保存数据；不要为了停止软件使用 `docker compose down -v`，它会删除卷中的数据库。

## 数据库结构

默认表为 `jizhang.dbo.jilu`：

| 列 | 类型 | 含义 |
|---|---|---|
| id | INT IDENTITY(1,1) PRIMARY KEY | 自动编号 |
| riqi | DATE NOT NULL | 日期 |
| type | VARCHAR(1) NOT NULL | i 收入，e 支出 |
| amount | DECIMAL(10,2) NOT NULL | 正数金额 |
| category | NVARCHAR(50) NOT NULL | 类别 |
| note | NVARCHAR(200) | 可空备注 |

可在 `.env` 设置 `SQL_SERVER`、`SQL_PORT`、`SQL_USER`、`SQL_DATABASE`、`SQL_PASSWORD`、`SQL_CONTAINER` 和界面 `PORT`。详细配置见 `.env.example`。三个平台的启动入口都支持 .env 的自定义 PORT，默认 3210。

## SQL 工作台

工作台使用单独的账单专用账号，默认允许 SELECT、INSERT 和 UPDATE，可直接查询、新增和修改 dbo.jilu 中的账单。执行后列表和统计自动刷新。表单新增和明细“编辑”也继续可用。原来的管理员终端由你自行管理，本软件不会限制外部工具的管理员权限。

```sql
SELECT * FROM dbo.jilu
WHERE type = 'e' AND category = 'eat'
ORDER BY riqi DESC, id DESC;
GO
```

按 ⌘/Ctrl+Enter 执行，示例只填入编辑器。每次运行最多 12 KB、20 个 GO 批次、约 30 秒，结果最多显示 1,000 行和 20 个结果集。变量与临时表不跨多次点击保留，未提交事务会回滚。禁止 sqlcmd 文件指令和 shell 命令。

## 开发和测试

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

macOS 上还可检查 WebKit（Safari 使用的浏览器引擎）：

```sh
npx playwright install webkit
BROWSER=webkit npm run test:browser
```

需要验证真实保存与浏览器到数据库的完整流程时，可在 SQL Server 已运行、账号有建库权限的环境执行 `node test/live-browser-check.mjs`。它新建随机命名的独立测试库，测试金额、中文、⌘+Enter、SQL、搜索和分页，完成后删除测试库，不写入原有账本。设置 `BROWSER=webkit` 可改用 WebKit；Chrome 可通过 `CHROME_PATH` 指定。

浏览器测试使用内存中的隔离账单，不连接个人账本。需要使用已有 Chrome 时，可设置 `CHROME_PATH` 为浏览器可执行文件路径。

有本地数据库时，可以运行额外的真实连接验证：

```sh
node test/readonly-check.mjs
node test/sql-live-check.mjs
```

前者只读账单并核对汇总；后者仅 SELECT 和连接内临时表操作，不写入个人 `jilu` 表。`node test/init-check.mjs` 可验证首次初始化及重复运行；它仅创建并清理一个随机命名的空测试数据库，不操作个人账本。

## 项目文件

```text
montra/
├── launch.command      Mac 启动入口
├── server.mjs           本机 HTTP 服务
├── database.mjs         SQL Server 连接和账单查询
├── sql-console.mjs      SQL 分批和结果输出
├── domain.mjs           输入验证
├── public/              界面
├── scripts/             数据库初始化、源码打包
├── test/                自动验证
├── compose.yaml         新使用者的数据库环境
├── .env.example         配置模板（没有密码）
├── package-lock.json    固定依赖版本
└── LICENSE              MIT 许可证
```

## 分享或发布源码

源码打包需要 Python 3.9+（只使用标准库；普通使用不需要 Python）。运行 `npm run package` 同时生成 `dist/montra-1.8.1-source.zip`、`dist/montra-1.8.1-macos.zip`、`dist/montra-1.8.1-linux.zip`、`dist/montra-1.8.1-windows.zip`。打包采用固定文件白名单，不包括 `.env`、个人账单、数据库备份、截图、node_modules 或 Git 历史。解压后是一个完整项目文件夹，首次使用需要安装依赖和配置自己的数据库。

发布到 GitHub 时上传源码文件即可，不要上传数据库、密码或账单。仓库内容由 `.gitignore` 排除本机配置与生成文件。GitHub Actions 自动执行基础测试。

贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)，本机运行的权限边界见 [SECURITY.md](SECURITY.md)，授权条款见 [LICENSE](LICENSE)。

中英文翻译集中在 `public/i18n.js`，新增语言时应保留相同的字典键和模板参数。自动测试检查字典完整性、语言回退、选择持久化和切换时的草稿保留。

## 免费云端版：电脑和手机共用账本

Mac 双击 `publish-cloud.command`，Windows 双击 `publish-cloud.cmd`，Linux 运行 `publish-cloud.sh`。
设置页会引导你注册/登录 Cloudflare 免费账号、设置账本密码并迁移账单。
以后在电脑和手机打开同一个网址即可；电脑关机不影响使用。日常无需安装数据库。
高级 SQL 工具默认折叠；设置和备份收在“设置”菜单中。
发布使用你自己的 Cloudflare 免费账号；设置页会引导完成授权。
详见 [cloud guide](docs/cloud.md)。

## 一个账号，多个账本

云端页面顶部的“账本”下拉框可切换账本；点“＋ 添加账本”，输入名称即可创建并进入空白账本。
原有记录会保留在“默认账本”。不同账本分别统计收入、支出、余额、类别和记录；每页仍为 10 条。
电脑和手机可各自选择正在使用的账本。SQL 工作台自动限定在当前账本中，备份按钮会导出所有账本。
切换时会在当前页面保留各账本未保存的新增草稿；关闭页面后草稿不作为正式记录保存。
