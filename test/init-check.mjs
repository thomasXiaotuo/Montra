// Creates and removes only a uniquely named empty test database; never touches jizhang.
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import sql from 'mssql';
import {connectionConfig} from '../database.mjs';
const name=`montra_test_${randomBytes(6).toString('hex')}`;
const config=await connectionConfig();
const admin=new sql.ConnectionPool({...config,database:'master'});
await admin.connect();
try {
  const {recordset}=await admin.request().input('name',sql.NVarChar(128),name).query('SELECT DB_ID(@name) AS db_id');
  assert.equal(recordset[0].db_id,null);
  const run=()=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/init-db.mjs',import.meta.url))],{env:{...process.env,SQL_DATABASE:name}});
  await run();await run();
  const pool=new sql.ConnectionPool({...config,database:name});await pool.connect();
  try {
    const result=await pool.request().query('SELECT COUNT(*) AS count FROM dbo.jilu; SELECT COUNT(*) AS columns FROM sys.columns WHERE object_id=OBJECT_ID(N\'dbo.jilu\');');
    assert.equal(result.recordsets[0][0].count,0);assert.equal(result.recordsets[1][0].columns,6);
  }finally{await pool.close();}
  console.log('PASS: clean database initialization, six-column schema, repeat initialization preserves existing table.');
}finally{
  // Name is generated above, consists only of a fixed prefix and random hexadecimal digits.
  await admin.request().query(`IF DB_ID(N'${name}') IS NOT NULL DROP DATABASE [${name}];`);
  await admin.close();
}
