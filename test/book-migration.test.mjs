import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const {getPlatformProxy}=await import('wrangler').catch(()=>({}));
import {publishCloud} from '../scripts/publish-cloud.mjs';
import {writePrivate} from '../private-store.mjs';
import {normalizeRows} from '../cloud/migration.mjs';
import {cloudBooks} from '../cloud/books.mjs';
import {cloudDatabase} from '../cloud/database.mjs';

test('upgrading a legacy cloud database backs up every entry before ALTER, preserves IDs and keeps later ledgers on republish',{skip:!getPlatformProxy},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'montra-book-migration-'));
  const proxy=await getPlatformProxy({configPath:new URL('../cloud/wrangler.jsonc',import.meta.url).pathname,persist:false});
  t.after(async()=>{await proxy.dispose();await rm(directory,{recursive:true,force:true});});
  const db=proxy.env.LEDGER_DB;
  const current=await readFile(new URL('../cloud/ledger-schema.sql',import.meta.url),'utf8');
  const old=('CREATE TABLE IF NOT EXISTS jilu'+current.split('CREATE TABLE IF NOT EXISTS jilu')[1]).replace(/,\n  book_id INTEGER[^\n]+/,'');
  await db.batch(old.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
  await db.prepare('INSERT INTO jilu(id,riqi,type,amount,category,note) VALUES(?,?,?,?,?,?)').bind(7,'2026-10-16','e',0.29,"O'Brien",'  preserve spaces  ').run();
  await db.prepare('INSERT INTO jilu(id,riqi,type,amount,category,note) VALUES(?,?,?,?,?,?)').bind(19,'2026-09-30','i',100.01,'salary',null).run();
  const original=normalizeRows((await db.prepare('SELECT id,riqi,type,amount,category,note FROM jilu ORDER BY id').all()).results);
  writePrivate('cloud-deployment.json',{suffix:'migration-test',accountId:'test',workerName:'montra-test',ledger:{name:'test-ledger',id:'ledger-id'},access:{name:'test-auth',id:'auth-id'},authInitialized:true,imported:true,importedRows:2},directory);
  let alters=0;
  const run=async args=>{
    if(args[0]==='whoami')return JSON.stringify({accounts:[{id:'test'}]});
    if(args[0]==='deploy')return 'https://montra-test.montra-test.workers.dev';
    assert.deepEqual(args.slice(0,2),['d1','execute']);const target=args[2]==='LEDGER_DB'?db:proxy.env.AUTH_DB;
    if(args.includes('--file')){
      const sql=await readFile(args[args.indexOf('--file')+1],'utf8');await target.batch(sql.split(';').filter(s=>s.trim()).map(s=>target.prepare(s)));return '';
    }
    const sql=args[args.indexOf('--command')+1];
    if(sql.startsWith('ALTER TABLE jilu')){
      const files=(await readdir(directory)).filter(s=>s.startsWith('cloud-before-books-'));assert.equal(files.length,1);
      assert.deepEqual(JSON.parse(await readFile(join(directory,files[0]),'utf8')).rows,original);alters++;
    }
    const result=await target.prepare(sql).all();return JSON.stringify([{results:result.results}]);
  };
  const options={directory,run,ensureSubdomain:async()=> 'montra-test',verify:async()=>{},readRows:async()=>{throw new Error('Must not import local data over existing cloud records.');}};
  await publishCloud(options);assert.equal(alters,1);
  assert.deepEqual(await cloudDatabase(db).exportRows(),original);
  assert.ok((await db.prepare('SELECT book_id FROM jilu').all()).results.every(row=>row.book_id===1));
  const added=await cloudBooks(db).create({name:'旅行',requestId:randomUUID()});
  await cloudDatabase(db,added.id).insertEntry({riqi:'2026-10-16',type:'e',amount:'2.34',category:'travel',note:'Preserve on update'});
  await publishCloud(options);assert.equal(alters,1);assert.equal((await cloudBooks(db).list()).length,2);
  assert.deepEqual(await cloudDatabase(db).exportRows(),original);
  assert.equal((await cloudDatabase(db,added.id).exportRows())[0].note,'Preserve on update');
});
