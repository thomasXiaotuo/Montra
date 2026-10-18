import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadEnvironment,appPort,version,edition,releaseVersion,openBrowser,dockerEnabled} from './runtime.mjs';
import {detectLanguage,translate} from './public/i18n.js';
import {UserError,validateEntry,validateFilters,validateEntryId,validateEdit} from './domain.mjs';
import {readState,insertEntry,updateEntry,setPassword,executeSql} from './database.mjs';
import {createAuth} from './auth.mjs';
import {protectEnvironment} from './private-store.mjs';
protectEnvironment();
loadEnvironment();
const port=appPort();
const origin=`http://127.0.0.1:${port}`;
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/i18n.js',['i18n.js','text/javascript; charset=utf-8']],['/cloud-auth.js',['cloud-auth.js','text/javascript; charset=utf-8']]]);
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req) {
  const parts=[];let length=0;
  for await (const part of req) {length+=part.length;if(length>16384)throw new UserError('输入内容过长。',413);parts.push(part);}
  try {return JSON.parse(Buffer.concat(parts).toString('utf8'));} catch {throw new UserError('提交格式无效。');}
}
export function createApp(deps={readState,insertEntry,updateEntry,setPassword,executeSql}, allowedPort=port,auth=createAuth()) {
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:15000,headersTimeout:10000},async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const language=detectLanguage(req.headers['x-ledger-language'],(req.headers['accept-language']||'').split(',').map(v=>v.split(';')[0].trim()));
    const localize=message=>translate(message,{},language);
    try {
      if (![ `127.0.0.1:${allowedPort}`,`localhost:${allowedPort}` ].includes(req.headers.host)) throw new UserError('访问地址无效。',403);
      const requestOrigin=`http://127.0.0.1:${allowedPort}`;
      const url=new URL(req.url,requestOrigin);
      if(url.pathname.startsWith('/api/') && req.headers['sec-fetch-site']==='cross-site')throw new UserError('请从记账界面提交。',403);
      if (req.method==='POST') {
        if (req.headers['x-ledger-request']!=='1' || (req.headers.origin && ![requestOrigin,`http://localhost:${allowedPort}`].includes(req.headers.origin))) throw new UserError('请从记账界面提交。',403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw new UserError('提交格式无效。',415);
        if(url.pathname==='/api/auth/login'){const data=await body(req);const accessToken=await auth.login(data?.password,res);return send(res,200,{ok:true,accessToken});}
        auth.requireSession(req);
        if(url.pathname==='/api/auth/logout'){auth.logout(req,res);return send(res,200,{ok:true});}
        if(url.pathname==='/api/auth/password'){const data=await body(req);const accessToken=await auth.changePassword(req,res,data?.currentPassword,data?.newPassword);return send(res,200,{ok:true,accessToken});}
        if(url.pathname==='/api/auth/settings'){return send(res,200,{ok:true,...await auth.configure(req,res,await body(req))});}
        if(url.pathname==='/api/sql') {const data=await body(req);return send(res,200,await deps.executeSql(data?.code));}
        if(url.pathname==='/api/entries') {const entry=validateEntry(await body(req)); return send(res,201,await deps.insertEntry(entry));}
        const editPath=/^\/api\/entries\/([^/]+)$/.exec(url.pathname);
        if(editPath) {const id=validateEntryId(editPath[1]);const {entry,original}=validateEdit(await body(req));return send(res,200,await deps.updateEntry(id,entry,original));}
        if(url.pathname==='/api/connect') {const data=await body(req);await deps.setPassword(data.password);return send(res,200,{ok:true});}
      }
      if(req.method==='GET' && url.pathname==='/api/health') return send(res,200,{app:'montra',version,edition,releaseVersion,securityVersion:1,platform:process.platform,dockerEnabled:dockerEnabled()});
      if(req.method==='GET' && url.pathname==='/api/auth/status')return send(res,200,{authenticated:auth.authenticated(req),passwordEnabled:auth.passwordEnabled()});
      if(url.pathname.startsWith('/api/'))auth.requireSession(req);
      if(req.method==='GET' && url.pathname==='/api/state') return send(res,200,await deps.readState(validateFilters(url.searchParams)));
      if(req.method==='GET' && files.has(url.pathname)) {
        const [file,type]=files.get(url.pathname);
        const bytes=await readFile(new URL(`./public/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});return res.end(bytes);
      }
      send(res,404,{error:localize('找不到此页面。')});
    } catch(error) {
      if(error instanceof UserError) send(res,error.status,{error:localize(error.message)});
      else send(res,503,{error:localize('数据库连接或操作失败。请确认配置的 SQL Server 已运行、数据库和 dbo.jilu 表存在，且密码正确。')});
    }
  });
  server.maxConnections=64;server.maxRequestsPerSocket=100;return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const auth=createAuth();
  createApp(undefined,port,auth).listen(port,'127.0.0.1',()=>{console.log(`Montra ${releaseVersion}：${origin}\nPassword protection / 访问密码：${auth.passwordEnabled()?'enabled / 已开启':'disabled / 未开启'}`);if(existsSync(auth.initialFile))console.log(`Initial access password file: ${auth.initialFile}`);console.log(`Database: ${process.env.SQL_DATABASE || 'jizhang'} / dbo.jilu\nControl+C to stop.`);if(process.env.LEDGER_OPEN_BROWSER==='1') openBrowser(origin);})
    .on('error',()=>{console.error('界面启动失败：端口可能已被占用。');process.exitCode=1;});
}
