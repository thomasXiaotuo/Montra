import sql from 'mssql';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {dockerEnabled} from './runtime.mjs';
import { literalSearch, UserError } from './domain.mjs';
import {splitBatches,runSql} from './sql-console.mjs';
import {readPrivate} from './private-store.mjs';
import {assertLimited} from './database-security.mjs';
const exec = promisify(execFile);
let poolPromise;
let enteredPassword;
const localDocker = join(homedir(), '.docker', 'bin', process.platform === 'win32' ? 'docker.exe' : 'docker');
const docker = existsSync(localDocker) ? localDocker : 'docker';
async function password(user,{administrative=false,workbench=false}={}) {
  if (!administrative&&!workbench&&enteredPassword) return enteredPassword;
  if (administrative&&process.env.SQL_ADMIN_PASSWORD) return process.env.SQL_ADMIN_PASSWORD;
  if (workbench&&process.env.SQL_CONSOLE_PASSWORD) return process.env.SQL_CONSOLE_PASSWORD;
  if (!workbench&&process.env.SQL_PASSWORD) return process.env.SQL_PASSWORD;
  const local=['127.0.0.1','localhost','::1'].includes(process.env.SQL_SERVER||'127.0.0.1');
  if(!administrative||user.toLowerCase()!=='sa'||!local)throw new UserError('数据库权限不符合安全要求，请运行 npm run db:secure 配置专用账号。',503);
  if (!dockerEnabled()) throw new UserError('无法连接数据库。请确认 SQL Server 已运行并检查 .env 配置；也可以在下方输入数据库密码重试。', 503);
  try {
    const {stdout} = await exec(docker, ['inspect','--format','{{json .Config.Env}}',process.env.SQL_CONTAINER || 'sqlserver'], { timeout: 5000, maxBuffer: 65536, windowsHide: true });
    const env = JSON.parse(stdout);
    const entry = env.find(v => v.startsWith('MSSQL_SA_PASSWORD='));
    if (entry) return entry.slice('MSSQL_SA_PASSWORD='.length);
  } catch {}
  throw new UserError('无法连接数据库。请确认 SQL Server 已运行并检查 .env 配置；也可以在下方输入数据库密码重试。', 503);
}
export async function connectionConfig({administrative=false,workbench=false}={}) {
  const server=process.env.SQL_SERVER||'127.0.0.1',port=Number(process.env.SQL_PORT||1433),database=process.env.SQL_DATABASE||'jizhang';
  const saved=readPrivate('database.json');
  const matches=saved&&saved.server===server&&saved.port===port&&saved.database===database;
  let credential;
  if(!administrative&&matches){credential={...saved[workbench?'console':'app']};if(!workbench&&enteredPassword)credential.password=enteredPassword;}
  if(!credential){
    const user=administrative?(process.env.SQL_ADMIN_USER||(process.env.SQL_USER===saved?.app?.user?undefined:process.env.SQL_USER)||'sa'):(workbench?process.env.SQL_CONSOLE_USER:process.env.SQL_USER);
    if(!user||(!administrative&&user.toLowerCase()==='sa'))throw new UserError('数据库权限不符合安全要求，请运行 npm run db:secure 配置专用账号。',503);
    credential={user,password:await password(user,{administrative,workbench})};
  }
  return {server,port,...credential,database,connectionTimeout:7000,requestTimeout:10000,options:{encrypt:true,trustServerCertificate:['127.0.0.1','localhost','::1'].includes(server),useUTC:true},pool:{max:5,min:0,idleTimeoutMillis:30000}};
}
export async function getPool() {
  if (!poolPromise) poolPromise = (async () => {
    const pool = new sql.ConnectionPool(await connectionConfig());
    pool.on('error', () => { poolPromise = undefined; });
    try{
      await pool.connect();
      const found = await pool.request().query("SELECT OBJECT_ID(N'dbo.jilu', N'U') AS table_id");
      if (!found.recordset[0]?.table_id) throw new UserError('已连接 jizhang，但找不到 dbo.jilu 表。请确认连接的是之前的记账数据库。', 503);
      await assertLimited(pool);return pool;
    }catch(error){await pool.close().catch(()=>{});throw error;}
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
    .input('all',sql.Bit,f.all).input('offset',sql.Int,(f.page-1)*10);
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
    ORDER BY riqi DESC,id DESC OFFSET @offset ROWS FETCH NEXT 10 ROWS ONLY;
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

export async function updateEntry(id,entry,original) {
  const pool=await getPool();
  const request=pool.request().input('id',sql.Int,id);
  for(const [prefix,value] of [['',entry],['original_',original]]) {
    request.input(`${prefix}date`,sql.VarChar(10),value.riqi)
      .input(`${prefix}type`,sql.VarChar(1),value.type)
      .input(`${prefix}amount`,sql.Decimal(10,2),Number(value.amount))
      .input(`${prefix}category`,sql.NVarChar(50),value.category)
      .input(`${prefix}note`,sql.NVarChar(200),value.note);
  }
  // Compare and update atomically so a stale dialog cannot overwrite an external SQL edit.
  const result=await request.query(`UPDATE dbo.jilu
    SET riqi=CONVERT(date,@date),type=@type,amount=@amount,category=@category,note=@note
    OUTPUT INSERTED.id
    WHERE id=@id AND riqi=CONVERT(date,@original_date)
      AND type COLLATE Latin1_General_100_BIN2=@original_type AND amount=@original_amount
      AND category COLLATE Latin1_General_100_BIN2=@original_category
      AND DATALENGTH(category)=DATALENGTH(@original_category)
      AND ((note IS NULL AND @original_note IS NULL) OR
        (note COLLATE Latin1_General_100_BIN2=@original_note AND DATALENGTH(note)=DATALENGTH(@original_note)));`);
  if(!result.recordset.length)throw new UserError('账单已被修改或删除，请刷新后重新编辑。',409);
  return result.recordset[0];
}

let consoleBusy = false;
export async function executeSql(code) {
  const batches = splitBatches(code);
  if (consoleBusy) throw new UserError('另一段 SQL 正在执行，请稍后再试。', 409);
  consoleBusy = true;
  let pool;
  try {
    pool = new sql.ConnectionPool({...await connectionConfig({workbench:true}),requestTimeout:30000,pool:{max:1,min:0,idleTimeoutMillis:1000}});
    pool.on('error',()=>{});
    await pool.connect();
    await assertLimited(pool);
    return await runSql(pool,batches);
  } finally { if (pool) await pool.close().catch(()=>{}); consoleBusy = false; }
}
