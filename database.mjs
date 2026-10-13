import sql from 'mssql';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { literalSearch, UserError } from './domain.mjs';
import {splitBatches,runSql} from './sql-console.mjs';
const exec = promisify(execFile);
let poolPromise;
let enteredPassword;
const docker = existsSync(`${homedir()}/.docker/bin/docker`) ? `${homedir()}/.docker/bin/docker` : 'docker';
async function password() {
  if (enteredPassword) return enteredPassword;
  if (process.env.SQL_PASSWORD) return process.env.SQL_PASSWORD;
  try {
    const {stdout} = await exec(docker, ['inspect','--format','{{json .Config.Env}}',process.env.SQL_CONTAINER || 'sqlserver'], { timeout: 5000, maxBuffer: 65536 });
    const env = JSON.parse(stdout);
    const entry = env.find(v => v.startsWith('MSSQL_SA_PASSWORD='));
    if (entry) return entry.slice('MSSQL_SA_PASSWORD='.length);
  } catch {}
  throw new UserError('无法连接数据库。请打开 Docker Desktop，并启动 sqlserver 容器。也可以在下方输入数据库密码重试。', 503);
}
export async function connectionConfig() {
  return {server:process.env.SQL_SERVER || '127.0.0.1',port:Number(process.env.SQL_PORT || 1433),user:process.env.SQL_USER || 'sa',password:await password(),database:process.env.SQL_DATABASE || 'jizhang',connectionTimeout:7000,requestTimeout:10000,options:{encrypt:true,trustServerCertificate:true,useUTC:true},pool:{max:5,min:0,idleTimeoutMillis:30000}};
}
export async function getPool() {
  if (!poolPromise) poolPromise = (async () => {
    const pool = new sql.ConnectionPool(await connectionConfig());
    pool.on('error', () => { poolPromise = undefined; });
    await pool.connect();
    const found = await pool.request().query("SELECT OBJECT_ID(N'dbo.jilu', N'U') AS table_id");
    if (!found.recordset[0]?.table_id) { await pool.close(); throw new UserError('已连接 jizhang，但找不到 dbo.jilu 表。请确认连接的是之前的记账数据库。', 503); }
    return pool;
  })().catch(error => { poolPromise = undefined; throw error; });
  return poolPromise;
}
export async function setPassword(value) {
  if (typeof value !== 'string' || !value || value.length > 128) throw new UserError('请输入数据库密码。');
  if (poolPromise) { try { await (await poolPromise).close(); } catch {} }
  poolPromise = undefined; enteredPassword = value;
  await getPool();
}
export async function readState(f) {
  const pool = await getPool();
  const r = pool.request()
    .input('start',sql.VarChar(10),f.start).input('end',sql.VarChar(10),f.end)
    .input('today',sql.VarChar(10),f.today).input('type',sql.VarChar(1),f.type)
    .input('category',sql.NVarChar(50),f.category).input('q',sql.NVarChar(402),literalSearch(f.q))
    .input('all',sql.Bit,f.all).input('offset',sql.Int,(f.page-1)*50);
  const result = await r.query(`
    SELECT CONVERT(varchar(50), COALESCE(SUM(CASE WHEN type='i' THEN amount ELSE 0 END),0)) AS income,
           CONVERT(varchar(50), COALESCE(SUM(CASE WHEN type='e' THEN amount ELSE 0 END),0)) AS expense,
           CONVERT(varchar(50), COALESCE(SUM(CASE WHEN type='i' THEN amount WHEN type='e' THEN -amount ELSE 0 END),0)) AS net
    FROM dbo.jilu WHERE riqi >= CONVERT(date,@start) AND riqi < CONVERT(date,@end) AND riqi <= CONVERT(date,@today);
    SELECT CONVERT(varchar(50), COALESCE(SUM(CASE WHEN type='i' THEN amount WHEN type='e' THEN -amount ELSE 0 END),0)) AS net
    FROM dbo.jilu WHERE riqi <= CONVERT(date,@today);
    SELECT DISTINCT category FROM dbo.jilu ORDER BY category;
    SELECT category, CONVERT(varchar(50),SUM(amount)) AS amount FROM dbo.jilu
    WHERE type='e' AND riqi >= CONVERT(date,@start) AND riqi < CONVERT(date,@end) AND riqi <= CONVERT(date,@today)
    GROUP BY category ORDER BY SUM(amount) DESC;
    SELECT id,CONVERT(char(10),riqi,23) AS riqi,type,CONVERT(varchar(30),amount) AS amount,category,note,
           COUNT(*) OVER() AS total_count
    FROM dbo.jilu WHERE (@all=1 OR (riqi >= CONVERT(date,@start) AND riqi < CONVERT(date,@end)))
    AND (@type='' OR type=@type) AND (@category='' OR category=@category)
    AND (category LIKE @q ESCAPE '~' OR COALESCE(note,N'') LIKE @q ESCAPE '~')
    ORDER BY riqi DESC,id DESC OFFSET @offset ROWS FETCH NEXT 50 ROWS ONLY;
  `);
  const rows = result.recordsets[4];
  return {database:process.env.SQL_DATABASE || 'jizhang',summary:result.recordsets[0][0], allNet:result.recordsets[1][0].net,
    categories:result.recordsets[2].map(r=>r.category),breakdown:result.recordsets[3],
    rows,total:rows[0]?.total_count ?? 0,page:f.page,month:f.month,updatedAt:new Date().toISOString()};
}
export async function insertEntry(entry) {
  const pool = await getPool();
  const result = await pool.request().input('date',sql.VarChar(10),entry.riqi)
    .input('type',sql.VarChar(1),entry.type).input('amount',sql.Decimal(10,2),Number(entry.amount))
    .input('category',sql.NVarChar(50),entry.category).input('note',sql.NVarChar(200),entry.note)
    .query(`INSERT INTO dbo.jilu (riqi,type,amount,category,note)
            OUTPUT INSERTED.id VALUES (CONVERT(date,@date),@type,@amount,@category,@note);`);
  return result.recordset[0];
}

let consoleBusy = false;
export async function executeSql(code) {
  const batches = splitBatches(code);
  if (consoleBusy) throw new UserError('另一段 SQL 正在执行，请稍后再试。', 409);
  consoleBusy = true;
  let pool;
  try {
    pool = new sql.ConnectionPool({...await connectionConfig(),requestTimeout:30000,pool:{max:1,min:0,idleTimeoutMillis:1000}});
    pool.on('error',()=>{});
    await pool.connect();
    return await runSql(pool,batches);
  } finally { if (pool) await pool.close().catch(()=>{}); consoleBusy = false; }
}
