import sql from 'mssql';
import {connectionConfig} from '../database.mjs';
import {loadEnvironment} from '../runtime.mjs';
loadEnvironment();
const config=await connectionConfig();
const name=config.database;
if(!name || name.length>128)throw new Error('SQL_DATABASE 名称无效。');
const master=new sql.ConnectionPool({...config,database:'master'});
try{
  await master.connect();
  await master.request().input('name',sql.NVarChar(128),name).query(`IF DB_ID(@name) IS NULL BEGIN DECLARE @statement nvarchar(300) = N'CREATE DATABASE ' + QUOTENAME(@name); EXEC(@statement); END`);
}finally{await master.close();}
const pool=new sql.ConnectionPool(config);
try{
  await pool.connect();
  await pool.request().query(`IF OBJECT_ID(N'dbo.jilu',N'U') IS NULL
  CREATE TABLE dbo.jilu (
    id INT IDENTITY(1,1) PRIMARY KEY,
    riqi DATE NOT NULL,
    type VARCHAR(1) NOT NULL CHECK (type IN ('i','e')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    category NVARCHAR(50) NOT NULL,
    note NVARCHAR(200)
  );`);
  console.log('数据库和 jilu 表已准备好。已有数据库、表和账单保持不变。');
}finally{await pool.close();}
