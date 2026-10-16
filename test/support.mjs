import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAuth} from '../auth.mjs';
import {createApp} from '../server.mjs';
export const TEST_PASSWORD='Montra test password 2026!';
let auth;
export function testAuth(){
  if(!auth){
    const directory=mkdtempSync(join(tmpdir(),'montra-auth-test-'));
    process.once('exit',()=>rmSync(directory,{recursive:true,force:true}));
    auth=createAuth({directory,initialPassword:TEST_PASSWORD});
  }
  return auth;
}
export function createTestApp(deps,port){return createApp(deps,port,testAuth());}
export async function testLogin(root){
  const response=await fetch(`${root}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify({password:TEST_PASSWORD})});
  if(response.status!==200)throw new Error('Test login failed');
  return {Cookie:response.headers.get('set-cookie').split(';')[0],'X-Ledger-Session':(await response.json()).accessToken};
}
export async function browserLogin(page){
  await page.waitForSelector('#auth-dialog[open]');await page.fill('#access-password',TEST_PASSWORD);await page.click('#auth-submit');
  await page.waitForFunction(()=>!document.getElementById('auth-dialog').open);
}
