# Montra

*Your money, your way.*
[English](README.en.md) | [简体中文](README.md)

一个本地运行的收支记账软件：用界面快速记账，也可以在 SQL 工作台或终端写 SQL。三种方式共享 SQL Server 中同一张 `dbo.jilu` 表。

**MIT 开源许可证 · Node.js 22+ · SQL Server 2022 · Mac 双击启动**

## 功能

页面右上角可切换简体中文和 English。首次使用按浏览器支持的语言选择，其他语言默认英文；手动选择会保存在当前浏览器。切换时保留账单表单、筛选条件和 SQL 草稿，用户的类别、备注、查询结果与原始 SQL Server 报错不会翻译。界面日期按所选语言显示，原生日期/月历选择器按浏览器及系统语言显示。

- 快速记录收入、支出、日期、类别和备注；快捷类别和键盘保存。
- 本月截至今天的收入、支出、结余；所有月份截至今天的累计盈亏。
- 切换月份，按类别、收支类型和备注搜索；账单分页与支出类别分布。
- 保存后立即更新；每 10 秒同步终端对数据库的修改。
- 内置 SQL 工作台：编辑代码、⌘ / Ctrl + Enter 执行、支持 GO 分批、多结果表格、PRINT、影响行数与报错行号。
- SQL 示例只填入编辑器，不自动执行。使用字符串值展示结果，不执行结果中的 HTML。

金额沿用数据库的记账单位，不进行币种转换。累计盈亏是已记录收入减支出，不代表银行卡余额，不包含记账前的存款。

## 需要准备

- [Node.js](https://nodejs.org/) 22 或更新版本。
- [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)，或者已有可连接的 SQL Server。
- 默认连接 `127.0.0.1:1433`，数据库 `jizhang`，容器 `sqlserver`。

Apple M 芯片运行 SQL Server 容器需要模拟 x86-64。Docker Desktop 中选择 Apple Virtualization framework 并开启 Rosetta。该组合可用于尝试本地练习，但微软不正式支持模拟环境；详见 [SQL Server 容器说明](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-docker-container-deployment?view=sql-server-ver16)。

## 使用现有账本

下载源码并解压，双击 `打开记账.command`。首次启动会安装运行依赖，打开 Docker、启动已有 `sqlserver` 容器，并在浏览器打开 http://127.0.0.1:3210。

使用期间保留启动时打开的终端窗口。按 Control+C 关闭界面服务，不会删除数据库。若 Mac 没有为 `.command` 保留可执行权限，可在项目目录运行 `chmod +x 打开记账.command`。

也可以在 Mac、Linux 或 Windows 终端手动启动：

```sh
npm ci --omit=dev
docker start sqlserver
npm start
```

然后打开 http://127.0.0.1:3210。

已有数据不会迁移或重新创建。服务端默认从已有容器读取密码，不把密码发送给浏览器。若曾修改数据库账号密码，可在页面连接提示中输入当前密码；只保留在本次服务进程的内存中。

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

可在 `.env` 设置 `SQL_SERVER`、`SQL_PORT`、`SQL_USER`、`SQL_DATABASE`、`SQL_PASSWORD`、`SQL_CONTAINER` 和界面 `PORT`。详细配置见 `.env.example`。Mac 双击入口默认界面端口为 3210，改变端口后请手动 `npm start` 并访问配置的新端口。

## SQL 工作台

默认连接同一记账数据库。可执行 SELECT、INSERT、UPDATE、DELETE 及账号有权限执行的其他 T-SQL。代码会操作真实数据，请核对代码再点击执行。

例如查询支出：

```sql
SELECT * FROM dbo.jilu
WHERE type = 'e' AND category = 'eat'
ORDER BY riqi DESC, id DESC;
GO
```

例如录入一笔（执行前改成自己的实际账单）：

```sql
INSERT INTO dbo.jilu (riqi, type, amount, category, note)
VALUES ('2026-10-13', 'e', 12.50, 'eat', 'Lunch');
GO
```

每次点击执行是独立数据库会话。同一次执行中的 GO 批次共享会话，临时表可以跨 GO 使用；变量仍遵循 SQL Server 的批次作用域。跨多次点击不能保留变量、临时表或未提交事务。

事务的 BEGIN、COMMIT / ROLLBACK 必须在同一次执行中完成。未提交的事务会回滚；错误前已经提交的语句不会自动撤销。失败后会停止后续 GO 批次，重试前先核对账单，避免重复记账。

输入最多 12 KB、20 个 GO 批次、约 30 秒；结果最多显示 1,000 行和 20 个结果集，较长单元格会截断。结果显示上限不会限制 INSERT / UPDATE / DELETE 的操作行数。支持单独一行的 GO，不支持 GO 重复次数、sqlcmd 文件指令或 shell 命令。

仍可使用原终端连接：

```sh
docker exec -it sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C
```

## 开发和测试

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

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
├── 打开记账.command      Mac 启动入口
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

源码打包需要 Python 3（只使用标准库）。运行 `npm run package` 生成 `dist/montra-1.2.1-source.zip`。打包采用固定文件白名单，不包括 `.env`、个人账单、数据库备份、截图、node_modules 或 Git 历史。解压后是一个完整项目文件夹，首次使用需要安装依赖和配置自己的数据库。

发布到 GitHub 时上传源码文件即可，不要上传数据库、密码或账单。仓库内容由 `.gitignore` 排除本机配置与生成文件。GitHub Actions 自动执行基础测试。

贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)，本机运行的权限边界见 [SECURITY.md](SECURITY.md)，授权条款见 [LICENSE](LICENSE)。

中英文翻译集中在 `public/i18n.js`，新增语言时应保留相同的字典键和模板参数。自动测试检查字典完整性、语言回退、选择持久化和切换时的草稿保留。
