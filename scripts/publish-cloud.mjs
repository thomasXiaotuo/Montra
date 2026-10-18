import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {root,loadEnvironment} from '../runtime.mjs';
import {privateDirectory,protectDirectory,readPrivate,writePrivate} from '../private-store.mjs';
import {passwordHash,randomHex,validatePassword,digest} from '../cloud/auth.mjs';
import {ledgerImportSql,normalizeRows,sqlString} from '../cloud/migration.mjs';
import {writeCloudShortcut} from './cloud-shortcut.mjs';
const exec=promisify(execFile);
const wrangler=join(root,'node_modules','wrangler','bin','wrangler.js');
const configFile=directory=>join(directory,'wrangler.cloud.json');
async function cli(args){
  const logs=join(privateDirectory,'wrangler-logs');protectDirectory(logs);
  try{
    const {stdout}=await exec(process.execPath,[wrangler,...args],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:logs,CI:'true'},maxBuffer:8*1024*1024,timeout:10*60*1000,windowsHide:true});
    if(args[0]==='auth'&&args[1]==='token'){
      const credential=JSON.parse(stdout);
      if(credential.token)for(const name of await readdir(logs)){
        if(!name.endsWith('.log'))continue;const file=join(logs,name),content=await readFile(file,'utf8');
        if(content.includes(credential.token))await writeFile(file,content.replaceAll(credential.token,'[redacted]'),{mode:0o600});
      }
    }
    return stdout;
  }
  catch(error){throw new Error('Cloudflare operation failed.',{cause:error});}
}
async function personalRows(){
  loadEnvironment();const {connectionConfig}=await import('../database.mjs');const {default:sql}=await import('mssql');
  const {assertLimited}=await import('../database-security.mjs');const pool=new sql.ConnectionPool(await connectionConfig());
  try{await pool.connect();await assertLimited(pool);return (await pool.request().query('SELECT id,CONVERT(char(10),riqi,23) AS riqi,type,CONVERT(varchar(30),amount) AS amount,category,note FROM dbo.jilu ORDER BY id')).recordset;}
  finally{await pool.close();}
}
export async function ensureCloudSubdomain({run,accountId,suffix,request=fetch}){
  // Read the existing authorized token only into memory, never into output or files.
  const credential=JSON.parse(await run(['auth','token','--json']));
  if(!credential.token)throw new Error('请使用 Cloudflare 浏览器授权连接账号。');
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
  const headers={Authorization:`Bearer ${credential.token}`,'Content-Type':'application/json'};
  const current=await request(endpoint,{headers}).then(r=>r.json());
  if(current.success&&current.result?.subdomain)return current.result.subdomain;
  if(!current.errors?.some(error=>error.code===10007))throw new Error('暂时无法读取 Cloudflare 免费网址设置，请稍后重试。');
  const created=await request(endpoint,{method:'PUT',headers,body:JSON.stringify({subdomain:`montra-${suffix}`})}).then(r=>r.json());
  if(!created.success||!created.result?.subdomain)throw new Error('暂时无法创建 Cloudflare 免费网址，请稍后重试。');
  return created.result.subdomain;
}
export async function verifyCloudUrl(url){
  for(let attempt=0;attempt<12;attempt++){
    try{const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(3000)});if(response.ok&&(await response.json()).edition==='cloud')return;}
    catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('网址已发布，首次启用仍在生效。请稍后点击“重试”，不需要重新注册或迁移账单。');
}
export async function publishCloud({password,onProgress=()=>{},run=cli,readRows=personalRows,directory=privateDirectory,ensureSubdomain=ensureCloudSubdomain,verify=verifyCloudUrl}={}){
  if(readPrivate('cloud-deployment.json',directory)?.accountLoginEnabled)throw new Error('This deployment uses Cloudflare account login. Use npm run cloud:upgrade-accounts instead of the shared-password publishing wizard.');
  protectDirectory(directory);
  let state=readPrivate('cloud-deployment.json',directory)||{suffix:randomBytes(4).toString('hex')};
  const save=()=>writePrivate('cloud-deployment.json',state,directory);
  save();
  onProgress('正在连接 Cloudflare。请在打开的 Cloudflare 页面完成登录，并允许连接。');
  let who;
  try{who=JSON.parse(await run(['whoami','--json']));}
  catch{await run(['login']);who=JSON.parse(await run(['whoami','--json']));}
  if(!who.accounts?.length)throw new Error('Cloudflare 账号尚未就绪，请先完成免费账号注册，再重试。');
  if(!state.accountId&&who.accounts.length!==1)throw new Error('此账号有多个 Cloudflare 账户，需要先选择用于账本的账户。');
  state.accountId??=who.accounts[0].id;
  if(!who.accounts.some(account=>account.id===state.accountId))throw new Error('请登录最初发布此账本的 Cloudflare 账号。');
  state.workerName??=`montra-${state.suffix}`;
  const config=JSON.parse(await readFile(join(root,'cloud','wrangler.jsonc'),'utf8'));
  delete config.$schema;config.name=state.workerName;config.account_id=state.accountId;
  config.main=join(root,'cloud','worker.mjs');config.assets.directory=join(root,'public');
  config.d1_databases=[];
  const saveConfig=()=>writePrivate('wrangler.cloud.json',config,directory);
  saveConfig();
  const command=(...args)=>run([...args,'--config',configFile(directory)]);
  const list=async()=>JSON.parse(await command('d1','list','--json'));
  onProgress('正在准备免费云端空间。只使用 Workers 和 D1，不开通付费套餐。');
  for(const [key,binding,label]of [['ledger','LEDGER_DB','ledger'],['access','AUTH_DB','access']]){
    const name=`montra-${label}-${state.suffix}`;
    if(!state[key]){
      let database=(await list()).find(v=>v.name===name);
      if(!database){await command('d1','create',name,'--location','wnam','--update-config=false');database=(await list()).find(v=>v.name===name);}
      if(!database?.uuid)throw new Error('云端空间尚未创建成功，请稍后重试。');
      state[key]={name,id:database.uuid};save();
    }
    config.d1_databases.push({binding,database_name:state[key].name,database_id:state[key].id});saveConfig();
  }
  const execute=(binding,...args)=>command('d1','execute',binding,'--remote','--yes',...args);
  const query=async(binding,sql)=>JSON.parse(await execute(binding,'--command',sql,'--json'))[0].results;
  await execute('LEDGER_DB','--file',join(root,'cloud','ledger-schema.sql'));
  const ledgerColumns=await query('LEDGER_DB','PRAGMA table_info(jilu)');
  if(!ledgerColumns.some(column=>column.name==='book_id')){
    onProgress('正在备份已有云端记录，并将它们保留在默认账本中。');
    const rows=normalizeRows(await query('LEDGER_DB','SELECT id,riqi,type,amount,category,note FROM jilu ORDER BY id'));
    writePrivate(`cloud-before-books-${Date.now()}.json`,{format:'montra-ledger-v1',createdAt:new Date().toISOString(),rows},directory);
    await execute('LEDGER_DB','--command','ALTER TABLE jilu ADD COLUMN book_id INTEGER NOT NULL DEFAULT 1 CHECK(book_id BETWEEN 1 AND 2147483647)');
    const verified=normalizeRows(await query('LEDGER_DB','SELECT id,riqi,type,amount,category,note FROM jilu WHERE book_id=1 ORDER BY id'));
    if(JSON.stringify(verified)!==JSON.stringify(rows))throw new Error('默认账本迁移核对未通过，尚未发布。请保留备份。');
  }
  await execute('LEDGER_DB','--file',join(root,'cloud','book-indexes.sql'));
  await execute('AUTH_DB','--file',join(root,'cloud','auth-schema.sql'));
  const authColumns=await query('AUTH_DB','PRAGMA table_info(access_settings)');
  if(!authColumns.some(column=>column.name==='proof_version'))await execute('AUTH_DB','--command','ALTER TABLE access_settings ADD COLUMN proof_version INTEGER NOT NULL DEFAULT 1');
  for(const legacy of await query('AUTH_DB','SELECT password_hash FROM access_settings WHERE proof_version=1')){
    await execute('AUTH_DB','--command',`UPDATE access_settings SET password_hash=${sqlString(await digest(legacy.password_hash))},proof_version=2,version=version+1 WHERE id=1 AND proof_version=1 AND password_hash=${sqlString(legacy.password_hash)}`);
  }
  if(!state.authInitialized){
    onProgress('正在设置账本访问密码。');
    const record=(await query('AUTH_DB','SELECT id FROM access_settings WHERE id=1'))[0];
    if(!record){
      const handoff=readPrivate('cloud-access-password.json',directory)||{password:validatePassword(password)};
      writePrivate('cloud-access-password.json',handoff,directory);
      const salt=randomHex(16),hash=await passwordHash(handoff.password,salt);
      const file=join(directory,'cloud-auth-bootstrap.sql');
      // Only a salted hash is sent to Cloudflare. The password stays on this Mac.
      await writeFile(file,`INSERT INTO access_settings(id,salt,password_hash,proof_version) VALUES(1,${sqlString(salt)},${sqlString(hash)},2);\n`,{mode:0o600});
      await execute('AUTH_DB','--file',file);
    }
    state.authInitialized=true;save();
  }
  if(!state.imported){
    onProgress('正在备份并迁移现有账单。本机原记录会保留。');
    const migrationDir=join(directory,'cloud-migration');protectDirectory(migrationDir);
    let snapshot=readPrivate('ledger.json',migrationDir);
    if(!snapshot){snapshot={format:'montra-ledger-v1',createdAt:new Date().toISOString(),rows:normalizeRows(await readRows())};writePrivate('ledger.json',snapshot,migrationDir);}
    const rows=normalizeRows(snapshot.rows);
    const existing=normalizeRows(await query('LEDGER_DB','SELECT id,riqi,type,amount,category,note FROM jilu ORDER BY id'));
    if(existing.length){if(JSON.stringify(existing)!==JSON.stringify(rows))throw new Error('云端已有不同的记录。为保护账单，已停止导入。');}
    else if(rows.length){
      const file=join(migrationDir,'ledger-import.sql');await writeFile(file,ledgerImportSql(rows),{mode:0o600});
      await execute('LEDGER_DB','--file',file);
      const verified=normalizeRows(await query('LEDGER_DB','SELECT id,riqi,type,amount,category,note FROM jilu ORDER BY id'));
      if(JSON.stringify(verified)!==JSON.stringify(rows))throw new Error('迁移核对未通过，尚未发布。请保留本机账本。');
    }
    state.imported=true;state.importedRows=rows.length;save();
  }
  onProgress('正在发布。完成后，电脑和手机都可使用同一个网址。');
  state.subdomain=await ensureSubdomain({run,accountId:state.accountId,suffix:state.suffix});save();
  const output=await command('deploy','--no-autoconfig','--strict');
  const url=output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0];
  if(!url)throw new Error('未能取得账本网址，请完成 Cloudflare 的 workers.dev 免费网址设置后重试。');
  state.url=url;state.publishedAt=new Date().toISOString();save();
  onProgress('正在检查账本网址是否可以正常打开。首次启用可能需要稍等片刻。');
  await verify(url);state.verifiedAt=new Date().toISOString();save();
  if(directory===privateDirectory)await writeCloudShortcut(root,url);
  return {url,importedRows:state.importedRows};
}
