import {UserError,validateEntry,validateEntryId,validateEdit,validateFilters} from '../domain.mjs';
import {detectLanguage,translate} from '../public/i18n.js';
import {accessIdentity} from './access-identity.mjs';
import {accountAuth,accountBooks,migrateLegacyBooks} from './account-auth.mjs';
import {digest} from './auth.mjs';
import {cloudDatabase} from './database.mjs';
import {cloudBooks,bookId,bookInput} from './books.mjs';

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
    if(request.method==='GET'&&url.pathname==='/api/health')return json({app:'montra',version:'1.9.0',releaseVersion:'1.9.0-cloud',edition:'cloud',cloud:true,multipleBooks:true,accountLogin:true,dockerEnabled:false});
    let identity;
    try{identity=await accessIdentity(request,env);}catch(error){
      if(url.pathname==='/api/auth/status'&&error.status===401)return json({authenticated:false,cloud:true,accountLogin:true,passwordEnabled:false,loginUrl:'/cdn-cgi/access/login'});
      throw error;
    }
    const auth=accountAuth(env.AUTH_DB,identity),books=cloudBooks(env.LEDGER_DB);
    if(request.method==='GET'&&url.pathname==='/api/auth/status')return json({authenticated:Boolean(await auth.session(request)),cloud:true,accountLogin:true,passwordEnabled:false,user:{email:identity.email},loginUrl:'/cdn-cgi/access/login'});
    if(request.method==='POST'){
      if(request.headers.get('X-Ledger-Request')!=='1'||request.headers.get('Origin')!==url.origin)throw new UserError('请从记账界面提交。',403);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new UserError('提交格式无效。',415);
      if(url.pathname==='/api/auth/login'){await body(request);await migrateLegacyBooks(env,identity);return json({ok:true,...withCookie(await auth.login(request))});}
    }
    const session=await auth.requireSession(request),access=accountBooks(env.AUTH_DB,env.LEDGER_DB,identity,session);
    if(request.method==='POST'&&url.pathname==='/api/auth/logout')return json({ok:true,...withCookie(await auth.logout(request))});
    if(request.method==='GET'&&url.pathname==='/api/books'){const list=await access.list();return json({books:list,defaultBookId:list[0]?.id??null,user:{email:identity.email}});}
    if(request.method==='POST'&&url.pathname==='/api/books'){
      const data=await body(request);bookInput(data);
      // Scope idempotency keys to an identity; guessing another user's UUID cannot recover their book.
      const hash=await digest(identity.id+':'+data.requestId);data.requestId=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
      const book=await books.create(data);
      await env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_books(book_id,owner_id) VALUES(?,?)').bind(book.id,identity.id).run();
      await access.owned(book.id);const security=await access.status(book.id);return json({...book,passwordEnabled:security.passwordEnabled,locked:security.locked},201);
    }
    const selected=bookId(request.headers.get('X-Ledger-Book')),db=cloudDatabase(env.LEDGER_DB,selected);
    await access.owned(selected);
    if(request.method==='GET'&&url.pathname==='/api/book/security')return json(await access.status(selected));
    if(request.method==='POST'&&url.pathname==='/api/book/unlock')return json(await access.unlock(selected,(await body(request)).proof));
    if(request.method==='POST'&&url.pathname==='/api/book/lock')return json(await access.lock(selected));
    if(request.method==='POST'&&url.pathname==='/api/book/security')return json(await access.configure(selected,await body(request)));
    await access.requireUnlocked(selected);
    if(request.method==='GET'&&url.pathname==='/api/state'){const state=await db.readState(validateFilters(url.searchParams));state.books=await access.list();return json(state);}
    if(request.method==='GET'&&url.pathname==='/api/export'){
      headers.set('Content-Disposition',`attachment; filename="montra-backup-${new Date().toISOString().slice(0,10)}.json"`);
      if(url.searchParams.get('allBooks')==='1'){
        const list=await access.list();for(const book of list)await access.requireUnlocked(book.id);
        const exported=[];for(const book of list)exported.push({...book,rows:await cloudDatabase(env.LEDGER_DB,book.id).exportRows()});
        return json({format:'montra-books-v1',createdAt:new Date().toISOString(),books:exported});
      }
      return json({format:'montra-ledger-v1',database:'Cloud ledger',book:await books.get(selected),createdAt:new Date().toISOString(),rows:await db.exportRows()});
    }
    if(request.method==='POST'){
      if(url.pathname==='/api/entries')return json(await db.insertEntry(validateEntry(await body(request))),201);
      const edit=/^\/api\/entries\/([^/]+)$/.exec(url.pathname);
      if(edit){const {entry,original}=validateEdit(await body(request));return json(await db.updateEntry(validateEntryId(edit[1]),entry,original));}
      if(url.pathname==='/api/sql'){await books.get(selected);const data=await body(request);const {executeCloudSql}=await import('./sql-console.mjs');return json(await executeCloudSql(env.LEDGER_DB,data?.code,selected));}
    }
    return json({error:translate('找不到此页面。',{},language)},404);
  }catch(error){
    if(error instanceof UserError)return json({error:translate(error.message,{},language)},error.status);
    return json({error:translate('云端服务暂时不可用，请稍后刷新重试。',{},language)},503);
  }
}};
