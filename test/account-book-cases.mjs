import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from './account-support.mjs';
import {cloudBooks} from '../cloud/books.mjs';
test('book metadata validates input, preserves retries and supports same names across accounts',async()=>{
 const db=new LocalD1();await db.schema('../cloud/ledger-schema.sql');await db.schema('../cloud/account-ledger-migration.sql');
 const books=cloudBooks(db),requestId=crypto.randomUUID();
 const first=await books.create({name:'Daily',requestId});assert.equal((await books.create({name:'Daily',requestId})).id,first.id);
 await assert.rejects(books.create({name:'Different',requestId}),e=>e.status===409);
 for(const name of ['', ' '.repeat(5),'x'.repeat(41),'wrong\nname'])await assert.rejects(books.create({name,requestId:crypto.randomUUID()}),e=>e.status===400);
 const second=await books.create({name:'Daily',requestId:crypto.randomUUID()});assert.notEqual(first.id,second.id);
 await assert.rejects(books.get(9999),e=>e.status===404);
});
test('account ledger migration preserves every ledger ID and record',async()=>{
 const db=new LocalD1();await db.schema('../cloud/ledger-schema.sql');
 await db.prepare("INSERT INTO books(id,name) VALUES(7,'Travel')").run();
 await db.prepare("INSERT INTO jilu(id,riqi,type,amount,category,note,book_id) VALUES(19,'2026-10-18','e',0.29,'eat',NULL,7)").run();
 const before=(await db.prepare('SELECT * FROM jilu').all()).results;await db.schema('../cloud/account-ledger-migration.sql');
 assert.deepEqual((await db.prepare('SELECT * FROM jilu').all()).results,before);assert.equal((await cloudBooks(db).get(7)).name,'Travel');
});
