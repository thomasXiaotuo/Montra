# Montra · Personal Ledger

## 1.5.0 · macOS / Linux / Windows

| Edition | Version | Entry point | Environment, installation and usage |
|---|---|---|---|
| macOS | 1.5.0-macos | start.command / 打开记账.command | [macOS guide (Chinese)](docs/macOS.md) |
| Linux | 1.5.0-linux | sh start.sh | [Linux guide (Chinese)](docs/Linux.md) |
| Windows | 1.5.0-windows | start.cmd / 打开记账.cmd | [Windows guide (Chinese)](docs/Windows.md) |

**Windows and Linux default to native SQL Server without Docker. Follow the platform guide and configure SQL_PASSWORD and SQL_USE_DOCKER=0. Windows also requires no WSL.**

These are source distributions requiring Node.js and SQL Server, with separate launchers and platform guides. The core version is 1.5.0. Connect to an existing SQL Server without Docker, or set up a new local database using Compose. Copying the source does not copy ledger records. See [data and migration](docs/使用与数据.md) and [changes](CHANGELOG.md).

The launcher honors PORT and SQL_CONTAINER from the project-root .env. Start Docker yourself if using containers. Remote SQL Server skips local Docker. Launchers install missing runtime dependencies and try to start an existing container; database creation is an explicit separate step. The app footer and /api/health show release information.

*Your money, your way.*
[English](README.en.md) | [简体中文](README.md)

A local personal ledger with a bilingual interface and an integrated SQL workbench. Add entries using a form, write SQL in the app, or use your terminal. All three use the same SQL Server table.

**MIT licensed · Node.js 22+ · SQL Server 2022 · macOS / Linux / Windows launchers**

## Security upgrade in 1.5.0

Stop older instances, install dependencies, then run `npm run db:secure` against your existing ledger. For a new ledger run `npm run db:init` first. The security command exports a protected ledger backup and provisions a dedicated SELECT/INSERT/UPDATE account plus a separate read-only workbench account. Existing rows are unchanged.

The app requires an access password. The initial password is in `.montra/初始访问密码.json`, whose path is shown in the startup window. Use Change access password after signing in; this deletes the initial-password file and revokes other sessions. Lock ledger signs out. `npm run db:backup` exports all rows to a protected local JSON file. Keep `.montra`, `.env`, credentials and backups private. See [security details](SECURITY.md).

## Features

- Quickly record income and expenses with a date, category and optional note.
- Month-to-date income, expenses and net, plus cumulative net across recorded months.
- Filter by month, category and entry type; search notes; view category totals.
- Immediate refresh after saving; automatic database sync every 10 seconds.
- Edit an existing transaction with its Edit button. Change the date, type, amount, category or note, then save with the button or ⌘/Ctrl+Enter. Cancel or Esc discards changes. Totals refresh after saving; stale edits are rejected if another window or SQL changed the record.
- SQL editor with keyboard execution, GO batches, multiple result tables and error lines.
- Switch between English and Simplified Chinese without losing form or SQL drafts.
- Automatically select a supported browser language on first visit; otherwise use English. A manual choice is stored locally in your browser.

Language selection changes interface text and date formatting. Categories, notes, SQL drafts, result values, PRINT output and original SQL Server error messages are preserved. Native date/month pickers follow your browser and operating system settings.

Amounts use the ledger’s existing currency. There is no currency conversion or mixed-currency accounting. Net means recorded income minus expenses, excluding an opening balance.

## Requirements

Install [Node.js](https://nodejs.org/) 22 or newer and [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/), or connect to an existing SQL Server.

SQL Server containers use x86-64. On Apple silicon, prefer a separate x64 SQL Server host. Emulated SQL Server environments are not officially supported by Microsoft; see the [SQL Server container documentation](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-docker-container-deployment?view=sql-server-ver16).

## Connect an existing ledger

The defaults are a local SQL Server on `127.0.0.1:1433`, database `jizhang`, table `dbo.jilu`, and Docker container `sqlserver`.

On a Mac, double-click `start.command` in the project folder. It installs runtime dependencies on first launch, starts the existing Docker container, and opens the app in your browser. Keep the Terminal window open while using the app. If the executable permission was lost during extraction, run `chmod +x start.command`.

macOS defaults to Docker. Windows/Linux use the native SQL Server guides above; the following commands apply only if Docker mode is explicitly enabled:

```sh
npm ci --omit=dev
docker start sqlserver
npm start
```

Open http://127.0.0.1:3210. Use the language selector in the top right.

Existing records are not imported or replaced. Only explicit initialization/security commands may read a local container administrator password. Daily app requests use dedicated low-privilege credentials. Windows/Linux default to native SQL Server and never invoke Docker by default. Passwords are not sent to the browser. If the SQL password has changed, enter the current password in the reconnect form. It is held only in the running server’s memory.

## Start with a new database

If a container named `sqlserver` already exists, follow the existing-ledger instructions instead.

1. Copy `.env.example` to `.env` and set your own strong `SQL_PASSWORD`. Do not commit `.env`.
2. Run these commands in the project folder:

```sh
npm ci --omit=dev
docker compose up -d
docker compose logs --tail 30
```

3. Wait until the logs show `SQL Server is now ready for client connections`, then run:

```sh
npm run db:init
npm run db:secure
npm start
```

4. Open http://127.0.0.1:3210.

The initialization script creates only a missing database and table. It does not overwrite existing entries. New databases are empty; the source distribution contains no personal records. Docker stores data in a named volume. Do not use `docker compose down -v` to simply stop the app: it removes the database volume.

## Database schema

| Column | SQL type | Purpose |
|---|---|---|
| id | INT IDENTITY(1,1) PRIMARY KEY | Automatic entry ID |
| riqi | DATE NOT NULL | Entry date |
| type | VARCHAR(1) NOT NULL | `i` income / `e` expense |
| amount | DECIMAL(10,2) NOT NULL | Positive amount |
| category | NVARCHAR(50) NOT NULL | Category |
| note | NVARCHAR(200) | Optional note |

Configure `SQL_SERVER`, `SQL_PORT`, `SQL_USER`, `SQL_DATABASE`, `SQL_PASSWORD`, `SQL_CONTAINER` and `PORT` in `.env`. See `.env.example`. All platform launchers honor PORT from .env; the default is 3210. Start Docker Desktop/Engine yourself before using a local container.

## SQL workbench

The workbench uses a separate database-enforced read-only account. Use the entry forms to add or edit transactions. SQL writes, schema changes and database administration are not available through the workbench. Templates only fill the editor; they never execute automatically. Press ⌘ / Ctrl + Enter to run.

```sql
SELECT TOP (50) * FROM dbo.jilu
ORDER BY riqi DESC, id DESC;
GO
```

Each run gets a separate database session. GO batches within the same run share that session, but temporary tables and transaction state do not survive across separate runs. Complete BEGIN and COMMIT / ROLLBACK in a single run. Unfinished transactions are rolled back; statements committed before an error are not automatically undone.

Limits: 12 KB of SQL, 20 GO batches, approximately 30 seconds, and up to 1,000 displayed rows and 20 result sets. Permissions prohibit writes to the ledger through the workbench. GO repeat counts, sqlcmd file commands and shell commands are not supported.

## Development and tests

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Browser tests use isolated in-memory entries, not a personal ledger. You can set `CHROME_PATH` to use an existing Chrome executable.

Optional local SQL Server checks:

- `node test/readonly-check.mjs`: read-only validation of the ledger totals.
- `node test/sql-live-check.mjs`: queries and connection-local temporary tables; does not write to the personal ledger.
- `node test/init-check.mjs`: creates and removes a uniquely named empty test database to check initialization.

Translations live in `public/i18n.js`. Both dictionaries must have matching keys and template placeholders. Ledger values and raw SQL messages must never be translated. Tests check dictionary coverage, browser fallback, persistence and preservation of drafts.

## Share the source

With Python 3.9+ installed (packaging only), run `npm run package` to build `dist/montra-1.5.0-{source,macos,linux,windows}.zip`. Each platform ZIP includes its own entry point, VERSION, release.json and 使用说明.md. Packaging uses an explicit file allowlist and excludes `.env`, database exports, personal records, screenshots, node_modules and Git history.

The ZIP extracts to a complete project folder. First-time users still need the dependencies and their own database. This is a local application, not a hosted multi-user service.

See [LICENSE](LICENSE), [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
