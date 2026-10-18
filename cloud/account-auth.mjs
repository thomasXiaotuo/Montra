import {UserError} from '../domain.mjs';
import {digest,randomHex} from './auth.mjs';
const name='montra_account_session';
const duration=8*60*60*1000;
const token=request=>(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
const cookie=(request,value,age)=>`${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export function accountAuth(db,identity,now=Date.now){
  async function session(request){
    const value=token(request),proof=request.headers.get('X-Ledger-Session');
    if(!/^[a-f0-9]{64}$/.test(value||'')||!/^[a-f0-9]{64}$/.test(proof||''))return null;
    return db.prepare('SELECT token_hash,owner_id,expires_at FROM account_sessions WHERE token_hash=? AND proof_hash=? AND owner_id=? AND expires_at>?')
      .bind(await digest(value),await digest(proof),identity.id,now()).first();
  }
  return {session,async requireSession(request){const found=await session(request);if(!found)throw new UserError('Sign in with your Cloudflare account.',401);return found;},
    async login(request){
      const value=randomHex(),proof=randomHex(),expires=Math.min(now()+duration,identity.expiresAt);
      const previous=token(request);
      if(previous){const hash=await digest(previous);await db.batch([db.prepare('DELETE FROM book_unlocks WHERE session_hash=?').bind(hash),db.prepare('DELETE FROM account_sessions WHERE token_hash=? AND owner_id=?').bind(hash,identity.id)]);}
      await db.batch([db.prepare('DELETE FROM book_unlocks WHERE session_hash IN (SELECT token_hash FROM account_sessions WHERE expires_at<=?)').bind(now()),db.prepare('DELETE FROM account_sessions WHERE expires_at<=?').bind(now()),db.prepare('INSERT INTO account_sessions(token_hash,proof_hash,owner_id,expires_at) VALUES(?,?,?,?)').bind(await digest(value),await digest(proof),identity.id,expires)]);
      return {accessToken:proof,setCookie:cookie(request,value,Math.floor((expires-now())/1000))};
    },
    async logout(request){const value=token(request);if(value){const hash=await digest(value);await db.batch([db.prepare('DELETE FROM book_unlocks WHERE session_hash=?').bind(hash),db.prepare('DELETE FROM account_sessions WHERE token_hash=? AND owner_id=?').bind(hash,identity.id)]);}return {setCookie:cookie(request,'',0),logoutUrl:'/cdn-cgi/access/logout'};}
  };
}
export function accountBooks(authDb,ledger,identity,session,now=Date.now){
  async function owned(id){const row=await authDb.prepare('SELECT * FROM account_books WHERE book_id=? AND owner_id=?').bind(id,identity.id).first();if(!row)throw new UserError('Ledger not found.',404);return row;}
  async function unlocked(row){return !row.password_hash||Boolean(await authDb.prepare('SELECT 1 AS ok FROM book_unlocks WHERE session_hash=? AND book_id=? AND version=?').bind(session.token_hash,row.book_id,row.version).first());}
  async function verify(row,proof){
    const time=now();const attempt=await authDb.prepare(`INSERT INTO book_login_limits(owner_id,book_id,attempts,reset_at) VALUES(?,?,1,?) ON CONFLICT(owner_id,book_id) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END WHERE attempts<5 OR reset_at<=? RETURNING attempts`).bind(identity.id,row.book_id,time+900000,time,time,time).first();
    if(!attempt)throw new UserError('Too many attempts. Try again in 15 minutes.',429);
    if(typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof)||await digest(proof)!==row.password_hash)throw new UserError('Incorrect ledger password.',403);
    await authDb.prepare('DELETE FROM book_login_limits WHERE owner_id=? AND book_id=?').bind(identity.id,row.book_id).run();
  }
  return {owned,
    async requireUnlocked(id){const row=await owned(id);if(!await unlocked(row))throw new UserError('Unlock this ledger first.',423);return row;},
    async list(){const rows=(await authDb.prepare('SELECT * FROM account_books WHERE owner_id=? ORDER BY book_id').bind(identity.id).all()).results;const out=[];for(const row of rows){const book=await ledger.prepare('SELECT id,name,created_at AS createdAt FROM books WHERE id=?').bind(row.book_id).first();if(book)out.push({...book,passwordEnabled:Boolean(row.password_hash),locked:!await unlocked(row)});}return out;},
    async status(id){const row=await owned(id);return {passwordEnabled:Boolean(row.password_hash),passwordSalt:row.salt,locked:!await unlocked(row)};},
    async unlock(id,proof){const row=await owned(id);if(row.password_hash)await verify(row,proof);await authDb.prepare('INSERT INTO book_unlocks(session_hash,book_id,version) VALUES(?,?,?) ON CONFLICT(session_hash,book_id) DO UPDATE SET version=excluded.version').bind(session.token_hash,id,row.version).run();return {ok:true};},
    async lock(id){await owned(id);await authDb.prepare('DELETE FROM book_unlocks WHERE session_hash=? AND book_id=?').bind(session.token_hash,id).run();return {ok:true};},
    async configure(id,data){
      const row=await owned(id);if(typeof data?.enabled!=='boolean')throw new UserError('Invalid password settings.');
      if(row.password_hash)await verify(row,data.currentProof);
      if(data.enabled&&(!/^[a-f0-9]{32}$/.test(data.newSalt||'')||!/^[a-f0-9]{64}$/.test(data.newProof||'')))throw new UserError('Invalid password settings.');
      const changed=await authDb.prepare('UPDATE account_books SET salt=?,password_hash=?,version=version+1 WHERE book_id=? AND owner_id=? AND version=? RETURNING version').bind(data.enabled?data.newSalt:null,data.enabled?await digest(data.newProof):null,id,identity.id,row.version).first();
      if(!changed)throw new UserError('Password changed in another session. Refresh and retry.',409);
      await authDb.prepare('DELETE FROM book_unlocks WHERE book_id=?').bind(id).run();
      // The changing session is immediately unlocked; other sessions must unlock again.
      await authDb.prepare('INSERT INTO book_unlocks(session_hash,book_id,version) VALUES(?,?,?)').bind(session.token_hash,id,changed.version).run();
      return {passwordEnabled:data.enabled};
    }
  };
}
// Run once for an explicitly configured subject. Never claim legacy data by email
// supplied in a form, a shared password, or whichever user happens to visit first.
export async function migrateLegacyBooks(env,identity){
  if(!env.LEGACY_OWNER_ID||env.LEGACY_OWNER_ID!==identity.id)return;
  if(!/^[1-9]\d*$/.test(String(env.LEGACY_MAX_BOOK_ID||'')))throw new UserError('Set LEGACY_MAX_BOOK_ID before migrating existing ledgers.',503);
  if(await env.AUTH_DB.prepare("SELECT id FROM account_migrations WHERE id='legacy-owner-v1'").first())return;
  const legacy=await env.AUTH_DB.prepare('SELECT salt,password_hash,proof_version FROM access_settings WHERE id=1').first();
  if(legacy&&legacy.proof_version!==2)throw new UserError('Upgrade the legacy password proof before migrating ledgers.',503);
  const rows=(await env.LEDGER_DB.prepare('SELECT id FROM books WHERE id<=? ORDER BY id').bind(Number(env.LEGACY_MAX_BOOK_ID)).all()).results;
  await env.AUTH_DB.batch([...rows.map(row=>env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_books(book_id,owner_id,salt,password_hash) VALUES(?,?,?,?)').bind(row.id,identity.id,legacy?.proof_version===2?legacy.salt:null,legacy?.proof_version===2?legacy.password_hash:null)),env.AUTH_DB.prepare("INSERT OR IGNORE INTO account_migrations(id,owner_id) VALUES('legacy-owner-v1',?)").bind(identity.id)]);
}
