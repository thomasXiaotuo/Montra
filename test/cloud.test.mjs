import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getPlatformProxy} from 'wrangler';
import {cloudAuth,passwordHash} from '../cloud/auth.mjs';
import {cloudPasswordProof,newCloudPassword} from '../public/cloud-auth.js';
import {cloudDatabase} from '../cloud/database.mjs';
import {executeCloudSql,cloudStatements} from '../cloud/sql-console.mjs';
import worker from '../cloud/worker.mjs';
import {validateFilters,validateEntry} from '../domain.mjs';

test('cloud ledger: real D1, isolated authentication, multi-device sessions and guarded SQL',async t=>{
  const proxy=await getPlatformProxy({configPath:new URL('../cloud/wrangler.jsonc',import.meta.url).pathname,persist:false});
  t.after(()=>proxy.dispose());
  const env=proxy.env;
  for(const [binding,file]of [['LEDGER_DB','ledger-schema.sql'],['AUTH_DB','auth-schema.sql']]){
    const schema=await readFile(new URL('../cloud/'+file,import.meta.url),'utf8');
    await env[binding].batch(schema.split(';').filter(v=>v.trim()).map(v=>env[binding].prepare(v)));
  }
  const salt='12345678901234567890123456789012';
  await env.AUTH_DB.prepare('INSERT INTO access_settings(id,salt,password_hash) VALUES(1,?,?)').bind(salt,await passwordHash('abcd',salt)).run();
  const db=cloudDatabase(env.LEDGER_DB),auth=cloudAuth(env.AUTH_DB);
  const entry=(id,extra={})=>validateEntry({riqi:'2026-10-16',type:'e',amount:'0.01',category:'eat',note:`Entry ${id}`,...extra});
  const origin='https://montra.example';
  const request=(path,session={},data)=>new Request(origin+path,{method:data===undefined?'GET':'POST',headers:{...session,...(data===undefined?{}:{'Content-Type':'application/json','X-Ledger-Request':'1',Origin:origin})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const call=(path,session,data)=>worker.fetch(request(path,session,data),env);
  const loginData=async password=>({proof:await cloudPasswordProof(password,await auth.passwordSalt())});
  const login=async(password='abcd')=>{const res=await call('/api/auth/login',{}, await loginData(password));assert.equal(res.status,200);assert.match(res.headers.get('Set-Cookie'),/Secure/);return {Cookie:res.headers.get('Set-Cookie').split(';')[0],'X-Ledger-Session':(await res.json()).accessToken};};
  const filter=validateFilters(new URLSearchParams({today:'2026-10-16',month:'2026-10',all:'1'}));
  const statePath='/api/state?today=2026-10-16&month=2026-10&all=1';

  await t.test('all ledger data and SQL require both cookie and session proof',async()=>{
    assert.equal((await call(statePath)).status,401);
    assert.equal((await call('/api/export')).status,401);
    assert.equal((await call('/api/sql',{}, {code:'SELECT 1'})).status,401);
    assert.equal((await call('/api/auth/login',{}, {password:'wrong'})).status,401);
    const session=await login();
    assert.equal((await call(statePath,{Cookie:session.Cookie})).status,401);
    assert.equal((await call(statePath,{'X-Ledger-Session':session['X-Ledger-Session']})).status,401);
    const forged=request('/api/auth/login',{}, {password:'abcd'});forged.headers.set('Origin','https://evil.example');
    assert.equal((await worker.fetch(forged,env)).status,403);
    const cross=request(statePath,session);cross.headers.set('Sec-Fetch-Site','cross-site');assert.equal((await worker.fetch(cross,env)).status,403);
  });
  await t.test('57 entries paginate by 10, search is literal and sums use integer cents',async()=>{
    for(let i=1;i<=57;i++)await db.insertEntry(entry(i,i===1?{note:"O'Brien 50%_ <img src=x onerror=alert(1)>"}:{}));
    const first=await db.readState(filter);assert.equal(first.total,57);assert.equal(first.rows.length,10);assert.equal(first.summary.expense,'0.57');
    assert.equal((await db.readState({...filter,page:6})).rows.length,7);
    assert.equal((await db.readState({...filter,page:7})).total,57);
    assert.equal((await db.readState({...filter,q:'50%_'})).total,1);
    await assert.rejects(env.LEDGER_DB.prepare("INSERT INTO jilu(riqi,type,amount,category) VALUES('2026-02-30','e',1,'eat')").run());
    await assert.rejects(env.LEDGER_DB.prepare("UPDATE jilu SET amount=0.001 WHERE id=1").run());
  });
  await t.test('two devices share edits and stale edits cannot overwrite newer data',async()=>{
    const computer=await login(),phone=await login();
    const initial=(await (await call(statePath,computer)).json()).rows[0];
    const changed={...initial,note:'Changed on phone',original:initial};
    assert.equal((await call('/api/entries/'+initial.id,phone,changed)).status,200);
    const fresh=(await (await call(statePath,computer)).json()).rows[0];assert.equal(fresh.note,'Changed on phone');
    assert.equal((await call('/api/entries/'+initial.id,computer,{...changed,note:'Stale computer edit'})).status,409);
    const created=await call('/api/entries',phone,entry(58,{amount:'0.02'}));assert.equal(created.status,201);
    assert.equal((await (await call(statePath,computer)).json()).total,58);
    const backup=await (await call('/api/export',computer)).json();assert.equal(backup.rows.length,58);assert.equal(backup.format,'montra-ledger-v1');
  });
  await t.test('SQL supports queries and ledger edits, rejects destructive scripts before writing, cannot access auth',async()=>{
    let result=await executeCloudSql(env.LEDGER_DB,"SELECT * FROM jilu ORDER BY id LIMIT 2;\nGO\nUPDATE jilu SET note='SQL; update -- ok' WHERE id=1;\nSELECT note FROM jilu WHERE id=1 -- trailing comment");
    assert.equal(result.ok,true);assert.equal(result.recordsets[0].rows.length,2);assert.equal(result.rowsAffected[0].count,1);assert.equal(result.recordsets[1].rows[0][0],'SQL; update -- ok');
    result=await executeCloudSql(env.LEDGER_DB,"INSERT INTO jilu(riqi,type,amount,category,note) VALUES('2026-10-16','i',12.34,'salary','SQL insert');");assert.equal(result.ok,true);
    for(const code of ['DELETE FROM jilu','DROP TABLE jilu','PRAGMA writable_schema=1','UPDATE access_settings SET version=2','INSERT INTO sqlite_sequence(name,seq) VALUES(\'jilu\',0)',"UPDATE jilu SET note='must not commit' WHERE id=1; DELETE FROM jilu;"]){assert.throws(()=>cloudStatements(code));}
    assert.equal((await env.LEDGER_DB.prepare('SELECT note FROM jilu WHERE id=1').first()).note,'SQL; update -- ok');
    await assert.rejects(executeCloudSql(env.LEDGER_DB,'SELECT * FROM sessions'),e=>e.status===400);
    await assert.rejects(executeCloudSql(env.LEDGER_DB,'SELECT * FROM access_settings'),e=>e.status===400);
    result=await executeCloudSql(env.LEDGER_DB,'SELECT 1 AS result; SELECT missing FROM jilu; UPDATE jilu SET note=\'skipped\';');assert.equal(result.ok,false);assert.equal(result.rowsAffected.length,0);
  });
  await t.test('password changes survive restart, revoke other devices, and logout only revokes its own session',async()=>{
    const first=await login(),second=await login();
    assert.equal((await call('/api/auth/settings',first,{enabled:false,currentPassword:'abcd'})).status,400);
    assert.equal((await call('/api/auth/settings',first,{enabled:true,currentPassword:'abcd',newPassword:'abc'})).status,400);
    const next=await newCloudPassword('5656');
    await assert.rejects(newCloudPassword('abc'));
    const res=await call('/api/auth/settings',first,{enabled:true,currentProof:await cloudPasswordProof('abcd',salt),newSalt:next.salt,newProof:next.proof});assert.equal(res.status,200);
    const current={Cookie:res.headers.get('Set-Cookie').split(';')[0],'X-Ledger-Session':(await res.json()).accessToken};
    assert.equal((await call(statePath,first)).status,401);assert.equal((await call(statePath,second)).status,401);
    assert.ok(await cloudAuth(env.AUTH_DB).session(request(statePath,current)));
    assert.equal((await call('/api/auth/login',{}, await loginData('abcd'))).status,401);
    const otherDevice=await login('5656');
    assert.equal((await call('/api/auth/logout',current,{})).status,200);assert.equal((await call(statePath,current)).status,401);
    assert.equal((await call(statePath,otherDevice)).status,200);
  });
  await t.test('guessing limits persist between Worker instances and expire after 15 minutes',async()=>{
    await env.AUTH_DB.prepare('DELETE FROM login_limits').run();let now=1000;
    const req=request('/api/auth/login');
    for(let i=0;i<5;i++)await assert.rejects(cloudAuth(env.AUTH_DB,()=>now).login(req,'bad-password'),e=>e.status===401);
    await assert.rejects(cloudAuth(env.AUTH_DB,()=>now).login(req,await cloudPasswordProof('5656',await auth.passwordSalt())),e=>e.status===429);
    now+=15*60*1000+1;assert.ok((await cloudAuth(env.AUTH_DB,()=>now).login(req,await cloudPasswordProof('5656',await auth.passwordSalt()))).accessToken);
  });
});
