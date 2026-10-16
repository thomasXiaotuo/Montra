import {test} from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createTestApp as createApp,testLogin,browserLogin,TEST_PASSWORD} from './support.mjs';
import {UserError} from '../domain.mjs';
test('HTTP 入口验证、跨站保护和正常保存',async t=>{
  let writes=0;
  const server=createApp({readState:async f=>({month:f.month}),insertEntry:async e=>{writes++;return {id:25,...e};},setPassword:async()=>{},executeSql:async code=>({ok:true,code})},3211);
  await new Promise(resolve=>server.listen(3211,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const root=`http://127.0.0.1:${server.address().port}`;
  const headers={...await testLogin(root),Host:'127.0.0.1:3211','Content-Type':'application/json','X-Ledger-Request':'1'};
  const body=JSON.stringify({riqi:'2026-10-13',type:'i',amount:'123.45',category:'salary',note:"O'Brien"});
  let res=await fetch(root+'/api/entries',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body});assert.equal(res.status,403);assert.equal(writes,0);
  res=await fetch(root+'/api/entries',{method:'POST',headers,body:body.replace('123.45','-1')});assert.equal(res.status,400);assert.equal(writes,0);
  res=await fetch(root+'/api/entries',{method:'POST',headers,body});assert.equal(res.status,201);assert.equal((await res.json()).note,"O'Brien");assert.equal(writes,1);
  res=await fetch(root+'/api/state?today=2026-10-13&month=2026-10',{headers:{...headers,Host:'127.0.0.1:3211'}});assert.equal(res.status,200);assert.equal((await res.json()).month,'2026-10');
  res=await fetch(root+'/api/state?today=2026-10-13&month=invalid',{headers:{...headers,Host:'127.0.0.1:3211'}});assert.equal(res.status,400);
  res=await fetch(root+'/api/sql',{method:'POST',headers,body:JSON.stringify({code:'SELECT 1;'})});assert.equal(res.status,200);assert.equal((await res.json()).code,'SELECT 1;');
  res=await fetch(root+'/api/sql',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify({code:'SELECT 1;'})});assert.equal(res.status,403);
  res=await fetch(root+'/api/entries',{method:'POST',headers:{...headers,'X-Ledger-Language':'en'},body:body.replace('123.45','-1')});assert.equal(res.status,400);assert.equal((await res.json()).error,'Enter a positive amount with no more than 2 decimal places.');
  res=await fetch(root+'/api/entries',{method:'POST',headers:{...headers,'X-Ledger-Language':'zh'},body:body.replace('123.45','-1')});assert.equal((await res.json()).error,'金额必须大于零，最多两位小数。');
  const status=await new Promise((resolve,reject)=>{const req=http.get(root+'/',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);});assert.equal(status,403);
});

test('editing validates IDs, original values and entries, protects writes and localizes conflicts',async t=>{
  const calls=[];
  const server=createApp({updateEntry:async(id,entry,original)=>{
    if(id===99)throw new UserError('账单已被修改或删除，请刷新后重新编辑。',409);
    calls.push({id,entry,original});return {id};
  }},3216);
  await new Promise(resolve=>server.listen(3216,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:3216/api/entries/';
  const headers={...await testLogin('http://127.0.0.1:3216'),'Content-Type':'application/json','X-Ledger-Request':'1','X-Ledger-Language':'en'};
  const original={riqi:'2026-10-01',type:'e',amount:'14.48',category:'eat',note:null};
  const changed={...original,amount:'25.01',category:" 餐饮 O'Brien ",note:' 修正 ',original};
  const post=(id,data=changed,extra={})=>fetch(url+id,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
  for(const id of ['0','-1','1.5','abc','2147483648'])assert.equal((await post(id)).status,400);
  for(const data of [null,[],{...changed,original:null},{...changed,amount:'-1'},{...changed,riqi:'2026-02-30'},{...changed,category:''},{...changed,note:'a'.repeat(201)}])assert.equal((await post(25,data)).status,400);
  assert.equal((await post(25,changed,{Origin:'https://evil.example'})).status,403);
  assert.equal((await post(25,changed,{'X-Ledger-Request':''})).status,403);
  assert.equal((await post(25,changed,{'Content-Type':'text/plain'})).status,415);
  assert.equal(calls.length,0);
  const saved=await post(25);assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{id:25});
  assert.deepEqual(calls,[{id:25,entry:{...original,amount:'25.01',category:"餐饮 O'Brien",note:'修正'},original}]);
  const conflict=await post(99);assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).error,'This entry has changed or was deleted. Refresh and reopen the editor.');
});
