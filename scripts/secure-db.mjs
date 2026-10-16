import {loadEnvironment} from '../runtime.mjs';
import {connectionConfig} from '../database.mjs';
import {provisionDatabase} from '../database-security.mjs';
import {protectEnvironment} from '../private-store.mjs';
protectEnvironment();
loadEnvironment();
try{
  await provisionDatabase(await connectionConfig({administrative:true}));
  console.log('Database secured: dedicated ledger and read-only SQL accounts verified. Existing rows unchanged. / 数据库加固完成：记账专用账号和只读查询账号已验证，原有账单保持不变。本机配置存于 .montra，请勿分享。');
}catch(error){console.error('Database security setup failed / 数据库加固失败：'+error.message);process.exitCode=1;}
