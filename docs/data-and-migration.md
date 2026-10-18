# Montra 1.8.0：配置、数据与迁移

## 数据在哪里

三个版本使用同一套 SQL Server 数据结构：`jizhang.dbo.jilu`。`id` 为自动编号，`riqi` 为日期，`type` 为 i（收入）或 e（支出），`amount` 为正数 DECIMAL(10,2)，`category` 为 50 字符类别，`note` 为 200 字符可空备注。

本项目 Compose 使用 `ledger-data` 命名卷挂载 `/var/opt/mssql`。实际卷名通常包含 Compose 项目名前缀。旧容器可能使用不同卷、绑定目录或容器内部存储，检查 Mounts：

```sh
docker inspect --format '{{json .Mounts}}' sqlserver
```

替换 sqlserver 为实际容器名称。此命令只查看挂载，不修改数据。不要运行不带筛选的 inspect 并分享输出，完整输出可能包含密码。移动源码不会移动数据库；在另一台电脑新建的卷也是空的。

## 配置

`.env` 始终读取项目根目录中的文件，与从哪里调用启动脚本无关。环境变量优先于 `.env`。更改后重启 Node 服务；改变 SQL_PORT 不会修改已存在容器的映射。默认 SQL 账号使用 SQL 身份验证，不支持 Windows 集成认证。

| 配置 | 默认值 | 用途 |
|---|---|---|
| SQL_SERVER | 127.0.0.1 | SQL Server 地址；远程 SQL Server 无需本机 Docker |
| SQL_PORT | 1433 | 数据库 TCP 端口 |
| SQL_USER | 仅初始化时可用 sa | 加固后网页使用 .montra 中的专用低权限账号 |
| SQL_PASSWORD | 空 | 初始化/加固用管理密码；仅本机管理操作可读取容器 SA 密码 |
| SQL_DATABASE | jizhang | 数据库名 |
| SQL_USE_DOCKER | Windows/Linux: 0；macOS: 1 | 0 禁用全部 Docker 调用；1 允许已有容器启动与 SA 密码读取 |
| SQL_CONTAINER | sqlserver | 用于查找/启动已有本机容器 |
| PORT | 3210 | 仅本机开放的网页端口，1–65535 |

Windows 和 Linux 默认不使用 Docker；即使没有填写 SQL_PASSWORD 也不会尝试 Docker。macOS 连接原生 SQL Server 时可设置 SQL_USE_DOCKER=0。

用 Docker 密码回退仅适合本机 sa 账号；非 sa 账号或远程服务器须设置实际 SQL_PASSWORD。连接原生/远程服务使用同样的 dbo.jilu 结构。

## 备份与跨系统迁移

源程序与目标程序用同样的核心版本；在每台机器分别安装 Node.js 和依赖，不复制 node_modules。分发 ZIP 不包含 .env、账单、备份或 Docker 数据。

以下是 Docker SQL Server 的备份示例。先停下记账录入和其他写入，在源电脑的项目目录运行。把容器名和数据库名替换为实际值；不要把历史备份覆盖掉。此示例使用一个新的备份文件名。

```sh
docker exec -u 0 sqlserver mkdir -p /var/opt/mssql/backup
docker exec -u 0 sqlserver chown mssql /var/opt/mssql/backup
docker exec -it sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C
```

在 SQL 提示符输入（密码按提示填写，不写进命令行）：

```sql
BACKUP DATABASE [jizhang]
TO DISK = N'/var/opt/mssql/backup/jizhang-transfer-20261016.bak'
WITH COPY_ONLY, CHECKSUM;
GO
RESTORE VERIFYONLY FROM DISK = N'/var/opt/mssql/backup/jizhang-transfer-20261016.bak' WITH CHECKSUM;
GO
EXIT
```

退出后复制到宿主机：

```sh
docker cp sqlserver:/var/opt/mssql/backup/jizhang-transfer-20261016.bak ./jizhang-transfer-20261016.bak
```

将备份安全传到目标电脑。先启动目标 SQL Server（相同或更新的兼容版本），准备 backup 目录并复制备份：

```sh
docker exec -u 0 sqlserver mkdir -p /var/opt/mssql/backup
docker exec -u 0 sqlserver chown mssql /var/opt/mssql/backup
docker cp ./jizhang-transfer-20261016.bak sqlserver:/var/opt/mssql/backup/jizhang-transfer-20261016.bak
docker exec -it sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C
```

在独立管理员 SQL 提示符先检查文件逻辑名称：

```sql
RESTORE FILELISTONLY FROM DISK = N'/var/opt/mssql/backup/jizhang-transfer-20261016.bak';
GO
```

确认目标库名 `jizhang_import` 尚未存在。将下方 `SOURCE_DATA_LOGICAL_NAME` / `SOURCE_LOG_LOGICAL_NAME` 替换为上一步返回的实际 LogicalName（若有多个数据文件，要为每个文件指定 MOVE），恢复到独立新库，避免覆盖已有账本：

```sql
RESTORE DATABASE [jizhang_import]
FROM DISK = N'/var/opt/mssql/backup/jizhang-transfer-20261016.bak'
WITH MOVE N'SOURCE_DATA_LOGICAL_NAME' TO N'/var/opt/mssql/data/jizhang_import.mdf',
     MOVE N'SOURCE_LOG_LOGICAL_NAME' TO N'/var/opt/mssql/data/jizhang_import_log.ldf', CHECKSUM;
GO
SELECT COUNT(*) AS record_count FROM jizhang_import.dbo.jilu;
GO
EXIT
```

将目标 `.env` 的 `SQL_DATABASE` 改为 `jizhang_import`，填写目标服务器密码。重启 Montra，对照源电脑核对记录数量、最近记录与收支汇总，保留源库和备份直到确认。不要使用 `WITH REPLACE` 覆盖不明目标库。

原生 Windows/Linux SQL Server 的备份文件路径、文件权限与服务器服务账号有关，使用 SQL Server 支持的 BACKUP/RESTORE 或管理工具，参照 [微软备份文档](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/create-a-full-database-backup-sql-server) 和 [恢复文档](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/restore-a-database-to-a-new-location-sql-server)。不要移动运行中的数据库文件或 Docker 虚拟磁盘。

## SQL 工作台

1.8.0 起工作台使用独立账单编辑账号，默认允许 SELECT、INSERT 和 UPDATE；外部管理员终端权限由其账号决定。工作台仍支持 SELECT、GO 分批、多个结果集及连接内临时表，数据库权限仅授予 dbo.jilu 的查询、新增和修改，不授予永久建表或数据库管理权限。

访问密码、本机安全配置、升级、备份和忘记密码处理见 [安全说明](../SECURITY.md)。切换到不同服务器、端口或数据库时使用独立项目目录并重新运行 db:secure，避免把原 .montra/database.json 错用于另一个账本。
