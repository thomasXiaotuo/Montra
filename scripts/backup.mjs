import {loadEnvironment} from '../runtime.mjs';
import {getPool} from '../database.mjs';
import {writePrivate,privateDirectory} from '../private-store.mjs';
import {join} from 'node:path';
loadEnvironment();
let pool;
try{
  pool=await getPool();
  const rows=(await pool.request().query('SELECT id,CONVERT(char(10),riqi,23) AS riqi,type,CONVERT(varchar(30),amount) AS amount,category,note FROM dbo.jilu ORDER BY id')).recordset;
  const file=writePrivate(`ledger-${Date.now()}.json`,{format:'montra-ledger-v1',database:process.env.SQL_DATABASE||'jizhang',createdAt:new Date().toISOString(),rows},join(privateDirectory,'backups'));
  console.log(`Ledger backup saved / 账单备份已保存：${file}`);
}catch(error){console.error('Backup failed / 备份失败：'+error.message);process.exitCode=1;}
finally{if(pool)await pool.close();}
