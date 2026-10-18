import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
export class LocalD1 {
 constructor(){this.sqlite=new DatabaseSync(':memory:');}
 prepare(sql){const db=this.sqlite;let values=[];const make=()=>db.prepare(sql);return {
  bind(...v){values=v;return this;},
  async first(){return make().get(...values)||null;},
  async all(){const stmt=make();return {results:stmt.all(...values),meta:{changes:Number(db.prepare('SELECT changes() AS n').get().n)}};},
  async run(){const result=make().run(...values);return {meta:{changes:Number(result.changes)}};},
  async raw({columnNames=false}={}){const stmt=make();const cols=stmt.columns().map(c=>c.name);stmt.setReturnArrays(true);const rows=stmt.all(...values);return columnNames?[cols,...rows]:rows;}
 };}
 async batch(statements){this.sqlite.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await stmt.all());this.sqlite.exec('COMMIT');return result;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 async schema(path){this.sqlite.exec(await readFile(new URL(path,import.meta.url),'utf8'));}
}
export async function testIdentityProvider(){
 const issuer='https://montra-testing.cloudflareaccess.com',aud='test-application';
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test-key'};
 const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
 return {issuer,aud,jwk,async jwt(sub='alice',extra={}){const now=Math.floor(Date.now()/1000);const claims={iss:issuer,aud:[aud],sub,email:sub+'@example.com',iat:now,exp:now+3600,...extra};const head=encode({alg:'RS256',kid:'test-key'}),body=encode(claims),sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(head+'.'+body));return head+'.'+body+'.'+Buffer.from(sig).toString('base64url');}};
}
