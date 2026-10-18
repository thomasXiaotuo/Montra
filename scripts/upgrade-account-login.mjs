import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {root,loadEnvironment} from '../runtime.mjs';
import {readPrivate,writePrivate,privateDirectory} from '../private-store.mjs';
const exec=promisify(execFile);
loadEnvironment();
const issuer=String(process.env.MONTRA_ACCESS_ISSUER||'').replace(/\/$/,''),aud=process.env.MONTRA_ACCESS_AUD,subject=process.env.MONTRA_LEGACY_SUB;
if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!aud||!subject)throw Error('Set MONTRA_ACCESS_ISSUER, MONTRA_ACCESS_AUD and MONTRA_LEGACY_SUB in .env. See docs/account-login.md.');
const state=readPrivate('cloud-deployment.json');if(!state?.ledger||!state?.access)throw Error('Existing cloud deployment not found. This upgrade preserves an existing deployment.');
const path=join(privateDirectory,'wrangler.cloud.json'),config=JSON.parse(await readFile(path,'utf8'));
config.main=join(root,'cloud','worker.mjs');config.assets.directory=join(root,'public');
const base=['--config',path];
async function run(args){const {stdout}=await exec(process.execPath,[join(root,'node_modules','wrangler','bin','wrangler.js'),...args,...base],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(privateDirectory,'wrangler-logs')},timeout:120000});return stdout;}
const query=async(binding,sql)=>JSON.parse(await run(['d1','execute',binding,'--remote','--yes','--command',sql,'--json']))[0].results;
if(!state.accountLoginBackup){
 console.log('Backing up both cloud databases before migration.');
 for(const binding of ['LEDGER_DB','AUTH_DB'])await run(['d1','export',binding,'--remote','--output',join(privateDirectory,`before-account-login-${binding}.sql`)]);
 state.legacyMaxBookId=Number((await query('LEDGER_DB','SELECT max(id) AS maximum FROM books'))[0].maximum||1);
 state.accountLoginBackup=true;writePrivate('cloud-deployment.json',state);
}
const owner=issuer+'|'+subject;
const previousOwner=config.vars?.LEGACY_OWNER_ID;
if(previousOwner&&previousOwner!==owner)throw Error('Legacy owner identity differs from the existing configuration. Refusing to reassign ledgers.');
await run(['d1','execute','AUTH_DB','--remote','--yes','--file',join(root,'cloud','account-schema.sql')]);
// Detect completion remotely so retrying after an interrupted deployment is safe.
const schema=(await query('LEDGER_DB',"SELECT sql FROM sqlite_master WHERE type='table' AND name='books'"))[0]?.sql||'';
if(/COLLATE\s+NOCASE\s+UNIQUE/i.test(schema))await run(['d1','execute','LEDGER_DB','--remote','--yes','--file',join(root,'cloud','account-ledger-migration.sql')]);
config.vars={...config.vars,ACCESS_ISSUER:issuer,ACCESS_AUD:aud,LEGACY_OWNER_ID:owner,LEGACY_MAX_BOOK_ID:String(state.legacyMaxBookId)};
await writeFile(path,JSON.stringify(config,null,2)+'\n',{mode:0o600});
console.log('Deploying account login. All data routes will require a verified Cloudflare Access identity.');
await run(['deploy','--no-autoconfig','--strict']);
state.accountLoginEnabled=true;state.accountLoginUpdatedAt=new Date().toISOString();writePrivate('cloud-deployment.json',state);
console.log('Account login deployed. Verify with two Cloudflare identities before distributing.');
