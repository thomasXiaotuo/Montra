import {UserError,validateEntry,validateEntryId,validateEdit,validateFilters} from '../domain.mjs';
import {detectLanguage,translate} from '../public/i18n.js';
import {cloudAuth} from './auth.mjs';
import {cloudDatabase} from './database.mjs';
import {executeCloudSql} from './sql-console.mjs';
import {cloudBooks,bookId} from './books.mjs';

const staticPaths=new Set(['/','/index.html','/app.js','/i18n.js','/style.css','/cloud-auth.js']);
const securityHeaders={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'Cache-Control':'no-store'
};
async function body(request){
  const reader=request.body?.getReader();if(!reader)throw new UserError('提交格式无效。');
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();throw new UserError('输入内容过长。',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new UserError('提交格式无效。');}
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  const headers=new Headers(securityHeaders);
  if(url.protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000');
  const language=detectLanguage(request.headers.get('X-Ledger-Language'),(request.headers.get('Accept-Language')||'').split(',').map(v=>v.split(';')[0].trim()));
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:new Headers([...headers,['Content-Type','application/json; charset=utf-8']])});
  function withCookie(value){if(value.setCookie){headers.set('Set-Cookie',value.setCookie);delete value.setCookie;}return value;}
  try{
    if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new UserError('请通过 HTTPS 访问云端账本。',403);
    if(!['GET','POST','HEAD'].includes(request.method))return json({error:'Method not allowed.'},405);
    if(!url.pathname.startsWith('/api/')){
      if(!['GET','HEAD'].includes(request.method)||!staticPaths.has(url.pathname))return json({error:translate('找不到此页面。',{},language)},404);
      const asset=await env.ASSETS.fetch(request);const merged=new Headers(asset.headers);for(const [key,value]of headers)merged.set(key,value);
      return new Response(asset.body,{status:asset.status,headers:merged});
    }
    if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new UserError('请从记账界面提交。',403);
    const auth=cloudAuth(env.AUTH_DB),books=cloudBooks(env.LEDGER_DB);
    if(request.method==='GET'&&url.pathname==='/api/health')return json({app:'montra',version:'1.8.1',releaseVersion:'1.8.1-cloud',edition:'cloud',cloud:true,multipleBooks:true,dockerEnabled:false});
    if(request.method==='GET'&&url.pathname==='/api/auth/status')return json({authenticated:Boolean(await auth.session(request)),passwordEnabled:true,cloud:true,passwordSalt:await auth.passwordSalt()});
    if(request.method==='POST'){
      if(request.headers.get('X-Ledger-Request')!=='1'||request.headers.get('Origin')!==url.origin)throw new UserError('请从记账界面提交。',403);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new UserError('提交格式无效。',415);
      if(url.pathname==='/api/auth/login'){const data=await body(request);return json({ok:true,...withCookie(await auth.login(request,data?.proof))});}
    }
    await auth.requireSession(request);
    if(request.method==='GET'&&url.pathname==='/api/books')return json({books:await books.list(),defaultBookId:1});
    if(request.method==='POST'&&url.pathname==='/api/books')return json(await books.create(await body(request)),201);
    const selected=bookId(request.headers.get('X-Ledger-Book')??1),db=cloudDatabase(env.LEDGER_DB,selected);
    if(request.method==='GET'&&url.pathname==='/api/state')return json(await db.readState(validateFilters(url.searchParams)));
    if(request.method==='GET'&&url.pathname==='/api/export'){
      headers.set('Content-Disposition',`attachment; filename="montra-backup-${new Date().toISOString().slice(0,10)}.json"`);
      if(url.searchParams.get('allBooks')==='1')return json({format:'montra-books-v1',createdAt:new Date().toISOString(),books:await db.exportAll()});
      return json({format:'montra-ledger-v1',database:'Cloud ledger',book:await books.get(selected),createdAt:new Date().toISOString(),rows:await db.exportRows()});
    }
    if(request.method==='POST'){
      if(url.pathname==='/api/auth/logout')return json({ok:true,...withCookie(await auth.logout(request))});
      if(url.pathname==='/api/auth/settings')return json({ok:true,...withCookie(await auth.configure(request,await body(request)))});
      if(url.pathname==='/api/entries')return json(await db.insertEntry(validateEntry(await body(request))),201);
      const edit=/^\/api\/entries\/([^/]+)$/.exec(url.pathname);
      if(edit){const {entry,original}=validateEdit(await body(request));return json(await db.updateEntry(validateEntryId(edit[1]),entry,original));}
      if(url.pathname==='/api/sql'){await books.get(selected);const data=await body(request);return json(await executeCloudSql(env.LEDGER_DB,data?.code,selected));}
    }
    return json({error:translate('找不到此页面。',{},language)},404);
  }catch(error){
    if(error instanceof UserError)return json({error:translate(error.message,{},language)},error.status);
    return json({error:translate('云端服务暂时不可用，请稍后刷新重试。',{},language)},503);
  }
}};
