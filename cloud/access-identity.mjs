import {UserError} from '../domain.mjs';
const cache=new Map();
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
function configuration(env){
  const issuer=String(env.ACCESS_ISSUER||'').replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!env.ACCESS_AUD)
    throw new UserError('Cloudflare login is not configured. Contact the application owner.',503);
  return {issuer,aud:env.ACCESS_AUD};
}
// Never trust an email header or an unsigned JWT, including on workers.dev.
export async function accessIdentity(request,env,{fetchKeys=fetch,now=Date.now}={}){
  const {issuer,aud}=configuration(env),jwt=request.headers.get('Cf-Access-Jwt-Assertion');
  try{
    if(!jwt||jwt.length>16384)throw Error();
    const parts=jwt.split('.');if(parts.length!==3)throw Error();
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const time=Math.floor(now()/1000);
    if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||
      !(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(aud)||
      !Number.isFinite(claims.exp)||claims.exp<=time||!Number.isFinite(claims.iat)||claims.iat>time+30||
      (claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>time+30))||
      typeof claims.sub!=='string'||!claims.sub||claims.sub.length>256||
      typeof claims.email!=='string'||!claims.email.includes('@'))throw Error();
    let item=cache.get(issuer);
    if(!item||item.expires<=now()||!item.keys.some(k=>k.kid===header.kid)){
      const response=await fetchKeys(issuer+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error();const data=await response.json();
      if(!Array.isArray(data.keys))throw Error();
      item={keys:data.keys,expires:now()+300000};cache.set(issuer,item);
    }
    const jwk=item.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error();
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
    return {id:issuer+'|'+claims.sub,email:claims.email,expiresAt:claims.exp*1000};
  }catch{throw new UserError('Sign in with your Cloudflare account.',401);}
}
