import assert from 'node:assert/strict';
import sql from 'mssql';
import {connectionConfig,getPool,updateEntry} from '../database.mjs';
const admin=await new sql.ConnectionPool({...await connectionConfig(),database:'master'}).connect();
const name='montra_edit_test_'+Date.now();let pool;
try{
 await admin.request().query(`CREATE DATABASE [${name}]`);
 process.env.SQL_DATABASE=name;
 const setup=await new sql.ConnectionPool(await connectionConfig()).connect();
 try{await setup.request().query("CREATE TABLE dbo.jilu(id int IDENTITY PRIMARY KEY,riqi date NOT NULL,type varchar(1) NOT NULL,amount decimal(10,2) NOT NULL,category nvarchar(50) NOT NULL,note nvarchar(200) NULL); INSERT dbo.jilu VALUES ('2026-10-15','e',12.34,N'eat',NULL),('2026-10-14','i',100,N'salary',N'untouched');");}finally{await setup.close();}
 pool=await getPool();
 const old={riqi:'2026-10-15',type:'e',amount:'12.34',category:'eat',note:null};
 const changed={riqi:'2026-09-30',type:'i',amount:'99999999.99',category:"O'Brien / 餐饮",note:'Edited'};
 assert.equal((await updateEntry(1,changed,old)).id,1);
 await assert.rejects(updateEntry(1,old,old),e=>e.status===409);
 await assert.rejects(updateEntry(999,old,old),e=>e.status===409);
 const rows=(await pool.request().query('SELECT * FROM dbo.jilu ORDER BY id')).recordset;
 assert.equal(rows.length,2);assert.equal(rows[0].category,changed.category);assert.equal(rows[0].amount,99999999.99);assert.equal(rows[1].note,'untouched');
 await updateEntry(1,{...changed,note:null},changed);
 assert.equal((await pool.request().query('SELECT note FROM dbo.jilu WHERE id=1')).recordset[0].note,null);
 console.log('PASS: isolated SQL database: update, unchanged ID and row count, decimal maximum, Unicode, NULL note, stale/deleted conflict, untouched other row.');
}finally{if(pool)await pool.close();await admin.request().query(`ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}];`);await admin.close();}
