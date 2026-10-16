import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {validateEntry} from '../domain.mjs';
let records=[{id:1,riqi:'2026-10-01',type:'e',amount:'14.48',category:'eat',note:'Lunch'}, {id:2,riqi:'2026-10-01',type:'i',amount:'3000.00',category:'salary',note:'Work'}, {id:3,riqi:'2026-09-01',type:'e',amount:'100.00',category:'shop',note:'Previous month'}, {id:4,riqi:'2026-10-31',type:'e',amount:'20.00',category:'future',note:'Future record'}, {id:5,riqi:'2026-10-02',type:'e',amount:'5.00',category:'other',note:'<img src=x onerror=alert(1)>'}];
const cents=r=>Math.round(Number(r.amount)*100);
const decimal=n=>(n/100).toFixed(2);
let fail=false;
const server=createApp({
  readState:async f=>{
    if(fail)throw new Error('offline');
    const current=records.filter(r=>r.riqi>=f.start&&r.riqi<f.end&&r.riqi<=f.today);
    const income=current.filter(r=>r.type==='i').reduce((s,r)=>s+cents(r),0);
    const expense=current.filter(r=>r.type==='e').reduce((s,r)=>s+cents(r),0);
    const allNet=decimal(records.filter(r=>r.riqi<=f.today).reduce((s,r)=>s+(r.type==='i'?1:-1)*cents(r),0));
    const filtered=records.filter(r=>(f.all||(r.riqi>=f.start&&r.riqi<f.end))&&(!f.type||r.type===f.type)&&(!f.category||r.category===f.category)&&(!f.q||`${r.category} ${r.note}`.includes(f.q))).sort((a,b)=>b.riqi.localeCompare(a.riqi)||b.id-a.id);
    const groups=new Map();for(const r of current.filter(r=>r.type==='e'))groups.set(r.category,(groups.get(r.category)||0)+cents(r));
    return {summary:{income:decimal(income),expense:decimal(expense),net:decimal(income-expense)},allNet,categories:[...new Set(records.map(r=>r.category))],breakdown:[...groups].map(([category,n])=>({category,amount:decimal(n)})),rows:filtered.slice((f.page-1)*50,f.page*50),total:filtered.length,page:f.page,month:f.month,updatedAt:new Date().toISOString()};
  },
  insertEntry:async entry=>{validateEntry(entry);await new Promise(r=>setTimeout(r,200));const row={id:Math.max(...records.map(r=>r.id))+1,...entry};records.push(row);return {id:row.id};},setPassword:async()=>{},
  executeSql:async code=>{
    if(code.includes('BROKEN'))return{ok:false,recordsets:[],messages:[],rowsAffected:[],error:{message:'Incorrect syntax',line:1,batch:1},elapsedMs:2,truncated:false};
    return{ok:true,recordsets:[{batch:1,columns:['result'],rows:[['2']],rowCount:1}],messages:[],rowsAffected:[{batch:1,count:1}],error:null,elapsedMs:1,truncated:false};
  }
},3212);
await new Promise(resolve=>server.listen(3212,'127.0.0.1',resolve));
let browser;
try{
  const engine=process.env.BROWSER==='webkit'?webkit:chromium;
  browser=await engine.launch({...(engine===chromium&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'zh-CN'});
  await context.addInitScript(()=>{const NativeDate=Date;class FixedDate extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-13T12:00:00-07:00']));}static now(){return new NativeDate('2026-10-13T12:00:00-07:00').getTime();}}window.Date=FixedDate;});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3212');await page.waitForFunction(()=>document.getElementById('income').textContent==='3,000.00');
  assert.equal(await page.locator('#expense').textContent(),'19.48');assert.equal(await page.locator('#all-net').textContent(),'2,880.52');
  assert.equal(await page.locator('#records img').count(),0);
  await page.selectOption('#filter-category','eat');await page.waitForFunction(()=>document.getElementById('record-count').textContent==='1 笔');
  await page.selectOption('#filter-category','');await page.waitForFunction(()=>document.getElementById('record-count').textContent==='4 笔');
  await page.fill('#amount','10.25');await page.fill('#category','eat');await page.fill('#note','Dinner');
  await page.locator('#save').dblclick();await page.waitForFunction(()=>document.getElementById('form-message').textContent.includes('已保存'));assert.equal(records.length,6);
  await page.waitForFunction(()=>document.getElementById('expense').textContent==='29.73');assert.equal(await page.inputValue('#amount'),'');assert.equal(await page.inputValue('#category'),'eat');
  // Simulates an external SQL write without touching the user's database.
  records.push({id:7,riqi:'2026-10-13',type:'i',amount:'100.00',category:'refund',note:'External SQL'});
  await page.waitForFunction(()=>document.getElementById('income').textContent==='3,100.00',null,{timeout:13000});
  await page.fill('#search','External SQL');await page.waitForFunction(()=>document.getElementById('record-count').textContent==='1 笔');
  await page.fill('#search','');await page.waitForFunction(()=>document.getElementById('record-count').textContent==='6 笔');
  await page.fill('#month','2026-09');await page.locator('#month').dispatchEvent('change');await page.waitForFunction(()=>document.getElementById('expense').textContent==='100.00');
  await page.click('#this-month');await page.waitForFunction(()=>document.getElementById('income').textContent==='3,100.00');
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:'test-results/mobile.png',fullPage:false});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  fail=true;await page.click('#refresh');await page.waitForFunction(()=>!document.getElementById('offline').hidden);assert.equal(await page.locator('#save').isDisabled(),true);
  assert.equal(await page.locator('#income').textContent(),'3,100.00');
  fail=false;await page.click('#refresh');await page.waitForFunction(()=>document.getElementById('offline').hidden);
  await page.selectOption('#sql-example','insert');assert.match(await page.inputValue('#sql-code'),/INSERT INTO/);assert.equal(records.length,7); // Templates do not execute.
  await page.fill('#sql-code','SELECT 1 + 1 AS result;');await page.locator('#sql-code').press('Control+Enter');await page.waitForFunction(()=>document.getElementById('sql-status').textContent.includes('执行完成'));
  assert.equal(await page.locator('#sql-results td').textContent(),'2');
  await page.fill('#sql-code','BROKEN');await page.click('#sql-run');await page.waitForFunction(()=>document.getElementById('sql-status').textContent.includes('第 1 行'));
  // Switch language without losing drafts, filters, amounts or SQL input.
  await page.fill('#amount','42.50');await page.fill('#note','我的备注 / Draft');
  await page.selectOption('#filter-category','eat');
  const draft="SELECT N'我的内容' AS note;";await page.fill('#sql-code',draft);
  await page.selectOption('#language','en');
  assert.equal(await page.locator('html').getAttribute('lang'),'en-US');
  assert.equal(await page.locator('.heading h1').textContent(),'Overview.');
  assert.equal(await page.inputValue('#amount'),'42.50');assert.equal(await page.inputValue('#note'),'我的备注 / Draft');
  assert.equal(await page.inputValue('#sql-code'),draft);assert.equal(await page.inputValue('#filter-category'),'eat');
  assert.match(await page.locator('#sql-status').textContent(),/Line 1:/);
  assert.equal(await page.locator('#toast').textContent(),'Language updated');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:'test-results/english-mobile.png',fullPage:false});
  await page.reload();await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('Connected'));
  assert.equal(await page.inputValue('#language'),'en'); // Choice persists across reload.
  await page.fill('#amount','-1');await page.fill('#category','eat');await page.click('#save');
  assert.match(await page.locator('#form-message').textContent(),/positive amount/);
  await page.selectOption('#sql-example','insert');assert.match(await page.inputValue('#sql-code'),/Edit the date/);
  await page.selectOption('#language','zh');assert.match(await page.locator('#form-message').textContent(),/金额必须/);
  assert.match(await page.inputValue('#sql-code'),/Edit the date/); // Changing language preserves SQL draft.
  await page.reload();await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('账本已连接'));
  assert.equal(await page.inputValue('#language'),'zh');
  const intlContext=await browser.newContext({viewport:{width:1440,height:1100},locale:'fr-FR'});
  const intlPage=await intlContext.newPage();await intlPage.goto('http://127.0.0.1:3212');
  await intlPage.waitForFunction(()=>document.documentElement.lang==='en-US');
  await intlPage.screenshot({path:'test-results/english-desktop.png',fullPage:false});
  await intlContext.close();
  assert.deepEqual(errors,[]);console.log('PASS: monthly totals, future-date exclusion, category filter, literal text, one save on double click, SQL polling, search, month change, mobile layout, offline state, SQL templates, keyboard execution, results, error lines, bilingual switching, preserved drafts, stored preference and English fallback.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
