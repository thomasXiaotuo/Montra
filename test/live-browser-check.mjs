// Real HTTP/browser/SQL integration using a uniquely named disposable database.
// Never writes to the configured personal ledger.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import sql from 'mssql';
import {chromium,webkit} from '@playwright/test';
import {loadEnvironment} from '../runtime.mjs';

loadEnvironment();
const {connectionConfig,getPool}=await import('../database.mjs');
const config=await connectionConfig();
const name=`montra_browser_${randomBytes(6).toString('hex')}`;
const admin=new sql.ConnectionPool({...config,database:'master'});
await admin.connect();
let browser,server,pool;
try{
  const existing=await admin.request().input('name',sql.NVarChar(128),name).query('SELECT DB_ID(@name) AS id');
  assert.equal(existing.recordset[0].id,null);
  process.env.SQL_DATABASE=name;
  // Pass the resolved password privately to the initializer, never to logs.
  await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/init-db.mjs',import.meta.url))],{
    env:{...process.env,SQL_PASSWORD:config.password},timeout:30000
  });
  const {createApp}=await import('../server.mjs');
  const port=3213;
  server=createApp(undefined,port);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const engine=process.env.BROWSER==='webkit'?webkit:chromium;
  browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('账本已连接'));
  assert.equal(await page.locator('#record-count').textContent(),'0 笔');
  await page.fill('#amount','14.48');
  await page.fill('#category',"餐饮 O'Brien");
  await page.fill('#note','真实连接测试 50%_ [中文]');
  await page.locator('#note').press('Meta+Enter');
  await page.waitForFunction(()=>document.getElementById('form-message').textContent.includes('已保存'));
  await page.waitForFunction(()=>document.getElementById('expense').textContent==='14.48');
  pool=await getPool();
  let result=await pool.request().query('SELECT COUNT(*) AS count, CONVERT(varchar(30),SUM(amount)) AS amount FROM dbo.jilu');
  assert.equal(result.recordset[0].count,1);
  assert.equal(result.recordset[0].amount,'14.48');
  await page.locator('#entry-form input[name="type"][value="i"]').check();
  await page.fill('#amount','100.01');
  await page.fill('#category','收入');
  await page.click('#save');
  await page.waitForFunction(()=>document.getElementById('income').textContent==='100.01');
  assert.equal(await page.locator('#net').textContent(),'85.53');
  await page.fill('#search','50%_ [中文]');
  await page.waitForFunction(()=>document.getElementById('record-count').textContent==='1 笔');
  assert.match(await page.locator('#records').textContent(),/真实连接测试/);
  await page.fill('#search','');
  await page.waitForFunction(()=>document.getElementById('record-count').textContent==='2 笔');
  await page.fill('#sql-code',"SELECT COUNT(*) AS count FROM dbo.jilu;\nGO\nSELECT N'中文 SQL' AS note;");
  await page.locator('#sql-code').press('Meta+Enter');
  await page.waitForFunction(()=>document.getElementById('sql-status').textContent.includes('执行完成'));
  assert.deepEqual(await page.locator('#sql-results td').allTextContents(),['2','中文 SQL']);
  const snapshot=async id=>(await pool.request().input('id',sql.Int,id).query("SELECT id,CONVERT(char(10),riqi,23) AS riqi,type,CONVERT(varchar(30),amount) AS amount,category,note FROM dbo.jilu WHERE id=@id")).recordset[0];
  const update=async(id,entry,original)=>fetch(`http://127.0.0.1:${port}/api/entries/${id}`,{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify({...entry,original})});
  const today=await page.inputValue('#date');
  const previousMonth=new Date(`${today.slice(0,7)}-01T12:00:00Z`);previousMonth.setUTCMonth(previousMonth.getUTCMonth()-1);
  const pastDate=previousMonth.toISOString().slice(0,10);
  await page.fill('#amount','9.99');await page.fill('#note','保留新增草稿');
  await page.locator('.edit-entry[data-entry-id="1"]').click();
  await page.fill('#edit-date',pastDate);await page.fill('#edit-amount','20.25');
  await page.locator('#edit-form input[value="i"]').check();
  await page.fill('#edit-category',"更正 O'Brien");await page.fill('#edit-note','');
  await page.screenshot({path:`test-results/edit-${engine.name()}.png`,fullPage:false});
  await page.locator('#edit-note').press('Meta+Enter');
  await page.waitForFunction(()=>!document.getElementById('edit-dialog').open);
  await page.waitForFunction(()=>document.getElementById('expense').textContent==='0.00');
  assert.deepEqual(await snapshot(1),{id:1,riqi:pastDate,type:'i',amount:'20.25',category:"更正 O'Brien",note:null});
  assert.equal(await page.locator('#all-net').textContent(),'120.26');
  assert.equal(await page.locator('.edit-entry[data-entry-id="1"]').count(),0);
  assert.equal(await page.inputValue('#amount'),'9.99');assert.equal(await page.inputValue('#note'),'保留新增草稿');
  await page.locator('#all-months').check();await page.waitForSelector('.edit-entry[data-entry-id="1"]');
  await page.locator('.edit-entry[data-entry-id="1"]').click();
  await page.fill('#edit-note','取消的修改');await page.click('#edit-cancel');
  assert.equal((await snapshot(1)).note,null);
  await page.locator('.edit-entry[data-entry-id="1"]').click();
  await page.fill('#edit-date',today);await page.fill('#edit-amount','16.75');
  await page.locator('#edit-form input[value="e"]').check();
  await page.fill('#edit-note','中文修改');await page.locator('#edit-note').press('Control+Enter');
  await page.waitForFunction(()=>!document.getElementById('edit-dialog').open);
  await page.waitForFunction(()=>document.getElementById('expense').textContent==='16.75');
  assert.equal(await page.locator('#net').textContent(),'83.26');
  assert.equal((await snapshot(1)).note,'中文修改');
  assert.equal((await pool.request().query('SELECT COUNT(*) AS count FROM dbo.jilu')).recordset[0].count,2);
  // Polling must preserve the editor draft; concurrent writes must not be overwritten.
  await page.locator('.edit-entry[data-entry-id="2"]').click();
  await page.fill('#edit-note','编辑中的草稿');
  await pool.request().query('UPDATE dbo.jilu SET amount=777.77 WHERE id=2');
  await page.evaluate(()=>document.getElementById('refresh').click());
  await page.waitForFunction(()=>document.getElementById('income').textContent==='777.77');
  assert.equal(await page.inputValue('#edit-note'),'编辑中的草稿');
  await page.click('#edit-save');
  await page.waitForFunction(()=>document.getElementById('edit-message').textContent.includes('已被修改或删除'));
  assert.equal((await snapshot(2)).amount,'777.77');await page.click('#edit-cancel');
  // Empty/null notes, case and trailing-space changes are included in conflict checks.
  let original=await snapshot(1);
  assert.equal((await update(1,original,original)).status,200);
  await pool.request().query("UPDATE dbo.jilu SET category=category+N' ' WHERE id=1");
  assert.equal((await update(1,original,original)).status,409);
  original=await snapshot(1);
  await pool.request().query("UPDATE dbo.jilu SET note=N'中文修改 ' WHERE id=1");
  assert.equal((await update(1,original,original)).status,409);
  // Exercise paging against actual SQL Server, confined to the disposable DB.
  await pool.request().input('today',sql.VarChar(10),today).query(`
    INSERT INTO dbo.jilu (riqi,type,amount,category,note)
    SELECT TOP (55) CONVERT(date,@today),'e',0.01,N'分页测试',N'isolated'
    FROM sys.all_objects;
  `);
  await page.click('#refresh');
  await page.waitForFunction(()=>document.getElementById('record-count').textContent==='57 笔');
  assert.equal(await page.locator('#records tr').count(),10);
  assert.equal(await page.locator('#page-info').textContent(),'第 1 页 / 6 页 · 每页 10 笔');
  assert.equal(await page.locator('#page-prev').isDisabled(),true);
  const ids=[];
  for(let currentPage=1;currentPage<=6;currentPage++){
    if(currentPage>1){
      await page.click('#page-next');
      await page.waitForFunction(n=>document.getElementById('page-info').textContent.startsWith(`第 ${n} 页`),currentPage);
    }
    const pageIds=await page.locator('.edit-entry').evaluateAll(buttons=>buttons.map(b=>Number(b.dataset.entryId)));
    assert.equal(pageIds.length,currentPage===6?7:10);
    ids.push(...pageIds);
  }
  assert.equal(new Set(ids).size,57);
  assert.deepEqual(ids,Array.from({length:57},(_,i)=>57-i));
  assert.equal(await page.locator('#page-next').isDisabled(),true);
  await page.click('#page-prev');
  await page.waitForFunction(()=>document.getElementById('page-info').textContent.startsWith('第 5 页'));
  assert.equal(await page.locator('#records tr').count(),10);
  await page.selectOption('#filter-category','收入');
  await page.waitForFunction(()=>document.getElementById('record-count').textContent==='1 笔');
  assert.equal(await page.locator('#page-info').textContent(),'第 1 页 / 1 页 · 每页 10 笔');
  assert.equal(await page.locator('#page-prev').isDisabled(),true);
  assert.equal(await page.locator('#page-next').isDisabled(),true);
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('record-count').textContent==='57 笔');
  assert.equal(await page.locator('#records tr').count(),10);
  await page.screenshot({path:`test-results/live-${engine.name()}.png`,fullPage:true});
  original=await snapshot(2);await pool.request().query('DELETE FROM dbo.jilu WHERE id=2');
  assert.equal((await update(2,original,original)).status,409);
  assert.deepEqual(errors,[]);
  console.log(`PASS (${engine.name()}): real create/edit, all fields, stable IDs, cancellation, cross-month totals, Command/Ctrl+Enter, Unicode/null notes, polling draft retention, atomic conflicts (external update/delete/whitespace), paging and persistence. Personal ledger untouched.`);
}finally{
  if(browser)await browser.close();
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  if(server)await (pool||await getPool().catch(()=>null))?.close();
  try{
    await admin.request().query(`IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`);
  }finally{await admin.close();}
}
