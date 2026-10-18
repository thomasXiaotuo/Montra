import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {publishCloud,ensureCloudSubdomain} from '../scripts/publish-cloud.mjs';
import {startCloudSetup} from '../scripts/cloud-setup.mjs';
import {normalizeRows} from '../cloud/migration.mjs';

test('cloud publishing logs in, creates only D1 resources, verifies migration and never reimports on update',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'montra-cloud-publish-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const calls=[],databases=[];let loggedIn=false,hasPassword=false,remoteRows=[],reads=0;
  const source=[{id:1,riqi:'2026-10-16',type:'e',amount:'12.34',category:'  eat',note:"O'Brien'); DROP TABLE jilu; --"}];
  const run=async args=>{
    calls.push(args);
    if(args[0]==='whoami'){if(!loggedIn)throw new Error('Needs login.');return JSON.stringify({accounts:[{id:'test-account',name:'Test'}]});}
    if(args[0]==='login'){loggedIn=true;return '';}
    if(args[0]==='d1'&&args[1]==='list')return JSON.stringify(databases);
    if(args[0]==='d1'&&args[1]==='create'){databases.push({name:args[2],uuid:'00000000-0000-4000-8000-'+String(databases.length+1).padStart(12,'0')});return '';}
    if(args[0]==='d1'&&args[1]==='execute'){
      if(args.includes('--command')){
        const query=args[args.indexOf('--command')+1];
        if(query.startsWith('PRAGMA'))return JSON.stringify([{results:[{name:'proof_version'},{name:'book_id'}]}]);
        if(query.includes('WHERE proof_version=1'))return JSON.stringify([{results:[]}]);
        return JSON.stringify([{results:query.includes('access_settings')?(hasPassword?[{id:1}]:[]):remoteRows}]);
      }
      const file=args[args.indexOf('--file')+1];
      if(file.endsWith('cloud-auth-bootstrap.sql')){hasPassword=true;const sql=await readFile(file,'utf8');assert.ok(!sql.includes('ab56'));}
      if(file.endsWith('ledger-import.sql')){const sql=await readFile(file,'utf8');assert.ok(sql.includes("O''Brien''"));remoteRows=normalizeRows(source);}
      return '';
    }
    if(args[0]==='deploy')return 'Published https://montra-test.example.workers.dev';
    throw new Error('Unexpected operation: '+args[0]);
  };
  const ensureSubdomain=async()=> 'montra-test';
  const verify=async url=>{assert.equal(url,'https://montra-test.example.workers.dev');};
  const first=await publishCloud({password:'ab56',directory,run,ensureSubdomain,verify,readRows:async()=>{reads++;return source;}});
  assert.equal(first.importedRows,1);assert.equal(reads,1);assert.equal(databases.length,2);
  assert.ok(calls.every(args=>['whoami','login','d1','deploy'].includes(args[0])));
  const snapshot=JSON.parse(await readFile(join(directory,'cloud-migration/ledger.json'),'utf8'));assert.deepEqual(snapshot.rows,source);
  const config=JSON.parse(await readFile(join(directory,'wrangler.cloud.json'),'utf8'));assert.equal(config.account_id,'test-account');assert.equal(config.d1_databases.length,2);assert.equal(config.assets.run_worker_first,true);
  const imports=calls.filter(args=>args.some(a=>a.endsWith('ledger-import.sql'))).length;
  remoteRows[0].note='Changed after first publish';
  await publishCloud({directory,run,ensureSubdomain,verify,readRows:async()=>{throw new Error('Must not reread local ledger on update.');}});
  assert.equal(calls.filter(args=>args.some(a=>a.endsWith('ledger-import.sql'))).length,imports);
  assert.equal(remoteRows[0].note,'Changed after first publish');
});

test('publishing automatically registers a unique free subdomain, preserving an existing one',async()=>{
  const calls=[];
  const run=async args=>{assert.deepEqual(args,['auth','token','--json']);return JSON.stringify({type:'oauth',token:'test-token'});};
  const request=async(url,options)=>{calls.push({url,options});return {json:async()=>options.method==='PUT'?{success:true,result:{subdomain:'montra-unique'}}:{success:false,errors:[{code:10007}]}};};
  assert.equal(await ensureCloudSubdomain({run,accountId:'test-account',suffix:'unique',request}),'montra-unique');
  assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].options.body).subdomain,'montra-unique');
  assert.equal(await ensureCloudSubdomain({run,accountId:'test-account',suffix:'unique',request:async()=>({json:async()=>({success:true,result:{subdomain:'existing'}})})}),'existing');
});

test('local setup rejects cross-site submission and duplicate publishing; simple password choice stays local',async t=>{
  let release,received;
  const setup=await startCloudSetup({initialState:{},browser:false,publish:async data=>{received=data.password;await new Promise(resolve=>{release=resolve;});return {url:'https://montra-test.example.workers.dev',importedRows:46};}});
  t.after(()=>setup.close());
  const status=await fetch(setup.url+'/api/status').then(r=>r.json());
  const post=(extra={},data={password:'abcd',confirm:'abcd'})=>fetch(setup.url+'/api/publish',{method:'POST',headers:{'Content-Type':'application/json',Origin:setup.url,'X-Setup-Token':status.nonce,...extra},body:JSON.stringify(data)});
  assert.equal((await post({Origin:'https://evil.example'})).status,403);
  assert.equal((await post({'X-Setup-Token':'wrong'})).status,403);
  assert.equal((await post({}, {password:'abc',confirm:'abc'})).status,400);
  assert.equal((await post()).status,200);assert.equal(received,'abcd');
  assert.equal((await post()).status,409);
  assert.equal((await fetch(setup.url+'/api/status').then(r=>r.json())).stage,'publishing');
  release();await new Promise(resolve=>setTimeout(resolve,10));
  const done=await fetch(setup.url+'/api/status').then(r=>r.json());assert.equal(done.stage,'done');assert.equal(done.importedRows,46);
  assert.ok(!JSON.stringify(done).includes('abcd'));
});
