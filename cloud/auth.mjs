import {UserError} from '../domain.mjs';
import {cloudPasswordProof} from '../public/cloud-auth.js';
const encoder=new TextEncoder();
const cookieName='montra_cloud_session';
const lifetime=8*60*60*1000;
export const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
export const randomHex=(size=32)=>hex(crypto.getRandomValues(new Uint8Array(size)));
export const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export async function passwordHash(password,salt){
  return digest(await cloudPasswordProof(password,salt));
}
export function validatePassword(value){
  if(typeof value!=='string'||value.length<4||value.length>256)throw new UserError('访问密码需要 4–256 个字符。');
  return value;
}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function token(request){return (request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
function cookie(request,value,maxAge){return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export function cloudAuth(db,now=Date.now){
  // Sessions and password hashes live in a different database from the SQL workbench.
  async function settings(){const row=await db.prepare('SELECT salt,password_hash,version,proof_version FROM access_settings WHERE id=1').first();if(!row||row.proof_version!==2)throw new UserError('云端账本尚未完成设置，请联系账本所有者。',503);return row;}
  async function session(request){
    const value=token(request),proof=request.headers.get('X-Ledger-Session');
    if(!/^[a-f0-9]{64}$/.test(value||'')||!/^[a-f0-9]{64}$/.test(proof||''))return null;
    const row=await db.prepare('SELECT s.token_hash,s.version FROM sessions s JOIN access_settings a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.proof_hash=? AND s.expires_at>?').bind(await digest(value),await digest(proof),now()).first();
    return row;
  }
  async function requireSession(request){const found=await session(request);if(!found)throw new UserError('请先输入访问密码登录。',401);return found;}
  async function verify(value,record){
    const time=now();
    const attempt=await db.prepare(`INSERT INTO login_limits(id,attempts,reset_at) VALUES(1,1,?)
      ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,
      reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END
      WHERE attempts<5 OR reset_at<=? RETURNING attempts`).bind(time+15*60*1000,time,time,time).first();
    if(!attempt)throw new UserError('尝试次数过多，请稍后再试。',429);
    if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||!equal(await digest(value),record.password_hash))throw new UserError('访问密码不正确。',401);
    await db.prepare('DELETE FROM login_limits WHERE id=1').run();
  }
  async function issue(request,version){
    const value=randomHex(),proof=randomHex();
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now()),
      db.prepare('INSERT INTO sessions(token_hash,proof_hash,expires_at,version) VALUES(?,?,?,?)').bind(await digest(value),await digest(proof),now()+lifetime,version)
    ]);
    return {accessToken:proof,setCookie:cookie(request,value,lifetime/1000)};
  }
  return {session,requireSession,async passwordSalt(){return (await settings()).salt;},
    async login(request,value){const record=await settings();await verify(value,record);return issue(request,record.version);},
    async logout(request){const value=token(request);if(value)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(value)).run();return {setCookie:cookie(request,'',0)};},
    async configure(request,data){
      if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.enabled!=='boolean')throw new UserError('提交格式无效。');
      const current=await requireSession(request);
      if(!data.enabled)throw new UserError('云端账本需要保留访问密码。');
      if(!/^[a-f0-9]{32}$/.test(data.newSalt||'')||!/^[a-f0-9]{64}$/.test(data.newProof||''))throw new UserError('提交格式无效。');
      const record=await settings();await verify(data.currentProof,record);
      const salt=data.newSalt,hash=await digest(data.newProof);
      // Only one concurrent password change can win; old sessions are invalidated by version.
      const changed=await db.prepare('UPDATE access_settings SET salt=?,password_hash=?,version=version+1 WHERE id=1 AND version=? RETURNING version').bind(salt,hash,current.version).first();
      if(!changed)throw new UserError('请先输入访问密码登录。',401);
      await db.prepare('DELETE FROM sessions WHERE version<>?').bind(changed.version).run();
      return {passwordEnabled:true,...await issue(request,changed.version)};
    }
  };
}
