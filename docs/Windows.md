# Montra Windows 使用说明（无需 Docker）

## 云端版：日常只需打开、登录

已连接云端的安装包会附带 `open-ledger.html`。完整解压后，双击它，或运行 `start.cmd`，即可打开同一个云端账本；电脑只需联网和浏览器，无需安装 Node.js、Docker 或 SQL Server。Linux 的脚本入口需要 xdg-open，也可直接用浏览器打开 HTML 文件。

1. 输入原来的账本密码，点“登录”。这里不需要 Cloudflare 登录。
2. 通过账本选择框切换账本，或点“＋ 添加账本”。电脑和手机使用同一网址、同一密码，看到同一组账本。
3. 点右上角“设置 → 退出登录”，清除本浏览器显示的账单和草稿；刷新后仍需登录。其他设备继续保持登录。退出不会删除云端账单。
4. “设置 → 导出备份”会导出全部账本。更改密码后，其他设备需要重新登录。

安装包仅包含公开的账本网址，不含密码、账单、数据库或 Cloudflare 凭据。没有云端连接的通用源码包仍按下方本机步骤运行。

## 可选：本机 SQL Server 模式

以下内容仅适用于本机模式。已连接云端的日常使用无需执行；需要回到本机时，在终端设置 `MONTRA_LOCAL=1` 后运行系统入口。两种存储不进行持续双向同步。

版本号：**1.8.1-windows**；共同核心版本：**1.8.1**。Windows 版默认直接连接 SQL Server，不调用、不要求安装 Docker。Mac 和 Linux 保持各自的环境方案。

这是需要安装 Node.js 和数据库的源码版本，不是免安装 EXE。解压 `montra-1.8.1-windows.zip` 并保留完整文件夹。首次安装需联网；完成后可以本机使用。

## 1.8.1 升级与访问设置

已有账本也须先停止旧版服务，在原连接配置下运行 `npm run db:secure`（Windows 可用 `npm.cmd run db:secure`）。它先备份全部账单，再创建记账专用账号及独立 SQL 编辑账号，不改动原有记录。全新数据库先执行 `npm run db:init`。

新安装默认不需要访问密码；在“访问设置”选择需要或不需要。需要时密码最低 4 个字符，例如 abcd、5656、ab56。已有账本保留原密码设置；旧初始密码文件改名为 `.montra/initial-access-password.json`，值不变。关闭已有密码需验证当前密码。访问密码与数据库管理密码不同。

`.montra` 保存受本机权限保护的凭据、密码散列和备份，不能随安装包分享。日常网页拒绝管理员账号；SQL 工作台默认允许查询、INSERT 新增和 UPDATE 修改账单，表单也继续可用。远程 SQL Server 必须配置可验证的证书。使用 `npm run db:backup` 导出账单备份；升级到同一电脑的新目录时安全复制自己的 .env 和 .montra，跨电脑请重新加固。更多内容见 [安全说明](../SECURITY.md)。

## 一、安装运行环境

### 1. Node.js

从 [Node.js 官方下载页](https://nodejs.org/en/download) 选择 Windows x64 安装器 `.msi`；最低 22，推荐 24 LTS。保留 npm 和加入 PATH 选项。安装后重新打开 PowerShell：

```powershell
node --version
npm.cmd --version
```

本机数据库方案针对 Windows x64；Windows ARM 可运行相应架构的 Node.js，数据库请连接独立的 x64 SQL Server。浏览器使用 Edge、Chrome 或 Firefox。

### 2. SQL Server 数据库（与管理工具是两种软件）

如果已有可连接的 SQL Server，不需要重复安装，直接进入配置步骤。新使用者安装 [SQL Server 2022 Express](https://www.microsoft.com/en-us/download/details.aspx?id=104781)，它是免费数据库版本，适合本地轻量记账。

1. 下载并运行安装器，选择 **Custom / 自定义**，下载完成后进入安装中心的“全新 SQL Server 独立安装”。
2. 功能选择包含“数据库引擎服务”。实例可以使用命名实例 **SQLEXPRESS**，记下实际实例名。
3. “数据库引擎配置”选择 **混合模式（SQL Server 身份验证和 Windows 身份验证）**。为 `sa` 设置自己的强密码，并“添加当前用户”为管理员。不要把密码写进共享文件。
4. 完成安装。SQL Server 会作为 Windows 服务运行，不需要 Docker 或 WSL。
5. 为方便配置和备份，可另装 [SQL Server Management Studio（SSMS）](https://learn.microsoft.com/en-us/ssms/install/install)。SSMS 只是管理工具，单独安装它不等于安装了数据库引擎。

如果先前采用 Basic 安装，往往只有 Windows 身份验证：用 SSMS 的 Windows 身份验证连接 `localhost\SQLEXPRESS`（按实际实例名调整），在服务器属性 → 安全性改成混合模式；在安全性 → 登录名 → sa 的属性中设置密码，并在状态页启用登录。更改后重启对应 SQL Server 服务。详见 [微软身份验证说明](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/change-server-authentication-mode?view=sql-server-ver16)。

### 3. 启用 TCP/IP，并固定数据库端口

本程序通过 TCP 地址和端口连接，不用 `localhost\SQLEXPRESS` 作为 SQL_SERVER，也不需要 SQL Server Browser 来查找动态端口。

1. 在开始菜单打开 **SQL Server 配置管理器**。SQL Server 2022 可按 Win+R 输入 `SQLServerManager16.msc`；若找不到，可运行 `C:\Windows\SysWOW64\SQLServerManager16.msc`。其他 SQL Server 主版本使用相应配置管理器。
2. 在“SQL Server 网络配置 → SQLEXPRESS 的协议”中启用 **TCP/IP**。
3. 打开 TCP/IP 属性；Protocol 页确认 Listen All 为 Yes。在 IP Addresses 页的 **IPAll** 中，把 TCP Dynamic Ports 清空（不是填 0），TCP Port 填 **1433**。若 1433 被其他实例占用，选择如 14330，并同步修改 `.env` 的 SQL_PORT。
4. 在“SQL Server 服务”重启 **SQL Server (SQLEXPRESS)**。只在本机使用时不需要新建面向公网的防火墙入站规则。
5. 检查服务和端口：

```powershell
Get-Service -Name 'MSSQL$SQLEXPRESS'
Test-NetConnection 127.0.0.1 -Port 1433
```

若使用默认实例，服务名为 `MSSQLSERVER`。连接失败时先核对服务、TCP/IP、实际端口与混合模式，相关说明见 [微软 TCP 连接配置](https://learn.microsoft.com/en-us/sql/relational-databases/lesson-2-connecting-from-another-computer?view=sql-server-ver16)。

## 二、解压软件并配置连接

在 PowerShell 进入解压目录（路径换成自己的；本次修改的源码目录是 `C:\zhuomian\meC\Montra`）：

```powershell
Set-Location "C:\你的解压路径\montra-1.8.1-windows"
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

填写以下配置，密码换成安装数据库时自己设置的值。已有 .env 不要覆盖，补充 SQL_USE_DOCKER=0 即可。

```dotenv
SQL_USE_DOCKER=0
SQL_SERVER=127.0.0.1
SQL_PORT=1433
SQL_USER=sa
SQL_PASSWORD='填写你自己的实际密码'
SQL_DATABASE=jizhang
PORT=3210
```

`SQL_USE_DOCKER=0` 明确关闭容器启动和密码自动读取；管理密码须在加固命令运行前配置，网页重连仅对应专用账号。本程序使用 SQL 账号认证，不支持 Windows 集成认证。

连接远程 SQL Server 也不需要本机 Docker：把 SQL_SERVER、SQL_PORT、SQL_USER、SQL_PASSWORD 改成管理员提供的实际值。不要把真实 .env 和密码放进分发包。

## 三、安装依赖并准备账本

```powershell
npm.cmd ci --omit=dev
```

已有 `jizhang.dbo.jilu` 账本先运行 db:secure 再启动。全新的 SQL Server 第一次需要建库建表：

```powershell
npm.cmd run db:init
npm.cmd run db:secure
```

初始化只创建缺失的数据库和表，不删除或覆盖已有记录。`sa` 有初始化权限；若使用自建账号，应让数据库管理员先建好库表并授予所需权限。新库是空的，复制软件不会自动导入 Mac 上的旧账单。

## 四、启动与关闭

双击 `launch.cmd` 或 `start.cmd`，或在 PowerShell 运行：

```powershell
.\start.cmd
```

入口会读取本文件夹 .env，安装缺失的运行依赖，并在浏览器打开 `http://127.0.0.1:3210`。保持启动窗口打开，使用完成按 Ctrl+C。SQL Server 仍作为 Windows 服务运行。

也可 `npm.cmd start` 后手动访问地址。若 PowerShell 提示 npm.ps1 执行策略问题，用 npm.cmd，无需修改执行策略。脚本支持中文、空格路径，并自动切换到自身目录。

## 日常使用

启动后浏览器进入 `http://127.0.0.1:3210`；若修改了 `.env` 的 `PORT`，使用新端口。启动窗口和页面底部均显示版本，`/api/health` 可查看版本信息。

1. 页面显示“账本已连接”后，选择收入或支出，输入正数金额（最多两位小数）、日期、类别和备注，点“保存账单”。
2. 通过月份、类别、收支类型或搜索框查找记录。“所有月份”可以查看跨月记录；账单每页 10 笔。
3. 页面右上角可以切换中文/English。保存后刷新统计；每 10 秒自动同步数据库变化。
4. 下方 SQL 工作台可以执行 `SELECT` 查询、`INSERT` 新增和 `UPDATE` 修改，按 ⌘/Ctrl+Enter 执行。示例只填入编辑器，不自动执行。
5. 在账单明细中点击对应记录的“编辑”，修改日期、收入/支出、金额、类别或备注，点击“保存修改”（或 ⌘/Ctrl+Enter）即可更新原记录，列表和统计自动刷新。点击“取消”或按 Esc 放弃修改，不影响左侧新增表单。若记录在编辑期间被其他窗口或 SQL 修改/删除，会提示刷新后重新编辑，避免覆盖新内容。
6. 月结余和累计盈亏是已录入的收入减支出，统计截至今天；未来日期的记录不计入截至今天的汇总。金额不自动换汇，也不包含记账前的银行余额。

使用期间保持启动窗口打开。停止网页服务按 Ctrl+C，不删除账单。SQL Server 作为 Windows 服务运行，可在“服务”中管理 SQL Server (SQLEXPRESS)。停止网页服务不会停止数据库。

## 数据、更新与跨电脑迁移

软件文件与数据库分开：Windows 本机数据库保存在 SQL Server 实例的数据目录，不在 Montra 文件夹里。可以在 SSMS 的数据库属性 → 文件中查看路径；不要直接移动这些文件。直接移动软件文件夹不会迁移账单。

升级：先停止 Montra，备份 `.env` 和 SQL Server 数据库；把新版本解压到新目录，复制自己的 `.env`，连接原数据库，再安装依赖并启动。不要覆盖旧的 `node_modules`，也不要卸载或重建已有 SQL Server 实例。

在 Mac、Linux、Windows 之间迁移时，重新安装相应平台依赖，使用 SQL Server 的 BACKUP/RESTORE 搬运数据库。不要复制运行中的 `.mdf/.ldf`，也不要直接复制 Docker 的虚拟磁盘。详细操作见项目中的 `docs/data-and-migration.md`。三个版本不会自动跨电脑同步。

## 常见问题

- **Node.js 找不到或版本太旧**：安装 Node.js 22+，推荐 24 LTS；安装完重新打开终端，确认 `node --version` 和 `npm --version`。
- **首次依赖安装失败**：检查网络和代理，在项目目录手动运行 `npm ci --omit=dev` 后重试。首次安装需要联网；已装好的依赖可重复使用。
- **数据库未连接**：先在 Windows 服务中确认 SQL Server (SQLEXPRESS) 正在运行，检查 TCP/IP 是否启用、固定端口是否匹配、混合身份验证和 SQL 登录账号是否启用，再检查 `.env`。可用 `Test-NetConnection 127.0.0.1 -Port 1433` 检查监听。新数据库准备好后才运行 `npm run db:init`。已有数据库密码变更后可在页面重试连接。
- **端口占用**：HTTP 端口由 `.env` 的 `PORT` 控制；SQL Server 端口由 `SQL_PORT` 控制。修改配置后重启。原生 SQL Server 端口需要在 SQL Server 配置管理器里修改并重启数据库服务。
- **重复启动**：同一端口已运行 Montra 时，入口会打开现有实例；升级后要先关闭旧实例才能使用新版本。
- **没有自动打开浏览器**：手动打开启动窗口输出的地址即可；Linux 无图形桌面时不会有浏览器窗口。
- **密码包含 `$` 或 `#`**：在 `.env` 中用单引号包住密码，保持 Docker Compose 和 Node.js 读取一致；不要把真实密码上传或发给他人。

本软件仅供本机单人使用，HTTP 绑定 `127.0.0.1`。SQL 工作台使用账单专用账号；不要向公网开放界面。

