# Cloudflare account login update

This update adds Cloudflare Access login, per-account ownership and optional passwords on individual ledgers. Cloudflare handles the account password; Montra receives only a signed identity assertion. Local SQL Server mode keeps its existing authentication.

## Install the source update

Run `Apply-Update.ps1` from the supplied update folder in your normal PowerShell session. The default target is `C:\zhuomian\meC\Montra`. The installer checks the original file hashes, backs up changed source files, then copies only this update's files. It leaves `.montra`, `.env`, personal records and deployment credentials in place. This does not publish anything.

## Configure Cloudflare before publishing

1. In Cloudflare, protect the complete application hostname with Access (including `/api/*`). For `workers.dev`, enable Cloudflare Access in the Worker's domain settings. Protect custom domains too. Do not add bypass policies for data endpoints.
2. Select **Cloudflare** as the identity provider. Set the policy to admit the intended users. Cloudflare's default “Restrict to account members” prevents unrelated Cloudflare users from entering unless deliberately configured otherwise. Do not grant infrastructure/admin permissions merely to let someone use Montra.
3. Obtain the Access team issuer (`https://YOUR-TEAM.cloudflareaccess.com`) and the application's AUD tag from Access application settings.
4. Obtain your own **verified Access JWT `sub`** from your authenticated session or Access identity details. This is the Access user ID, not the Cloudflare infrastructure account ID. Existing books are assigned only to this identity. Do not use “first user to log in” as the owner.
5. In the existing local `.env`, add:

```dotenv
MONTRA_ACCESS_ISSUER=https://YOUR-TEAM.cloudflareaccess.com
MONTRA_ACCESS_AUD=YOUR-APPLICATION-AUD
MONTRA_LEGACY_SUB=YOUR-ACCESS-USER-SUB
```

6. In the project folder run `npm ci`, then `npm run cloud:upgrade-accounts`. This uses the existing authorized Wrangler deployment, exports both databases first, applies migrations and deploys. It never imports the local SQL Server ledger over the cloud ledger. Keep the generated `.montra/before-account-login-*.sql` backups private.

Cloudflare identity setup and live publication cannot be completed by changing source alone. Missing Access configuration fails closed. The old shared-password API is not accepted by the updated Worker. The old cloud publishing wizard is disabled after migration; use the upgrade command for subsequent account-login releases.

## Expected behavior

- A fresh browser shows a login screen and loads no personal data. Access may display its own official login first.
- New users see no existing books and can create their own. Each account can choose the same ledger name.
- Existing ledgers belong only to the configured legacy owner. The previous shared ledger password becomes a password on those existing ledgers, preserving protection.
- A ledger password is separate from Cloudflare login. It can be set, changed or removed. Changing it invalidates other sessions' unlocks.
- Locked ledgers reject reads, writes, SQL and exports. An all-ledger backup requires every owned protected ledger to be unlocked.
- Locking a ledger clears its displayed values and drafts. Logging out clears all displayed account/ledger state, revokes the app session and visits `/cdn-cgi/access/logout`.
- Cloudflare Access logout and the Cloudflare identity-provider session are distinct. If Cloudflare automatically chooses the same account again, switch/sign out of that account on Cloudflare's official login page, or use a separate browser profile. Montra cannot force Cloudflare to display an account chooser or sign out the user's global Cloudflare dashboard session.

## Validation

`node --test test/account-isolation.test.mjs` tests cryptographically signed Access tokens and real SQLite queries through a D1-compatible local adapter. `node test/account-browser-check.mjs` tests the actual Worker and UI with separate anonymous, Alice and Bob browser contexts. Tests use synthetic identities and in-memory records; they do not use the production account or D1 databases.

The former shared-password cloud/browser cases are replaced with account-login coverage and SQLite data tests. The Wrangler-based legacy migration test still checks the previous data upgrade and is skipped when Wrangler is unavailable. SQL execution cases are skipped when the SQL parser is unavailable; unauthorized SQL endpoint rejection is always tested. Real Access redirect behavior, the Cloudflare account chooser and remote D1 migrations still need a live staging verification.

References: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/ and https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
