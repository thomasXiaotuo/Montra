import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloud/worker.mjs';
import {LocalD1,testIdentityProvider} from './account-support.mjs';
import {passwordHash} from '../cloud/auth.mjs';
import {cloudPasswordProof,newCloudPassword} from '../public/cloud-auth.js';
test('Cloudflare identity, account isolation, migration, ledger locks and session revocation',async t=>{
 const provider=await testIdentityProvider(),nativeFetch=global.fetch;
 global.fetch=async(url,...args)=>String(url)===provider.issuer+'/cdn-cgi/access/certs'?Response.json({keys:[provider.jwk]}):nativeFetch(url,...args);
 t.after(()=>{global.fetch=nativeFetch;});
 const auth=new LocalD1(),ledger=new LocalD1();
 await auth.schema('../cloud/auth-schema.sql');await auth.schema('../cloud/account-schema.sql');
 await ledger.schema('../cloud/ledger-schema.sql');await ledger.schema('../cloud/account-ledger-migration.sql');
 const salt='12345678901234567890123456789012';
 await auth.prepare('INSERT INTO access_settings(id,salt,password_hash) VALUES(1,?,?)').bind(salt,await passwordHash('legacy-password',salt)).run();
 await ledger.prepare("INSERT INTO jilu(riqi,type,amount,category,note) VALUES('2026-10-18','i',100,'salary','ALICE PRIVATE')").run();
 const env={AUTH_DB:auth,LEDGER_DB:ledger,ACCESS_ISSUER:provider.issuer,ACCESS_AUD:provider.aud,LEGACY_OWNER_ID:provider.issuer+'|alice',LEGACY_MAX_BOOK_ID:'1'};
 const jwt={alice:await provider.jwt(),bob:await provider.jwt('bob')};
 const sessions={};
 async function call(user,path,{data,book=1,session=sessions[user],assertion=jwt[user]}={}){
  const headers={};if(assertion)headers['Cf-Access-Jwt-Assertion']=assertion;
  if(session)Object.assign(headers,session);
  headers['X-Ledger-Book']=String(book);
  if(data!==undefined)Object.assign(headers,{'Content-Type':'application/json','X-Ledger-Request':'1',Origin:'https://ledger.example'});
  return worker.fetch(new Request('https://ledger.example'+path,{method:data===undefined?'GET':'POST',headers,...(data===undefined?{}:{body:JSON.stringify(data)})}),env);
 }
 async function login(user){const result=await call(user,'/api/auth/login',{data:{},session:null});assert.equal(result.status,200,await result.clone().text());const value=await result.json();return {Cookie:result.headers.get('set-cookie').split(';')[0],'X-Ledger-Session':value.accessToken};}
 const state='/api/state?today=2026-10-18&month=2026-10&all=1';
 await t.test('fresh anonymous visit, spoofed email, expired/wrong-audience tokens fail closed',async()=>{
  assert.equal((await call(null,state,{assertion:null})).status,401);
  const status=await (await call(null,'/api/auth/status',{assertion:null})).json();assert.equal(status.authenticated,false);assert.equal(status.user,undefined);
  for(const extra of [{exp:1},{aud:['another-app']},{iss:'https://evil.example'},{nbf:Math.floor(Date.now()/1000)+1000}])assert.equal((await call('alice',state,{assertion:await provider.jwt('alice',extra)})).status,401);
  const forged=jwt.alice.split('.');forged[1]=Buffer.from(JSON.stringify({iss:provider.issuer,aud:[provider.aud],sub:'bob',email:'bob@example.com',iat:0,exp:9999999999})).toString('base64url');
  assert.equal((await call('bob',state,{assertion:forged.join('.')})).status,401);
  const spoof=new Request('https://ledger.example/api/books',{headers:{'Cf-Access-Authenticated-User-Email':'alice@example.com'}});assert.equal((await worker.fetch(spoof,env)).status,401);
 });
 await t.test('Bob visits first and receives no existing ledger or migration',async()=>{
  sessions.bob=await login('bob');const list=await (await call('bob','/api/books')).json();assert.deepEqual(list.books,[]);assert.equal(list.defaultBookId,null);
  assert.equal((await call('bob',state)).status,404);
  for(const path of ['/api/export?allBooks=1','/api/book/security'])assert.equal((await call('bob',path)).status,404);
  assert.equal((await call('bob','/api/sql',{data:{code:'SELECT * FROM jilu'}})).status,404);
  const name=ledger.sqlite.prepare('SELECT name FROM books WHERE id=1').get().name;
  const created=await call('bob','/api/books',{data:{name,requestId:crypto.randomUUID()}});assert.equal(created.status,201);const book=await created.json();assert.ok(book.id>1);sessions.bob.book=book.id;
 });
 const bobBook=sessions.bob.book;delete sessions.bob.book;
 await t.test('only configured identity migrates old ledgers; old password is preserved',async()=>{
  sessions.alice=await login('alice');const list=await (await call('alice','/api/books')).json();assert.equal(list.books.length,1);assert.equal(list.books[0].id,1);assert.equal(list.books[0].locked,true);
  assert.equal((await call('alice',state)).status,423);
  assert.equal((await call('alice','/api/export?allBooks=1')).status,423);
  assert.equal((await call('alice','/api/sql',{data:{code:'SELECT * FROM jilu'}})).status,423);
  assert.equal((await call('alice','/api/book/unlock',{data:{proof:'0'.repeat(64)}})).status,403);
  assert.equal((await call('alice','/api/book/unlock',{data:{proof:await cloudPasswordProof('legacy-password',salt)}})).status,200);
  const result=await (await call('alice',state)).json();assert.equal(result.rows[0].note,'ALICE PRIVATE');assert.deepEqual(result.books.map(b=>b.id),[1]);
 });
 await t.test('all read/write/SQL/export/security routes enforce ownership',async()=>{
  for(const [user,book] of [['alice',bobBook],['bob',1]]){
   for(const path of [state,'/api/export','/api/export?allBooks=1','/api/book/security'])assert.equal((await call(user,path,{book})).status,404);
   for(const path of ['/api/entries','/api/entries/1','/api/sql','/api/book/unlock','/api/book/lock','/api/book/security'])assert.equal((await call(user,path,{book,data:{code:'SELECT * FROM jilu',enabled:false}})).status,404);
  }
  assert.equal((await call('bob',state,{session:sessions.alice})).status,401);
  assert.equal((await call('alice',state,{assertion:null})).status,401);
  const exported=await (await call('bob','/api/export?allBooks=1',{book:bobBook})).json();assert.deepEqual(exported.books.map(b=>b.id),[bobBook]);
 });
 await t.test('SQL queries stay within selected owned ledger',{skip:!await import('node-sql-parser/build/sqlite.js').then(()=>true,()=>false)},async()=>{
  const sql=await call('bob','/api/sql',{book:bobBook,data:{code:'SELECT * FROM jilu'}});assert.equal(sql.status,200);assert.deepEqual((await sql.json()).recordsets[0].rows,[]);
  assert.equal((await call('bob','/api/sql',{book:bobBook,data:{code:'SELECT * FROM account_books'}})).status,400);
 });
 await t.test('password change invalidates all other unlocks; locking and disabling work',async()=>{
  const second=await login('alice');await call('alice','/api/book/unlock',{session:second,data:{proof:await cloudPasswordProof('legacy-password',salt)}});
  const next=await newCloudPassword('private-123');
  assert.equal((await call('alice','/api/book/security',{data:{enabled:true,currentProof:await cloudPasswordProof('legacy-password',salt),newSalt:next.salt,newProof:next.proof}})).status,200);
  assert.equal((await call('alice',state,{session:second})).status,423);
  assert.equal((await call('alice',state)).status,200);
  await call('alice','/api/book/lock',{data:{}});assert.equal((await call('alice',state)).status,423);
  await call('alice','/api/book/unlock',{data:{proof:next.proof}});assert.equal((await call('alice',state)).status,200);
  assert.equal((await call('alice','/api/book/security',{data:{enabled:false,currentProof:'0'.repeat(64)}})).status,403);
  assert.equal((await call('alice','/api/book/security',{data:{enabled:false,currentProof:next.proof}})).status,200);
  assert.equal((await call('alice',state,{session:second})).status,200);
 });
 await t.test('logout revokes replay and new login cannot retain a book unlock',async()=>{
  const next=await newCloudPassword('new-pass');await call('alice','/api/book/security',{data:{enabled:true,newSalt:next.salt,newProof:next.proof}});
  const old={...sessions.alice};assert.equal((await call('alice','/api/auth/logout',{data:{}})).status,200);
  assert.equal((await call('alice',state,{session:old})).status,401);
  sessions.alice=await login('alice');assert.equal((await call('alice',state)).status,423);
 });
 await t.test('password attempts are throttled and do not affect another account',async()=>{
  for(let i=0;i<5;i++)assert.equal((await call('alice','/api/book/unlock',{data:{proof:'0'.repeat(64)}})).status,403);
  assert.equal((await call('alice','/api/book/unlock',{data:{proof:'0'.repeat(64)}})).status,429);
  assert.equal((await call('bob',state,{book:bobBook})).status,200);
 });
 await t.test('create retries are identity-scoped and cannot claim another account book',async()=>{
  const requestId=crypto.randomUUID();const first=await (await call('alice','/api/books',{data:{name:'Shared name',requestId}})).json();
  const again=await (await call('alice','/api/books',{data:{name:'Shared name',requestId}})).json();assert.equal(first.id,again.id);
  const bob=await (await call('bob','/api/books',{data:{name:'Shared name',requestId}})).json();assert.notEqual(bob.id,first.id);
  assert.equal((await call('bob',state,{book:first.id})).status,404);
  // An unlocked second ledger cannot be used to export another locked ledger.
  assert.equal((await call('alice','/api/export?allBooks=1',{book:first.id})).status,423);
 });
});
