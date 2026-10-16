import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAuth} from '../auth.mjs';
import {createApp} from '../server.mjs';
import {TEST_PASSWORD,testLogin} from './support.mjs';

test('all ledger endpoints require sessions; login/logout/change/expiry are enforced',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'montra-security-'));
  let now=Date.now();
  const auth=createAuth({directory,initialPassword:TEST_PASSWORD,now:()=>now});
  let calls=0;
  const server=createApp({readState:async()=>{calls++;return{ok:true};},executeSql:async()=>{calls++;return{ok:true};}},3218,auth);
  await new Promise(resolve=>server.listen(3218,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const root='http://127.0.0.1:3218';
  const headers={'Content-Type':'application/json','X-Ledger-Request':'1'};
  const post=(path,data={},cookie,extra={})=>fetch(root+path,{method:'POST',headers:{...headers,...(cookie||{}),...extra},body:JSON.stringify(data)});
  assert.equal((await fetch(root+'/api/state?today=2026-10-16&month=2026-10')).status,401);
  for(const path of ['/api/sql','/api/entries','/api/entries/1','/api/connect','/api/auth/password'])assert.equal((await post(path)).status,401);
  assert.equal(calls,0);
  assert.equal((await post('/api/auth/login',{password:TEST_PASSWORD},undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('/api/auth/login',{password:'wrong'})).status,401);
  const response=await post('/api/auth/login',{password:TEST_PASSWORD});assert.equal(response.status,200);
  const raw=response.headers.get('set-cookie');assert.match(raw,/HttpOnly/);assert.match(raw,/SameSite=Strict/);assert.doesNotMatch(raw,new RegExp(TEST_PASSWORD));
  const cookie={Cookie:raw.split(';')[0],'X-Ledger-Session':(await response.json()).accessToken};
  assert.equal((await post('/api/sql',{}, {Cookie:cookie.Cookie})).status,401);
  assert.equal((await post('/api/sql',{}, {'X-Ledger-Session':cookie['X-Ledger-Session']})).status,401);
  assert.equal((await fetch(root+'/api/state?today=2026-10-16&month=2026-10',{headers:{...cookie}})).status,200);
  assert.equal((await post('/api/sql',{code:'SELECT 1'},cookie,{Origin:'https://evil.example'})).status,403);
  assert.equal((await fetch(root+'/api/state',{headers:{...cookie,'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await post('/api/auth/logout',{},cookie)).status,200);
  assert.equal((await post('/api/sql',{},cookie)).status,401);
  const first=await testLogin(root),second=await testLogin(root);
  const next='A different access password 2026!';
  assert.equal((await post('/api/auth/password',{currentPassword:TEST_PASSWORD,newPassword:'short'},first)).status,400);
  const changed=await post('/api/auth/password',{currentPassword:TEST_PASSWORD,newPassword:next},first);assert.equal(changed.status,200);
  assert.equal((await post('/api/sql',{},first)).status,401);assert.equal((await post('/api/sql',{},second)).status,401);
  const newCookie={Cookie:changed.headers.get('set-cookie').split(';')[0],'X-Ledger-Session':(await changed.json()).accessToken};
  assert.equal((await post('/api/sql',{},newCookie)).status,200);
  await assert.rejects(readFile(auth.initialFile),{code:'ENOENT'});
  const stored=await readFile(join(directory,'auth.json'),'utf8');assert.ok(!stored.includes(next));assert.ok(!stored.includes(TEST_PASSWORD));
  const restarted=createAuth({directory,now:()=>now});assert.equal(restarted.authenticated({headers:{cookie:newCookie.Cookie,'x-ledger-session':newCookie['X-Ledger-Session']}}),false);
  now+=8*60*60*1000+1;assert.equal((await post('/api/sql',{},newCookie)).status,401);
  if(process.platform!=='win32'){
    assert.equal((await stat(directory)).mode&0o777,0o700);assert.equal((await stat(join(directory,'auth.json'))).mode&0o777,0o600);
  }
});

test('password guessing is rate-limited and lockout expires',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'montra-rate-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  let now=0;const auth=createAuth({directory,initialPassword:TEST_PASSWORD,now:()=>now});
  const res={setHeader(){}};
  for(let i=0;i<5;i++)await assert.rejects(auth.login('incorrect',res),e=>e.status===401);
  await assert.rejects(auth.login(TEST_PASSWORD,res),e=>e.status===429);
  now+=15*60*1000+1;await auth.login(TEST_PASSWORD,res);
});
