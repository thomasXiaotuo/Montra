# Security and local access

Montra 1.6.0 is a single-user local ledger. HTTP remains bound to 127.0.0.1. Remote web access and cross-device account synchronization are not enabled by this release.

## Password choice

Access settings allows password protection to be enabled or disabled. Enabled access passwords accept 4–256 characters, including abcd, 5656 and ab56. This limit applies to the application access password, not to SQL Server administrator or generated account passwords.

New installations start without a password. Upgrades retain the existing choice and password. To turn off an existing password, sign in and confirm the current password. To turn protection back on, choose a new password. Saving settings invalidates old sessions. When protection is off, local clients can access the ledger without logging in; Host, Origin, custom-header and cross-site request checks remain active.

Access passwords use salted scrypt hashes (N=131072, r=8, p=1). Enabled-password login permits at most 5 failed attempts per 15 minutes. Sessions expire after 8 hours and require both an HttpOnly/SameSite=Strict cookie and a separate origin-scoped browser credential. Password changes and restarts invalidate prior sessions. Lock ledger is available while password protection is enabled.

Earlier initial-password handoff files migrate to `.montra/initial-access-password.json` without changing the password. Saving access settings removes this handoff. New password-free installations do not create an initial-password file.

Forgotten password: stop every Montra process, remove only `.montra/auth.json` and any old initial-password handoff, then restart. This resets local access settings to no password and does not remove ledger rows or database connection settings. This requires access to the current OS account's private files.

## SQL workbench and database permissions

The workbench permits SELECT queries, INSERT and UPDATE on dbo.jilu by default. Its independent database account has only these ledger permissions. The entry forms use another account with the same table-scoped permissions. DELETE, permanent table creation, schema changes and server administration are not granted. SQL write templates only fill the editor and never execute automatically.

Run `npm run db:secure` after installing dependencies and configuring the original database. A new ledger needs `npm run db:init` first. The security command backs up ledger rows before creating or upgrading dedicated accounts. Upgrading the prior read-only workbench account grants INSERT and UPDATE without changing existing data or the sa password. Provisioning does not disable administrators used by external SQL tools.

Daily app connections reject sa, sysadmin, CONTROL SERVER, db_owner and incompatible DDL/security privileges. Queries and form edits use parameters; the free SQL workbench intentionally executes the user's statements under its table-scoped account. A stale form edit is rejected if another form or SQL statement changed that record.

SQL_ADMIN_USER/SQL_ADMIN_PASSWORD configure explicit administration commands. Existing SQL_USER/SQL_PASSWORD are accepted for initial setup. Only explicit local administration commands may retrieve a Docker sa password. Runtime credentials for the same server, port and database come from private `.montra/database.json`. Remote SQL connections require encryption and certificate identity validation; loopback connections permit the local certificate.

## Files, backups and updates

Owned project filenames, launchers, generated user guides and private-state filenames use English/ASCII names. macOS uses launch.command or start.command; Windows uses launch.cmd or start.cmd; Linux uses start.sh. UI text and ledger values can remain Chinese or English.

Private `.montra` directories are 0700 and files are 0600 on macOS/Linux. Windows uses the current user's SID in the directory ACL. Existing .env files are restricted when the server or setup commands load them. Local SQL credentials and ledger JSON backups rely on OS permissions; they are not independently encrypted vaults. They must not be shared or committed. Distribution packages exclude .montra, .env, backups, database files and Git history.

`npm run db:backup` exports all ledger rows to protected `.montra/backups/ledger-<timestamp>.json`, preserving IDs, dates, exact decimal amounts and Unicode fields. This is a ledger data export, not a complete SQL Server instance backup. Use an administrator's SQL Server BACKUP/RESTORE for full database migration and store important backup copies on protected storage separate from the working disk.

For upgrades on the same computer, privately retain .env and .montra with their permissions. For another server or database, use a separate project folder and provision dedicated accounts again. Copying application files alone does not synchronize ledger records, which remain in SQL Server.

## Remaining boundaries

A four-character password gives less resistance to guessing than a long one, and disabling it removes the local login barrier. OS administrators, root and malware controlling the current OS account may read private files, steal browser sessions or modify the application. Application settings cannot isolate a fully compromised account.

Do not directly expose this local server or the SQL port to the public internet. Any future phone/remote-access version needs a defined network access method, HTTPS and an appropriate account/login design. Existing anti-CSRF checks, fixed static-file allowlist, text-only rendering, request limits and dependency maintenance remain in place. Tests and dependency scans are not a guarantee against every vulnerability.

## Optional cloud edition (1.7.0)

The Cloudflare edition requires a ledger password and HTTPS outside loopback development.
The browser derives a PBKDF2-SHA-256 proof (100,000 iterations, random per-password salt); the Worker stores only SHA-256 of that proof. The derived proof is a login secret and is sent only over HTTPS. Password stretching runs in the browser to fit the free Worker CPU limit. It stores persistent login throttling
and eight-hour sessions in AUTH_DB, separate from the ledger-only LEDGER_DB. Session cookies are
HttpOnly, SameSite=Strict and Secure over HTTPS, with an additional origin-scoped proof.
Passwords accept 4–256 characters as requested; owners choose the password in the local setup wizard.
Password changes invalidate sessions on other devices via a persistent version.
The SQL workbench accepts SELECT, INSERT INTO jilu and UPDATE jilu SET, with all statement boundaries
validated before execution. D1 schema checks enforce valid entries; other database bindings and
credentials are unavailable to workbench queries. Each successful write commits independently.
The cloud edition serves only the public UI assets and authenticated APIs. Migration copies
ledger data after a protected local backup and checks every row. Republishing skips the initial import
and password setup. It does not continuously synchronize the original SQL Server database.
Cloudflare account authorization and a deployed smoke test remain necessary before claiming a live service.

## Multiple ledgers (1.8.0)

All ledgers belong to the existing owner sign-in; this is not multi-user registration.
Ledger IDs are validated per request using X-Ledger-Book, never a mutable server-wide current
selection. Missing headers select default ledger 1 for compatibility with older open clients.
Every record read, write and optimistic update is constrained to that ledger. Book metadata,
creation and backups require authentication. Request IDs deduplicate retried creation requests.
SQL scripts are parsed before execution and every SELECT source is replaced with a projection
filtered to the current book. UPDATE receives an additional parenthesized book predicate, and
INSERT VALUES is assigned the current book. Users cannot set book_id, read other tables,
or bypass scope through nested SELECTs, unions, joins or schema-qualified table names.
Generated identifiers use strict SQLite quoting so missing columns fail before later writes.
Legacy migration saves a protected cloud snapshot before ALTER, assigns existing records to
default ledger 1, and verifies all original field values. The auth database and passwords stay intact.
