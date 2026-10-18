# Montra macOS 使用说明

## 云端版：日常只需打开、登录

已连接云端的安装包会附带 `open-ledger.html`。完整解压后，双击它，或运行 `start.command`，即可打开同一个云端账本；电脑只需联网和浏览器，无需安装 Node.js、Docker 或 SQL Server。Linux 的脚本入口需要 xdg-open，也可直接用浏览器打开 HTML 文件。

1. 输入原来的账本密码，点“登录”。这里不需要 Cloudflare 登录。
2. 通过账本选择框切换账本，或点“＋ 添加账本”。电脑和手机使用同一网址、同一密码，看到同一组账本。
3. 点右上角“设置 → 退出登录”，清除本浏览器显示的账单和草稿；刷新后仍需登录。其他设备继续保持登录。退出不会删除云端账单。
4. “设置 → 导出备份”会导出全部账本。更改密码后，其他设备需要重新登录。

安装包仅包含公开的账本网址，不含密码、账单、数据库或 Cloudflare 凭据。没有云端连接的通用源码包仍按下方本机步骤运行。

## 可选：本机 SQL Server 模式

以下内容仅适用于本机模式。已连接云端的日常使用无需执行；需要回到本机时，在终端设置 `MONTRA_LOCAL=1` 后运行系统入口。两种存储不进行持续双向同步。

版本号：**1.8.1-macos**；共同核心版本：**1.8.1**。本版与另外两个平台共享记账和 SQL 工作台功能，提供本平台的启动入口。

这是可安装运行的源码版本，首次使用需要环境和依赖，并非免安装的 EXE、DMG 或 AppImage。只需解压本平台的 `montra-1.8.1-macos.zip`；请完整保留解压出来的文件夹。

## 1.8.1 升级与访问设置

已有账本也须先停止旧版服务，在原连接配置下运行 `npm run db:secure`（Windows 可用 `npm.cmd run db:secure`）。它先备份全部账单，再创建记账专用账号及独立 SQL 编辑账号，不改动原有记录。全新数据库先执行 `npm run db:init`。

新安装默认不需要访问密码；在“访问设置”选择需要或不需要。需要时密码最低 4 个字符，例如 abcd、5656、ab56。已有账本保留原密码设置；旧初始密码文件改名为 `.montra/initial-access-password.json`，值不变。关闭已有密码需验证当前密码。访问密码与数据库管理密码不同。

`.montra` 保存受本机权限保护的凭据、密码散列和备份，不能随安装包分享。日常网页拒绝管理员账号；SQL 工作台默认允许查询、INSERT 新增和 UPDATE 修改账单，表单也继续可用。远程 SQL Server 必须配置可验证的证书。使用 `npm run db:backup` 导出账单备份；升级到同一电脑的新目录时安全复制自己的 .env 和 .montra，跨电脑请重新加固。更多内容见 [安全说明](../SECURITY.md)。

## 一、准备运行环境

- macOS，安装与本机 Intel / Apple 芯片匹配的 [Node.js](https://nodejs.org/en/download)；最低 22，推荐 24 LTS。下载 `.pkg` 后按安装器完成安装，再重新打开“终端”。
- 浏览器：Safari、Chrome 或 Firefox。
- 本机容器方案需要 [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/)，下载对应芯片的 `.dmg`，拖到 Applications，打开并等到引擎启动。也可直接连接已有 SQL Server，此时不需要本机 Docker。
- 本机 SQL Server 容器使用 `linux/amd64`。Apple Silicon 需要 x86-64 模拟；微软不正式支持模拟运行 SQL Server，稳定使用建议连接 x64 Windows/Linux 上的 SQL Server。前端与 Node 服务仍在 Mac 运行。详见 [微软支持范围](https://learn.microsoft.com/en-us/sql/linux/containers/deploy?view=sql-server-ver16)。若沿用已运行的模拟容器，可以按已有账本方式尝试。
- 本机容器请预留约 4 GB 可用内存和足够磁盘空间；这是本项目的建议，不替代 Docker/SQL Server 的系统要求。

安装后检查（使用原生/远程数据库时可以跳过 Docker 检查）：

```sh
node --version
npm --version
docker --version
docker compose version
docker info
```

## 二、解压与配置

把整个文件夹解压到自己的可写目录，勿放在系统安装目录。打开终端进入解压后的文件夹；以下路径需换成你的实际路径：

```sh
cd "/你的解压路径/montra-1.8.1-macos"
cp -n .env.example .env
open -e .env
```

已有 `.env` 不要覆盖。默认配置：`SQL_SERVER=127.0.0.1`、`SQL_PORT=1433`、`SQL_USER=sa`、`SQL_DATABASE=jizhang`、`SQL_CONTAINER=sqlserver`、`PORT=3210`。

已有本机 SA 容器可以暂不填 `SQL_PASSWORD`，加固命令会尝试从容器配置读取原密码；原生、远程 SQL Server 或非 SA 账号必须填写自己的实际密码。容器里的初始密码若已被 SQL 修改，以当前实际密码为准。

## 三、选择安装方式

### A. 已有账本（保留原记录）

打开 Docker Desktop，确认原来的 `sqlserver` 容器存在，双击 `launch.command` 或 `start.command`。入口会安装缺失依赖，并尝试启动配置中的已有容器，不会自动创建数据库。

若文件丢失执行权限，在项目目录运行 `chmod +x *.command`。也可以完全通过终端启动：`sh start.command`。如果系统阻止来自下载文件的脚本，检查来源后按 macOS 的提示允许打开，或在终端运行脚本，不需要关闭系统安全功能。

连接其他电脑的数据库时，`SQL_SERVER` 填服务器地址、`SQL_PORT` 填其对你开放的端口、`SQL_USER/SQL_PASSWORD` 填 SQL 账号。不要对已有容器执行下面的新容器流程。切换电脑后看不到旧记录，先核对是否连接到同一个数据库。

### B. 全新账本（本机 Docker，新建空数据库）

先运行 `docker ps -a` 检查是否已有 `sqlserver`。若已有，返回方式 A。为全新的独立实例，在 `.env` 设置自己的强密码，建议至少 12 位并包含大小写字母、数字和符号。然后执行：

```sh
npm ci --omit=dev
docker compose up -d sqlserver
docker compose logs --tail 30 sqlserver
```

首次会下载 SQL Server 镜像，可能需要几分钟。日志出现 `SQL Server is now ready for client connections` 后再执行：

```sh
npm run db:init
npm run db:secure
```

初始化只创建缺失的数据库和 `dbo.jilu` 表，不删除已有记录；新账本从空数据开始。若容器名或 1433 端口已被其他服务使用，请先选方式 A，或为新实例在 `.env` 中同时设置另一个 `SQL_CONTAINER` 和 `SQL_PORT`，不要删除旧实例。

本机已安装 SQL Server 时不运行 `docker compose`，直接配置正确的连接，在账号有建库权限且确实要建新账本时运行 `npm run db:init`；已有表无需初始化。

## 四、启动

双击 `launch.command` 或 `start.command`。终端方式：

```sh
sh start.command
```


入口只启动已有容器，不会自动接受新容器许可、创建库表或改动账单。请先完成上面的环境、配置和首次初始化。Docker Desktop / Docker Engine 请自行启动。

也可手动运行 `npm start` 后访问地址；此命令只开 HTTP 服务，不负责启动数据库或自动打开浏览器。

## 日常使用

启动后浏览器进入 `http://127.0.0.1:3210`；若修改了 `.env` 的 `PORT`，使用新端口。启动窗口和页面底部均显示版本，`/api/health` 可查看版本信息。

1. 页面显示“账本已连接”后，选择收入或支出，输入正数金额（最多两位小数）、日期、类别和备注，点“保存账单”。
2. 通过月份、类别、收支类型或搜索框查找记录。“所有月份”可以查看跨月记录；账单每页 10 笔。
3. 页面右上角可以切换中文/English。保存后刷新统计；每 10 秒自动同步数据库变化。
4. 下方 SQL 工作台可以执行 `SELECT` 查询、`INSERT` 新增和 `UPDATE` 修改，按 ⌘/Ctrl+Enter 执行。示例只填入编辑器，不自动执行。
5. 在账单明细中点击对应记录的“编辑”，修改日期、收入/支出、金额、类别或备注，点击“保存修改”（或 ⌘/Ctrl+Enter）即可更新原记录，列表和统计自动刷新。点击“取消”或按 Esc 放弃修改，不影响左侧新增表单。若记录在编辑期间被其他窗口或 SQL 修改/删除，会提示刷新后重新编辑，避免覆盖新内容。
6. 月结余和累计盈亏是已录入的收入减支出，统计截至今天；未来日期的记录不计入截至今天的汇总。金额不自动换汇，也不包含记账前的银行余额。

使用期间保持启动窗口打开。停止网页服务按 Ctrl+C，不删除账单。数据库若暂时不再使用，可在 Docker 中停止对应容器；不要用 `docker compose down -v`，不要删除数据卷。

## 数据、更新与跨电脑迁移

软件文件与数据库分开：`compose.yaml` 创建的账单保存在 Docker 命名卷挂载的 `/var/opt/mssql`，不在项目文件夹内。已有容器可能使用其他卷或容器内部存储，以 `docker inspect` 的 Mounts 为准。直接移动文件夹不会迁移账单。

升级：先停止 Montra，备份 `.env` 和 SQL Server 数据库；把新版本解压到新目录，复制自己的 `.env`，连接原数据库，再安装依赖并启动。不要覆盖旧的 `node_modules`，不要为升级重建已有容器。旧 `.command` 入口继续可用。

在 Mac、Linux、Windows 之间迁移时，重新安装相应平台依赖，使用 SQL Server 的 BACKUP/RESTORE 搬运数据库。不要复制运行中的 `.mdf/.ldf`，也不要直接复制 Docker 的虚拟磁盘。详细操作见项目中的 `docs/data-and-migration.md`。三个版本不会自动跨电脑同步。

## 常见问题

- **Node.js 找不到或版本太旧**：安装 Node.js 22+，推荐 24 LTS；安装完重新打开终端，确认 `node --version` 和 `npm --version`。
- **首次依赖安装失败**：检查网络和代理，在项目目录手动运行 `npm ci --omit=dev` 后重试。首次安装需要联网；已装好的依赖可重复使用。
- **数据库未连接**：先确认 Docker/SQL Server 已就绪，检查 `.env` 的服务器、端口、账号、密码、数据库名称；Docker 新实例查看 `docker compose logs --tail 30 sqlserver`。新数据库准备好后才运行 `npm run db:init`。已有数据库密码变更后可在页面重试连接。
- **端口占用**：HTTP 端口由 `.env` 的 `PORT` 控制；SQL Server 端口由 `SQL_PORT` 控制。修改配置后重启。已有容器的端口映射不会被软件自动修改。
- **重复启动**：同一端口已运行 Montra 时，入口会打开现有实例；升级后要先关闭旧实例才能使用新版本。
- **没有自动打开浏览器**：手动打开启动窗口输出的地址即可；Linux 无图形桌面时不会有浏览器窗口。
- **密码包含 `$` 或 `#`**：在 `.env` 中用单引号包住密码，保持 Docker Compose 和 Node.js 读取一致；不要把真实密码上传或发给他人。

本软件仅供本机单人使用，HTTP 绑定 `127.0.0.1`。SQL 工作台使用账单专用账号；不要向公网开放界面。

