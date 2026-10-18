// Exercises the actual Worker runtime and D1 with disposable, synthetic data.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {getPlatformProxy} from 'wrangler';
import {chromium,webkit} from '@playwright/test';
import {root} from '../runtime.mjs';
import {passwordHash} from '../cloud/auth.mjs';
import {startCloudSetup} from '../scripts/cloud-setup.mjs';
const temp=await mkdtemp(join(tmpdir(),'montra-cloud-browser-'));
const config=JSON.parse(await readFile(join(root,'cloud/wrangler.jsonc'),'utf8'));
config.main=join(root,'cloud/worker.mjs');config.assets.directory=join(root,'public');delete config.$schema;
const configPath=join(temp,'wrangler.json'),persist=join(temp,'state');await writeFile(configPath,JSON.stringify(config));
let proxy,child,browser,setup;
let output='';
try{
  proxy=await getPlatformProxy({configPath,persist:{path:join(persist,'v3')}});
  for(const [binding,file]of [['LEDGER_DB','ledger-schema.sql'],['AUTH_DB','auth-schema.sql']]){
    const text=await readFile(join(root,'cloud',file),'utf8');await proxy.env[binding].batch(text.split(';').filter(s=>s.trim()).map(s=>proxy.env[binding].prepare(s)));
  }
  const salt='12345678901234567890123456789012';
  await proxy.env.AUTH_DB.prepare('INSERT INTO access_settings(id,salt,password_hash) VALUES(1,?,?)').bind(salt,await passwordHash('abcd',salt)).run();
  const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  await proxy.env.LEDGER_DB.batch(Array.from({length:57},(_,i)=>proxy.env.LEDGER_DB.prepare('INSERT INTO jilu(riqi,type,amount,category,note) VALUES(?,?,?,?,?)').bind(today,'e',1.25,'eat',`Demo entry ${i+1}`)));
  await proxy.dispose();proxy=null;
  child=spawn(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',configPath,'--local','--persist-to',persist,'--port','3219','--ip','127.0.0.1'],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString();});
  const origin='http://127.0.0.1:3219';
  let ready=false;for(let attempt=0;attempt<100;attempt++){
    if(child.exitCode!==null)throw new Error(output);
    try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,output);
  const engine=process.env.BROWSER==='webkit'?webkit:chromium;
  browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});
  const computer=await desktop.newPage(),phone=await mobile.newPage(),errors=[];
  for(const page of [computer,phone]){
    page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.waitForFunction(()=>document.getElementById('auth-title').textContent==='登录账本');
    assert.equal(await page.locator('#auth-submit').textContent(),'登录');
    await page.fill('#access-password','abcd');await page.click('#auth-submit');await page.waitForFunction(()=>document.getElementById('record-count').textContent==='57 笔');
    assert.equal(await page.locator('#advanced-tools').getAttribute('open'),null);
    assert.equal(await page.locator('#sql-code').isVisible(),false);
    assert.equal(await page.locator('#connect-form').isVisible(),false);
    assert.equal(await page.locator('#records tr').count(),10);
  }
  await computer.click('#page-next');await computer.waitForFunction(()=>document.getElementById('page-info').textContent.includes('第 2'));
  await computer.click('#page-prev');await computer.waitForFunction(()=>document.getElementById('page-info').textContent.includes('第 1'));
  await phone.fill('#amount','12.34');await phone.fill('#category','travel');await phone.fill('#note','Saved on phone');await phone.click('#save');
  await phone.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');
  await computer.click('#refresh');await computer.waitForFunction(()=>document.getElementById('records').textContent.includes('Saved on phone'));
  await computer.locator('.edit-entry').first().click();await computer.fill('#edit-note','Updated on computer');await computer.click('#edit-save');
  await computer.waitForFunction(()=>!document.getElementById('edit-dialog').open);
  await phone.click('#refresh');await phone.waitForFunction(()=>document.getElementById('records').textContent.includes('Updated on computer'));
  await phone.click('#advanced-tools summary');await phone.selectOption('#sql-example','list');await phone.click('#sql-run');
  await phone.waitForFunction(()=>document.getElementById('sql-status').textContent.includes('执行完成'));
  await phone.fill('#sql-code',"UPDATE jilu SET note='Edited in cloud SQL' WHERE id=58;");await phone.click('#sql-run');
  await phone.waitForFunction(()=>document.getElementById('records').textContent.includes('Edited in cloud SQL'));
  await computer.click('#refresh');await computer.waitForFunction(()=>document.getElementById('records').textContent.includes('Edited in cloud SQL'));
  await phone.click('#advanced-tools summary');await phone.click('#cloud-settings summary');await phone.click('#change-password');
  assert.equal(await phone.locator('#password-required option[value="off"]').evaluate(el=>el.disabled),true);
  await phone.click('#password-cancel');
  const downloaded=computer.waitForEvent('download');await computer.click('#cloud-settings summary');await computer.click('#export-backup');const download=await downloaded;assert.match(download.suggestedFilename(),/^montra-backup-/);
  await phone.click('#cloud-settings summary');await phone.selectOption('#language','en');assert.equal(await phone.locator('#advanced-tools summary').textContent(),'Advanced tools (SQL)');
  assert.equal(await phone.locator('#lock').textContent(),'Sign out');
  await phone.selectOption('#language','zh');await phone.click('#cloud-settings summary');
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mkdir(join(root,'test-results'),{recursive:true});
  await phone.screenshot({path:join(root,`test-results/cloud-mobile-${engine.name()}.png`),fullPage:true});
  await computer.screenshot({path:join(root,`test-results/cloud-desktop-${engine.name()}.png`),fullPage:true});
  // Adding a ledger is one name field; switching keeps drafts and scopes SQL.
  await phone.fill('#amount','9.99');await phone.fill('#note','Personal unsaved draft');
  await phone.click('#add-book');await phone.fill('#book-name','旅行');await phone.click('#book-save');
  await phone.waitForFunction(()=>!document.getElementById('book-dialog').open&&document.getElementById('record-count').textContent==='0 笔');
  const travelId=await phone.inputValue('#book-select');assert.notEqual(travelId,'1');
  assert.equal(await phone.inputValue('#amount'),'');assert.equal(await phone.inputValue('#note'),'');assert.equal(await phone.locator('#all-net').textContent(),'0.00');
  await phone.fill('#amount','8.76');await phone.fill('#category','hotel');await phone.fill('#note','Travel ledger only');await phone.click('#save');
  await phone.waitForFunction(()=>document.getElementById('record-count').textContent==='1 笔');
  await computer.click('#refresh');assert.equal(await computer.inputValue('#book-select'),'1');assert.equal(await computer.locator('#record-count').textContent(),'58 笔');assert.ok(!(await computer.locator('#records').textContent()).includes('Travel ledger only'));
  await phone.click('#advanced-tools summary');await phone.fill('#sql-code',"UPDATE jilu SET note='Only this travel ledger';");await phone.click('#sql-run');
  await phone.waitForFunction(()=>document.getElementById('records').textContent.includes('Only this travel ledger'));
  await phone.click('#advanced-tools summary');
  await computer.selectOption('#book-select',travelId);await computer.waitForFunction(()=>document.getElementById('records').textContent.includes('Only this travel ledger'));
  await phone.selectOption('#book-select','1');await phone.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');
  assert.equal(await phone.inputValue('#amount'),'9.99');assert.equal(await phone.inputValue('#note'),'Personal unsaved draft');
  await computer.selectOption('#book-select','1');await computer.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');assert.ok(!(await computer.locator('#records').textContent()).includes('Only this travel ledger'));
  await phone.reload();await phone.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');assert.equal(await phone.inputValue('#book-select'),'1');
  await phone.click('#add-book');await phone.fill('#book-name','旅行');await phone.click('#book-save');await phone.waitForFunction(()=>document.getElementById('book-message').textContent.includes('同名'));await phone.click('#book-cancel');
  await phone.screenshot({path:join(root,`test-results/books-mobile-${engine.name()}.png`),fullPage:false});
  await phone.click('#add-book');await phone.screenshot({path:join(root,`test-results/add-book-${engine.name()}.png`),fullPage:false});await phone.click('#book-cancel');
  // The first-time setup is a separate local page; no real Cloudflare calls here.
  let publishCalls=0;
  setup=await startCloudSetup({initialState:{},browser:false,publish:async({password,onProgress})=>{publishCalls++;assert.equal(password,'ab56');onProgress('正在验证设置流程');await new Promise(resolve=>setTimeout(resolve,150));return {url:'https://montra-demo.example.workers.dev',importedRows:46};}});
  const wizard=await mobile.newPage();wizard.on('pageerror',e=>errors.push(e.message));await wizard.goto(setup.url);
  await wizard.screenshot({path:join(root,`test-results/cloud-setup-${engine.name()}.png`),fullPage:true});
  await wizard.fill('#password','ab56');await wizard.fill('#confirm','ab56');await wizard.click('#publish');
  await wizard.waitForSelector('#done:visible');assert.equal(publishCalls,1);assert.equal(await wizard.locator('#open-ledger').getAttribute('href'),'https://montra-demo.example.workers.dev/');
  await phone.click('#cloud-settings summary');await phone.click('#change-password');
  await phone.fill('#current-password','abcd');await phone.fill('#new-password','ab56');await phone.fill('#confirm-password','ab56');await phone.click('#password-save');
  await phone.waitForFunction(()=>!document.getElementById('password-dialog').open);
  await computer.click('#refresh');await computer.waitForSelector('#auth-dialog[open]');
  await computer.fill('#access-password','ab56');await computer.click('#auth-submit');await computer.waitForFunction(()=>!document.getElementById('auth-dialog').open);
  await computer.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');
  // Signing out revokes this browser's session, clears cached ledger data and drafts,
  // survives reload, and leaves the other device signed in.
  const oldProof=await computer.evaluate(()=>localStorage.getItem('montra.session'));
  const oldCookies=await desktop.cookies(origin);
  await computer.fill('#amount','99.99');await computer.fill('#note','Private unsaved draft');
  await computer.click('#cloud-settings summary');assert.equal(await computer.locator('#lock').textContent(),'退出登录');await computer.click('#lock');
  await computer.waitForSelector('#auth-dialog[open]');await computer.waitForFunction(()=>!document.getElementById('auth-submit').disabled);
  assert.equal(await computer.locator('#records tr').count(),0);assert.equal(await computer.inputValue('#note'),'');
  assert.equal(await computer.evaluate(()=>localStorage.getItem('montra.session')),null);
  const revoked=await fetch(origin+'/api/books',{headers:{Cookie:oldCookies.map(c=>`${c.name}=${c.value}`).join('; '),'X-Ledger-Session':oldProof}});assert.equal(revoked.status,401);
  await computer.reload();await computer.waitForSelector('#auth-dialog[open]');assert.equal(await computer.locator('#records tr').count(),0);
  await phone.click('#refresh');await phone.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');assert.equal(await phone.locator('#auth-dialog').getAttribute('open'),null);
  await computer.fill('#access-password','ab56');await computer.click('#auth-submit');await computer.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');
  // Even without a network, signing out hides data and prevents automatic re-entry.
  await desktop.setOffline(true);await computer.click('#cloud-settings summary');await computer.click('#lock');
  await computer.waitForFunction(()=>document.getElementById('auth-message').textContent.includes('已在此浏览器退出'));
  assert.equal(await computer.locator('#records tr').count(),0);
  await desktop.setOffline(false);await computer.reload();await computer.waitForSelector('#auth-dialog[open]');
  await computer.fill('#access-password','ab56');await computer.click('#auth-submit');await computer.waitForFunction(()=>document.getElementById('record-count').textContent==='58 笔');
  assert.deepEqual(errors,[]);
  console.log(`Cloud ${engine.name()}: Worker + D1, two devices, create/edit/SQL/paging/backup, sign-in/out, offline logout, simple setup, mobile layout and language passed.`);
}finally{
  if(browser)await browser.close();if(setup)await setup.close();if(proxy)await proxy.dispose();
  if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  await rm(temp,{recursive:true,force:true});
}
