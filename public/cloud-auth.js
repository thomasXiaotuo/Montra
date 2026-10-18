// Expensive password stretching runs in the browser, keeping login within the
// free Worker's small CPU allowance. Only the derived proof crosses HTTPS.
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
export async function cloudPasswordProof(password,salt){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:encoder.encode(salt)},key,256));
}
export async function newCloudPassword(password){
  if(typeof password!=='string'||password.length<4||password.length>256)throw new Error('访问密码需要 4–256 个字符。');
  const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
  return {salt,proof:await cloudPasswordProof(password,salt)};
}
