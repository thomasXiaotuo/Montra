import {randomBytes,scryptSync,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {unlinkSync,renameSync,existsSync} from 'node:fs';
import {privateDirectory,protectDirectory,readPrivate,writePrivate,createPrivate} from './private-store.mjs';
import {UserError} from './domain.mjs';
const derive=promisify(scrypt);
const params={N:131072,r:8,p:1,maxmem:256*1024*1024};
const lifetime=8*60*60*1000,windowMs=15*60*1000;
const cookieName='montra_session';
function passwordValue(value){
 if(typeof value!=='string'||value.length<4||value.length>256)throw new UserError('访问密码需要 4–256 个字符。');
 return value;
}
export function createAuth({directory=privateDirectory,initialPassword,now=Date.now}={}){
 protectDirectory(directory);
 let record=readPrivate('auth.json',directory);
 const initialFile=join(directory,'initial-access-password.json');
 // Migrate the password handoff from earlier editions without changing its value.
 const legacyName='\u521d\u59cb\u8bbf\u95ee\u5bc6\u7801.json';
 if(!existsSync(initialFile)&&readPrivate(legacyName,directory))renameSync(join(directory,legacyName),initialFile);
 if(!record){
  const password=passwordValue(initialPassword??randomBytes(24).toString('base64url'));
  const salt=randomBytes(16).toString('hex');
  record={version:1,enabled:initialPassword!==undefined,salt,hash:scryptSync(password,salt,64,params).toString('hex')};
  if(createPrivate('auth.json',record,directory)){
   if(record.enabled)writePrivate('initial-access-password.json',{password,instructions:'Change your access password in Access settings after your first sign-in.'},directory);
  }else record=readPrivate('auth.json',directory);
 }
 if(record.version!==1||!/^[a-f0-9]{32}$/.test(record.salt)||!/^[a-f0-9]{128}$/.test(record.hash)||(record.enabled!==undefined&&typeof record.enabled!=='boolean'))throw new Error('Invalid authentication settings.');
 const passwordEnabled=()=>record.enabled!==false;
 const sessions=new Map();
 let failures=0,windowStart=now(),busy=false;
 function clean(){for(const [token,session]of sessions)if(session.expiry<=now())sessions.delete(token);}
 function token(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);}
 function authenticated(req){
  if(!passwordEnabled())return true;
  clean();const session=sessions.get(token(req)),proof=req.headers['x-ledger-session'];
  return Boolean(session&&typeof proof==='string'&&/^[A-Za-z0-9_-]{43}$/.test(proof)&&timingSafeEqual(Buffer.from(proof),Buffer.from(session.proof)));
 }
 function requireSession(req){if(!authenticated(req))throw new UserError('请先输入访问密码登录。',401);}
 function clearCookie(res){res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);}
 function issue(res){
  clean();if(sessions.size>=32)sessions.delete(sessions.keys().next().value);
  const value=randomBytes(32).toString('base64url'),proof=randomBytes(32).toString('base64url');sessions.set(value,{expiry:now()+lifetime,proof});
  res.setHeader('Set-Cookie',`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime/1000}`);
  return proof;
 }
 async function verify(value){
  if(now()-windowStart>=windowMs){windowStart=now();failures=0;}
  if(failures>=5||busy)throw new UserError('尝试次数过多，请稍后再试。',429);
  if(typeof value!=='string'||!value||value.length>256){failures++;throw new UserError('访问密码不正确。',401);}
  busy=true;
  try{
   const hash=await derive(value,record.salt,64,params);
   if(!timingSafeEqual(hash,Buffer.from(record.hash,'hex'))){failures++;throw new UserError('访问密码不正确。',401);}
   failures=0;
  }finally{busy=false;}
 }
 async function configure(req,res,data={}){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new UserError('提交格式无效。');
  const {enabled,currentPassword,newPassword}=data;
  if(typeof enabled!=='boolean')throw new UserError('提交格式无效。');
  requireSession(req);
  if(enabled)passwordValue(newPassword);
  if(passwordEnabled())await verify(currentPassword);
  if(busy)throw new UserError('尝试次数过多，请稍后再试。',429);
  busy=true;
  try{
   let updated={...record,enabled};
   if(enabled){const salt=randomBytes(16).toString('hex');updated={version:1,enabled:true,salt,hash:(await derive(newPassword,salt,64,params)).toString('hex')};}
   writePrivate('auth.json',updated,directory);record=updated;sessions.clear();
   const accessToken=enabled?issue(res):'';if(!enabled)clearCookie(res);
   try{unlinkSync(initialFile);}catch(error){if(error.code!=='ENOENT')throw error;}
   return {passwordEnabled:enabled,accessToken};
  }finally{busy=false;}
 }
 return {initialFile,passwordEnabled,authenticated,requireSession,configure,
  async login(value,res){if(passwordEnabled())await verify(value);return issue(res);},
  logout(req,res){sessions.delete(token(req));clearCookie(res);},
  async changePassword(req,res,currentPassword,newPassword){return (await configure(req,res,{enabled:true,currentPassword,newPassword})).accessToken;}
 };
}
