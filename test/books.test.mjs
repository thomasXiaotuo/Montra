import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import {cloudBooks} from '../cloud/books.mjs';
import {cloudDatabase} from '../cloud/database.mjs';
import {executeCloudSql} from '../cloud/sql-console.mjs';
import {passwordHash} from '../cloud/auth.mjs';
import {cloudPasswordProof} from '../public/cloud-auth.js';
import {validateFilters} from '../domain.mjs';
import worker from '../cloud/worker.mjs';

test('multiple ledgers stay separate across forms, SQL, backups and independent device selection',async t=>{
  const proxy=await getPlatformProxy({configPath:new URL('../cloud/wrangler.jsonc',import.meta.url).pathname,persist:false});t.after(()=>proxy.dispose());
  const env=proxy.env;
  for(const [binding,file]of [['LEDGER_DB','ledger-schema.sql'],['LEDGER_DB','book-indexes.sql'],['AUTH_DB','auth-schema.sql']]){
    const schema=await readFile(new URL('../cloud/'+file,import.meta.url),'utf8');await env[binding].batch(schema.split(';').filter(v=>v.trim()).map(v=>env[binding].prepare(v)));
  }
  const books=cloudBooks(env.LEDGER_DB),first=cloudDatabase(env.LEDGER_DB);
  const filter=validateFilters(new URLSearchParams({today:'2026-10-16',month:'2026-10',all:'1'}));
  const entry={riqi:'2026-10-16',type:'e',amount:'12.34',category:'personal',note:"O'Brien"};
  const id=(await first.insertEntry(entry)).id;
  const requestId=randomUUID();const travel=await books.create({name:'旅行',requestId}),second=cloudDatabase(env.LEDGER_DB,travel.id);
  const work=await books.create({name:'工作',requestId:randomUUID()});
  const salt='12345678901234567890123456789012';await env.AUTH_DB.prepare('INSERT INTO access_settings(id,salt,password_hash) VALUES(1,?,?)').bind(salt,await passwordHash('abcd',salt)).run();
  const origin='https://montra.example';
  const call=(path,session={},data,selected)=>worker.fetch(new Request(origin+path,{method:data===undefined?'GET':'POST',headers:{...session,...(selected===undefined?{}:{'X-Ledger-Book':String(selected)}),...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-Ledger-Request':'1'})},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);
  const login=async()=>{const response=await call('/api/auth/login',{}, {proof:await cloudPasswordProof('abcd',salt)});return {Cookie:response.headers.get('Set-Cookie').split(';')[0],'X-Ledger-Session':(await response.json()).accessToken};};
  const session=await login(),phone=await login(),path='/api/state?today=2026-10-16&month=2026-10&all=1';
  await t.test('named ledger creation validates names and deduplicates repeated requests',async()=>{
    assert.equal((await books.create({name:'旅行',requestId})).id,travel.id);
    await assert.rejects(books.create({name:'旅行',requestId:randomUUID()}),e=>e.status===409);
    for(const name of ['', ' '.repeat(5),'x'.repeat(41),'wrong\nname'])await assert.rejects(books.create({name,requestId:randomUUID()}),e=>e.status===400);
    assert.equal((await call('/api/books')).status,401);assert.equal((await call('/api/books',{}, {name:'Blocked',requestId:randomUUID()})).status,401);
    assert.equal((await (await call('/api/books',session)).json()).books.length,3);
  });
  await t.test('new ledger starts empty; categories and every total stay scoped',async()=>{
    const empty=await second.readState(filter);assert.equal(empty.total,0);assert.deepEqual(empty.categories,[]);assert.equal(empty.allNet,'0.00');assert.equal(empty.summary.expense,'0.00');assert.deepEqual(empty.breakdown,[]);
    await second.insertEntry({...entry,type:'i',amount:'100.01',category:'travel',note:'Travel only'});
    const a=await first.readState(filter),b=await second.readState(filter);
    assert.equal(a.total,1);assert.equal(a.summary.expense,'12.34');assert.deepEqual(a.categories,['personal']);
    assert.equal(b.total,1);assert.equal(b.summary.income,'100.01');assert.equal(b.summary.expense,'0.00');assert.equal(b.allNet,'100.01');assert.deepEqual(b.categories,['travel']);
    await assert.rejects(second.updateEntry(id,{...entry,note:'Wrong ledger'},entry),e=>e.status===409);
    assert.equal((await first.exportRows())[0].note,"O'Brien");
    assert.equal((await call(path,session,undefined,999)).status,404);
    assert.equal((await call(path,session,undefined,'1 OR 1=1')).status,400);
  });
  await t.test('two devices can select different ledgers and edits use the request selection',async()=>{
    assert.equal((await (await call(path,session,undefined,1)).json()).book.id,1);
    assert.equal((await (await call(path,phone,undefined,travel.id)).json()).book.id,travel.id);
    const response=await call('/api/entries',phone,{...entry,amount:'3.21',category:'phone'},travel.id);assert.equal(response.status,201);
    assert.equal((await first.readState(filter)).total,1);assert.equal((await second.readState(filter)).total,2);
    assert.equal((await (await call(path,session)).json()).book.id,1);
  });
  await t.test('SQL scopes nested SELECTs, UNION, joins, inserts and broad updates to one ledger',async()=>{
    let result=await executeCloudSql(env.LEDGER_DB,'SELECT COUNT(*) AS count FROM jilu;',travel.id);assert.equal(result.recordsets[0].rows[0][0],'2');
    result=await executeCloudSql(env.LEDGER_DB,'SELECT a.id,(SELECT COUNT(*) FROM jilu) AS total FROM jilu a JOIN jilu b ON a.id=b.id;',travel.id);assert.equal(result.recordsets[0].rows.length,2);assert.ok(result.recordsets[0].rows.every(row=>row[1]==='2'));
    result=await executeCloudSql(env.LEDGER_DB,'SELECT id FROM jilu UNION ALL SELECT id FROM jilu;',travel.id);assert.equal(result.recordsets[0].rows.length,4);
    result=await executeCloudSql(env.LEDGER_DB,`UPDATE jilu SET note='Current book only' WHERE id=${id} OR 1=1;`,travel.id);assert.equal(result.rowsAffected[0].count,2);
    assert.equal((await first.exportRows())[0].note,"O'Brien");
    result=await executeCloudSql(env.LEDGER_DB,"INSERT INTO jilu(riqi,type,amount,category,note) VALUES('2026-10-16','e',0.29,'sql','O''Brien'),('2026-10-16','e',1.02,'sql','jilu');",travel.id);assert.equal(result.ok,true);
    const selectedRows=await second.exportRows();assert.equal(selectedRows.length,4);assert.equal(selectedRows.at(-2).note,"O'Brien");assert.equal(selectedRows.at(-1).note,'jilu');
    assert.equal((await first.readState(filter)).total,1);
    for(const code of ['SELECT * FROM main.jilu','SELECT * FROM books','SELECT * FROM sqlite_master','SELECT (SELECT name FROM books) FROM jilu','UPDATE jilu SET book_id=1',"INSERT INTO jilu(book_id,riqi,type,amount,category) VALUES(1,'2026-10-16','e',1,'sql')",'SELECT * FROM pragma_table_info(\'jilu\')'])await assert.rejects(executeCloudSql(env.LEDGER_DB,code,travel.id));
    result=await executeCloudSql(env.LEDGER_DB,'SELECT missing_column FROM jilu; UPDATE jilu SET note=\'must not run\';',travel.id);assert.equal(result.ok,false);assert.equal(result.rowsAffected.length,0);
    assert.equal((await cloudDatabase(env.LEDGER_DB,work.id).readState(filter)).total,0);
  });
  await t.test('current-ledger export excludes other records; full backup includes every named ledger',async()=>{
    const current=await (await call('/api/export',session,undefined,travel.id)).json();assert.equal(current.book.name,'旅行');assert.equal(current.rows.length,4);assert.ok(!current.rows.some(row=>row.id===id));
    const all=await (await call('/api/export?allBooks=1',session)).json();assert.equal(all.format,'montra-books-v1');assert.equal(all.books.length,3);assert.equal(all.books.find(book=>book.id===1).rows.length,1);assert.equal(all.books.find(book=>book.id===travel.id).rows.length,4);assert.equal(all.books.find(book=>book.id===work.id).rows.length,0);
  });
});
