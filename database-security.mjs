import sql from 'mssql';
import {randomBytes} from 'node:crypto';
import {readPrivate,writePrivate,privateDirectory} from './private-store.mjs';
import {UserError} from './domain.mjs';
export const quoteIdentifier=value=>`[${value.replace(/]/g,']]')}]`;
const literal=value=>`N'${value.replace(/'/g,"''")}'`;
export async function assertLimited(pool,{readonly=false}={}){
  const {recordset}=await pool.request().query(`SELECT
    IS_SRVROLEMEMBER(N'sysadmin') AS sysadmin,
    HAS_PERMS_BY_NAME(NULL,NULL,N'CONTROL SERVER') AS server_control,
    IS_MEMBER(N'db_owner') AS db_owner,IS_MEMBER(N'db_securityadmin') AS security_admin,
    IS_MEMBER(N'db_ddladmin') AS ddl_admin,
    HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CONTROL') AS db_control,
    HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CREATE TABLE') AS create_table,
    HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CREATE PROCEDURE') AS create_procedure,
    HAS_PERMS_BY_NAME(N'dbo.jilu',N'OBJECT',N'SELECT') AS can_select,
    HAS_PERMS_BY_NAME(N'dbo.jilu',N'OBJECT',N'INSERT') AS can_insert,
    HAS_PERMS_BY_NAME(N'dbo.jilu',N'OBJECT',N'UPDATE') AS can_update,
    HAS_PERMS_BY_NAME(N'dbo.jilu',N'OBJECT',N'DELETE') AS can_delete,
    HAS_PERMS_BY_NAME(N'dbo.jilu',N'OBJECT',N'ALTER') AS can_alter;`);
  const p=recordset[0];
  const prohibited=['sysadmin','server_control','db_owner','security_admin','ddl_admin','db_control','create_table','create_procedure','can_delete','can_alter',...(readonly?['can_insert','can_update']:[])];
  if(!p||prohibited.some(key=>p[key]!==0)||p.can_select!==1||(!readonly&&(p.can_insert!==1||p.can_update!==1)))throw new UserError('数据库权限不符合安全要求，请运行 npm run db:secure 配置专用账号。',503);
}
export async function provisionDatabase(config,{directory=privateDirectory,persist=true,backup=true}={}){
  if(persist){
    const existing=readPrivate('database.json',directory);
    if(existing){
      if(existing.server!==config.server||existing.port!==config.port||existing.database!==config.database)throw new Error('Private database settings belong to another connection. Use a separate project folder.');
      for(const [role,readonly]of [['app',false],['console',true]]){
        const check=new sql.ConnectionPool({...config,...existing[role]});
        try{await check.connect();await assertLimited(check,{readonly});}finally{await check.close();}
      }
      return existing;
    }
  }
  const master=new sql.ConnectionPool({...config,database:'master'});
  const ledger=new sql.ConnectionPool(config);
  const suffix=randomBytes(6).toString('hex');
  const credentials={server:config.server,port:config.port,database:config.database,
    app:{user:`montra_app_${suffix}`,password:`Aa1!${randomBytes(24).toString('hex')}`},
    console:{user:`montra_read_${suffix}`,password:`Aa1!${randomBytes(24).toString('hex')}`}};
  const created=[];
  try{
    await master.connect();await ledger.connect();
    if(backup){
      const rows=(await ledger.request().query('SELECT id,CONVERT(char(10),riqi,23) AS riqi,type,CONVERT(varchar(30),amount) AS amount,category,note FROM dbo.jilu ORDER BY id')).recordset;
      writePrivate(`ledger-backup-${Date.now()}.json`,{format:'montra-ledger-v1',database:config.database,createdAt:new Date().toISOString(),rows},directory);
    }
    for(const role of ['app','console']){
      const {user,password}=credentials[role],name=quoteIdentifier(user);
      await master.request().query(`CREATE LOGIN ${name} WITH PASSWORD=${literal(password)}, CHECK_POLICY=ON;`);
      created.push(user);
      await master.request().query(`DENY VIEW ANY DATABASE TO ${name};`);
      await ledger.request().query(`CREATE USER ${name} FOR LOGIN ${name}; GRANT ${role==='app'?'SELECT,INSERT,UPDATE':'SELECT'} ON OBJECT::dbo.jilu TO ${name};`);
      const check=new sql.ConnectionPool({...config,user,password});
      try{await check.connect();await assertLimited(check,{readonly:role==='console'});}finally{await check.close();}
    }
    if(persist)writePrivate('database.json',credentials,directory);
    return credentials;
  }catch(error){
    for(const user of created.reverse()){
      await ledger.request().query(`IF USER_ID(${literal(user)}) IS NOT NULL DROP USER ${quoteIdentifier(user)};`).catch(()=>{});
      await master.request().query(`DROP LOGIN ${quoteIdentifier(user)};`).catch(()=>{});
    }
    throw error;
  }finally{await ledger.close();await master.close();}
}
