import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {detectLanguage,translate} from './public/i18n.js';
import {UserError,validateEntry,validateFilters} from './domain.mjs';
import {readState,insertEntry,updateEntry,setPassword,executeSql} from './database.mjs';
try { process.loadEnvFile?.('.env'); } catch (error) { if (error.code!=='ENOENT') throw error; }
const port=Number(process.env.PORT || 3210);
const origin=`http://127.0.0.1:${port}`;
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/i18n.js',['i18n.js','text/javascript; charset=utf-8']]]);
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req) {
  let text='';
  for await (const part of req) {text+=part; if (Buffer.byteLength(text)>16384) throw new UserError('输入内容过长。',413);}
  try {return JSON.parse(text);} catch {throw new UserError('提交格式无效。');}
}
export function createApp(deps={readState,insertEntry,updateEntry,setPassword,executeSql}, allowedPort=port) {
  return http.createServer(async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const language=detectLanguage(req.headers['x-ledger-language'],(req.headers['accept-language']||'').split(',').map(v=>v.split(';')[0].trim()));
    const localize=message=>translate(message,{},language);
    try {
      if (![ `127.0.0.1:${allowedPort}`,`localhost:${allowedPort}` ].includes(req.headers.host)) throw new UserError('访问地址无效。',403);
      const requestOrigin=`http://127.0.0.1:${allowedPort}`;
      const url=new URL(req.url,requestOrigin);
      if (req.method==='POST') {
        if (req.headers['x-ledger-request']!=='1' || (req.headers.origin && ![requestOrigin,`http://localhost:${allowedPort}`].includes(req.headers.origin))) throw new UserError('请从记账界面提交。',403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw new UserError('提交格式无效。',415);
        if(url.pathname==='/api/sql') {const data=await body(req);return send(res,200,await deps.executeSql(data?.code));}
        if(/^\/api\/entries\/[^/]+$/.test(url.pathname)) {
          const id=Number(url.pathname.split('/').pop());
          if(!Number.isInteger(id)||id<1||id>2147483647) throw new UserError('账单编号无效。');
          const data=await body(req),entry=validateEntry(data?.entry);
          validateEntry(data?.original);
          return send(res,200,await deps.updateEntry(id,entry,data.original));
        }
        if(url.pathname==='/api/entries') {const entry=validateEntry(await body(req)); return send(res,201,await deps.insertEntry(entry));}
        if(url.pathname==='/api/connect') {const data=await body(req);await deps.setPassword(data.password);return send(res,200,{ok:true});}
      }
      if(req.method==='GET' && url.pathname==='/api/health') return send(res,200,{app:'montra',version:'1.2.1'});
      if(req.method==='GET' && url.pathname==='/api/state') return send(res,200,await deps.readState(validateFilters(url.searchParams)));
      if(req.method==='GET' && files.has(url.pathname)) {
        const [file,type]=files.get(url.pathname);
        const bytes=await readFile(new URL(`./public/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});return res.end(bytes);
      }
      send(res,404,{error:localize('找不到此页面。')});
    } catch(error) {
      if(error instanceof UserError) send(res,error.status,{error:localize(error.message)});
      else send(res,503,{error:localize('数据库连接或操作失败。请确认 Docker 中的 sqlserver 已运行、jizhang 数据库和 jilu 表存在，且密码正确。')});
    }
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  createApp().listen(port,'127.0.0.1',()=>{console.log(`Montra：${origin}\nDatabase / 数据库：${process.env.SQL_DATABASE || 'jizhang'} / dbo.jilu\nControl+C to stop / 按 Control+C 关闭服务。`);if(process.env.LEDGER_OPEN_BROWSER==='1') spawn('/usr/bin/open',[origin],{stdio:'ignore'});})
    .on('error',()=>{console.error('界面启动失败：端口可能已被占用。');process.exitCode=1;});
}
