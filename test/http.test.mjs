import {test} from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
test('HTTP 入口验证、跨站保护和正常保存',async t=>{
  let writes=0;
  const server=createApp({readState:async f=>({month:f.month}),insertEntry:async e=>{writes++;return {id:25,...e};},setPassword:async()=>{},executeSql:async code=>({ok:true,code})},3211);
  await new Promise(resolve=>server.listen(3211,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const root=`http://127.0.0.1:${server.address().port}`;
  const headers={Host:'127.0.0.1:3211','Content-Type':'application/json','X-Ledger-Request':'1'};
  const body=JSON.stringify({riqi:'2026-10-13',type:'i',amount:'123.45',category:'salary',note:"O'Brien"});
  let res=await fetch(root+'/api/entries',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body});assert.equal(res.status,403);assert.equal(writes,0);
  res=await fetch(root+'/api/entries',{method:'POST',headers,body:body.replace('123.45','-1')});assert.equal(res.status,400);assert.equal(writes,0);
  res=await fetch(root+'/api/entries',{method:'POST',headers,body});assert.equal(res.status,201);assert.equal((await res.json()).note,"O'Brien");assert.equal(writes,1);
  res=await fetch(root+'/api/state?today=2026-10-13&month=2026-10',{headers:{Host:'127.0.0.1:3211'}});assert.equal(res.status,200);assert.equal((await res.json()).month,'2026-10');
  res=await fetch(root+'/api/state?today=2026-10-13&month=invalid',{headers:{Host:'127.0.0.1:3211'}});assert.equal(res.status,400);
  res=await fetch(root+'/api/sql',{method:'POST',headers,body:JSON.stringify({code:'SELECT 1;'})});assert.equal(res.status,200);assert.equal((await res.json()).code,'SELECT 1;');
  res=await fetch(root+'/api/sql',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify({code:'SELECT 1;'})});assert.equal(res.status,403);
  res=await fetch(root+'/api/entries',{method:'POST',headers:{...headers,'X-Ledger-Language':'en'},body:body.replace('123.45','-1')});assert.equal(res.status,400);assert.equal((await res.json()).error,'Enter a positive amount with no more than 2 decimal places.');
  res=await fetch(root+'/api/entries',{method:'POST',headers:{...headers,'X-Ledger-Language':'zh'},body:body.replace('123.45','-1')});assert.equal((await res.json()).error,'金额必须大于零，最多两位小数。');
  const status=await new Promise((resolve,reject)=>{const req=http.get(root+'/',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);});assert.equal(status,403);
});

test('编辑接口校验与跨站保护',async t=>{
  let writes=0;
  const server=createApp({updateEntry:async(id,entry)=>{writes++;return {id,...entry};}},3213);
  await new Promise(r=>server.listen(3213,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const entry={riqi:'2026-10-15',type:'e',amount:'1.25',category:'eat',note:null};
  const headers={'Content-Type':'application/json','X-Ledger-Request':'1'};
  const request=(id,data,extra={})=>fetch('http://127.0.0.1:3213/api/entries/'+id,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
  assert.equal((await request(1,{entry,original:entry},{Origin:'https://evil.example'})).status,403);
  for(const id of ['0','1.5','2147483648','abc'])assert.equal((await request(id,{entry,original:entry})).status,400);
  for(const data of [null,{}, {entry,original:null},{entry:{...entry,amount:'-1'},original:entry},{entry:{...entry,riqi:'2026-02-30'},original:entry},{entry:{...entry,note:'x'.repeat(201)},original:entry}])assert.equal((await request(1,data)).status,400);
  assert.equal(writes,0);const res=await request(1,{entry,original:entry});assert.equal(res.status,200);assert.equal((await res.json()).id,1);assert.equal(writes,1);
});
