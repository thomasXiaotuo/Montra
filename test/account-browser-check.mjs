import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {LocalD1,testIdentityProvider} from './account-support.mjs';
import worker from '../cloud/worker.mjs';
import {passwordHash} from '../cloud/auth.mjs';
const playwright=process.env.MONTRA_PLAYWRIGHT_MODULE?await import(pathToFileURL(process.env.MONTRA_PLAYWRIGHT_MODULE)):await import('@playwright/test');
const provider=await testIdentityProvider(),nativeFetch=global.fetch;
global.fetch=async(url,...args)=>String(url)===provider.issuer+'/cdn-cgi/access/certs'?Response.json({keys:[provider.jwk]}):nativeFetch(url,...args);
const auth=new LocalD1(),ledger=new LocalD1();
await auth.schema('../cloud/auth-schema.sql');await auth.schema('../cloud/account-schema.sql');
await ledger.schema('../cloud/ledger-schema.sql');await ledger.schema('../cloud/account-ledger-migration.sql');
const salt='12345678901234567890123456789012';
await auth.prepare('INSERT INTO access_settings(id,salt,password_hash) VALUES(1,?,?)').bind(salt,await passwordHash('legacy-password',salt)).run();
await ledger.prepare("INSERT INTO jilu(riqi,type,amount,category,note) VALUES('2026-10-18','i',100,'salary','ALICE SECRET')").run();
const tokens={alice:await provider.jwt(),bob:await provider.jwt('bob')};
const env={AUTH_DB:auth,LEDGER_DB:ledger,ACCESS_ISSUER:provider.issuer,ACCESS_AUD:provider.aud,LEGACY_OWNER_ID:provider.issuer+'|alice',LEGACY_MAX_BOOK_ID:'1',ASSETS:{async fetch(req){const path=new URL(req.url).pathname;const file=path==='/'?'index.html':path.slice(1);return new Response(await readFile(new URL('../public/'+file,import.meta.url)),{headers:{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}});}}};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/cdn-cgi/access/logout'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<h1>Cloudflare signed out</h1>');return;}
  if(req.url==='/cdn-cgi/access/login'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<h1>Cloudflare official login</h1>');return;}
  const headers=new Headers(req.headers),user=headers.get('x-test-identity');headers.delete('x-test-identity');if(tokens[user])headers.set('Cf-Access-Jwt-Assertion',tokens[user]);
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await worker.fetch(new Request('http://127.0.0.1:3225'+req.url,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(r=>server.listen(3225,'127.0.0.1',r));let browser;
try{
 browser=await playwright.chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const errors=[];
 const alice=await browser.newContext({extraHTTPHeaders:{'X-Test-Identity':'alice'},locale:'zh-CN'}),bob=await browser.newContext({extraHTTPHeaders:{'X-Test-Identity':'bob'},viewport:{width:390,height:844},locale:'zh-CN'}),anonymous=await browser.newContext();
 const a=await alice.newPage(),b=await bob.newPage(),n=await anonymous.newPage();
 for(const page of [a,b,n])page.on('pageerror',error=>errors.push(error.message));
 await n.goto('http://127.0.0.1:3225');await n.waitForSelector('#auth-dialog[open]');assert.equal(await n.locator('body').evaluate(el=>el.classList.contains('locked')),true);assert.equal(await n.locator('#records').textContent(),'');
 await n.click('#auth-submit');await n.waitForURL('**/cdn-cgi/access/login');
 await b.goto('http://127.0.0.1:3225');await b.waitForFunction(()=>document.getElementById('auth-submit').textContent.includes('Cloudflare'));await b.click('#auth-submit');
 await b.waitForSelector('#account-onboarding:not([hidden])');assert.equal(await b.locator('#book-select option').count(),0);assert.equal(await b.locator('#add-book').isEnabled(),true);
 await b.click('#add-book');await b.fill('#book-name','Bob private');await b.click('#book-save');await b.waitForFunction(()=>document.getElementById('book-select').selectedOptions[0]?.text==='Bob private');
 await b.waitForFunction(()=>document.getElementById('connection').className==='connection');
 await b.fill('#amount','12.34');await b.fill('#category','eat');await b.fill('#note','BOB SECRET');await b.click('#save');await b.waitForFunction(()=>document.getElementById('records').textContent.includes('BOB SECRET'));
 await a.goto('http://127.0.0.1:3225');await a.waitForFunction(()=>document.getElementById('auth-submit').textContent.includes('Cloudflare'));await a.click('#auth-submit');await a.waitForSelector('#book-unlock-dialog[open]');
 assert.equal(await a.locator('#records').textContent(),'');assert.equal(await a.locator('#income').textContent(),'—');
 await a.fill('#book-unlock-password','wrong');await a.click('#book-unlock-submit');await a.waitForFunction(()=>document.getElementById('book-unlock-message').textContent.includes('Incorrect'));
 await a.fill('#book-unlock-password','legacy-password');await a.click('#book-unlock-submit');await a.waitForFunction(()=>document.getElementById('records').textContent.includes('ALICE SECRET'));
 assert.equal((await a.locator('#records').textContent()).includes('BOB SECRET'),false);
 assert.equal((await b.locator('#records').textContent()).includes('ALICE SECRET'),false);
 await a.click('#cloud-settings summary');await a.click('#change-password');await a.fill('#current-password','legacy-password');await a.fill('#new-password','alice-new');await a.fill('#confirm-password','alice-new');await a.click('#password-save');await a.waitForFunction(()=>!document.getElementById('password-dialog').open);
 await a.click('#lock-book');await a.waitForSelector('#book-unlock-dialog[open]');assert.equal(await a.locator('#records').textContent(),'');
 await a.fill('#book-unlock-password','alice-new');await a.click('#book-unlock-submit');await a.waitForFunction(()=>document.getElementById('records').textContent.includes('ALICE SECRET'));
 await a.click('#cloud-settings summary');await a.click('#lock');await a.waitForURL('**/cdn-cgi/access/logout');
 await a.goto('http://127.0.0.1:3225');await a.waitForSelector('#auth-dialog[open]');assert.equal(await a.locator('#records').textContent(),'');
 await a.click('#auth-submit');await a.waitForSelector('#book-unlock-dialog[open]');assert.equal(await a.locator('#records').textContent(),'');
 assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: anonymous login, new-account onboarding, mobile creation, independent ledgers, password change, lock, logout, and locked re-login.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));global.fetch=nativeFetch;}
