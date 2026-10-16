import {randomBytes,scryptSync,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {unlinkSync} from 'node:fs';
import {privateDirectory,protectDirectory,readPrivate,writePrivate,createPrivate} from './private-store.mjs';
import {UserError} from './domain.mjs';
const derive=promisify(scrypt);
const params={N:131072,r:8,p:1,maxmem:256*1024*1024};
const lifetime=8*60*60*1000,windowMs=15*60*1000;
const cookieName='montra_session';
function passwordValue(value){
  if(typeof value!=='string'||value.length<12||value.length>256)throw new UserError('访问密码需要 12–256 个字符。');
  return value;
}
export function createAuth({directory=privateDirectory,initialPassword,now=Date.now}={}){
  protectDirectory(directory);
  let record=readPrivate('auth.json',directory);
  const initialFile=join(directory,'初始访问密码.json');
  if(!record){
    const password=passwordValue(initialPassword??randomBytes(24).toString('base64url'));
    const salt=randomBytes(16).toString('hex');
    record={version:1,salt,hash:scryptSync(password,salt,64,params).toString('hex')};
    if(createPrivate('auth.json',record,directory))writePrivate('初始访问密码.json',{password,instructions:'首次登录后请使用“修改访问密码”，修改成功会删除此文件。'},directory);
    else record=readPrivate('auth.json',directory);
  }
  if(record.version!==1||!/^[a-f0-9]{32}$/.test(record.salt)||!/^[a-f0-9]{128}$/.test(record.hash))throw new Error('Invalid authentication settings.');
  const sessions=new Map();
  let failures=0,windowStart=now(),busy=false;
  function clean(){for(const [token,session]of sessions)if(session.expiry<=now())sessions.delete(token);}
  function token(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);}
  function authenticated(req){
    clean();const session=sessions.get(token(req)),proof=req.headers['x-ledger-session'];
    return Boolean(session&&typeof proof==='string'&&/^[A-Za-z0-9_-]{43}$/.test(proof)&&timingSafeEqual(Buffer.from(proof),Buffer.from(session.proof)));
  }
  function requireSession(req){if(!authenticated(req))throw new UserError('请先输入访问密码登录。',401);}
  function issue(res){
    clean();if(sessions.size>=32)sessions.delete(sessions.keys().next().value);
    const value=randomBytes(32).toString('base64url'),proof=randomBytes(32).toString('base64url');sessions.set(value,{expiry:now()+lifetime,proof});
    // This cookie is for loopback-only HTTP, never a remotely exposed server.
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
  return {initialFile,authenticated,requireSession,
    async login(value,res){await verify(value);return issue(res);},
    logout(req,res){sessions.delete(token(req));res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);},
    async changePassword(req,res,current,next){
      requireSession(req);passwordValue(next);await verify(current);busy=true;
      try{
        const salt=randomBytes(16).toString('hex');
        const updated={version:1,salt,hash:(await derive(next,salt,64,params)).toString('hex')};
        writePrivate('auth.json',updated,directory);record=updated;sessions.clear();const proof=issue(res);
        try{unlinkSync(initialFile);}catch(error){if(error.code!=='ENOENT')throw error;}
        return proof;
      }finally{busy=false;}
    }
  };
}
