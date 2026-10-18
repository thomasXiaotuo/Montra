import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openBrowser} from '../runtime.mjs';
import {readPrivate,writePrivate} from '../private-store.mjs';
import {publishCloud} from './publish-cloud.mjs';
export async function startCloudSetup({publish=publishCloud,browser=true,initialState,listenPort=0}={}){
  const nonce=randomBytes(32).toString('hex');let port;
  const previous=initialState??readPrivate('cloud-deployment.json');
  const status={app:'montra-cloud-setup',stage:'ready',message:'准备好后，点击下方按钮。',alreadyConfigured:Boolean(previous?.authInitialized),url:previous?.url||null};
  let pending;
  const server=http.createServer(async(req,res)=>{
    const json=(value,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try{
      if(req.headers.host!==`127.0.0.1:${port}`)return json({error:'Invalid address.'},403);
      if(req.method==='GET'&&req.url==='/api/status')return json({...status,nonce});
      if(req.method==='POST'&&req.url==='/api/publish'){
        if(req.headers.origin!==`http://127.0.0.1:${port}`||req.headers['x-setup-token']!==nonce||!req.headers['content-type']?.startsWith('application/json'))return json({error:'请从设置页面继续。'},403);
        if(pending)return json({error:'正在发布，请等待。'},409);
        const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2048)return json({error:'输入过长。'},413);chunks.push(chunk);}
        const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!status.alreadyConfigured&&(typeof data.password!=='string'||data.password.length<4||data.password.length>256||data.password!==data.confirm))return json({error:'请设置至少 4 个字符的密码，两次输入需一致。'},400);
        status.stage='publishing';status.message='请在打开的 Cloudflare 页面登录并允许连接。';delete status.error;
        pending=publish({password:data.password,onProgress:message=>{status.message=message;}}).then(result=>{status.stage='done';status.message='云端账本已准备好。';status.url=result.url;status.importedRows=result.importedRows;status.alreadyConfigured=true;}).catch(error=>{
          status.stage='error';status.message='还没有发布成功，你的本机账单仍然保留。';
          status.alreadyConfigured=Boolean(readPrivate('cloud-deployment.json')?.authInitialized);
          status.error=error.cause?'请确认已完成 Cloudflare 注册和浏览器授权，再点击重试。':error.message;
          writePrivate('cloud-publish-error.json',{createdAt:new Date().toISOString(),message:error.message,details:String(error.cause?.stderr||'').slice(0,4000)});
        }).finally(()=>{pending=null;});
        return json({ok:true});
      }
      const files={'/':['setup.html','text/html; charset=utf-8'],'/setup.js':['setup.js','text/javascript; charset=utf-8'],'/setup.css':['setup.css','text/css; charset=utf-8']};
      if(req.method==='GET'&&files[req.url]){const [file,type]=files[req.url];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(await readFile(new URL('../cloud/'+file,import.meta.url)));}
      return json({error:'Not found.'},404);
    }catch{json({error:'未能完成操作，请重新打开设置页面。'},400);}
  });
  server.requestTimeout=15000;server.maxConnections=16;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,'127.0.0.1',resolve);});port=server.address().port;
  const url=`http://127.0.0.1:${port}`;if(browser)openBrowser(url);
  return {server,url,getStatus:()=>({...status}),async close(){if(pending)await pending;await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const previous=readPrivate('cloud-setup.json');let active=false;
  if(/^http:\/\/127\.0\.0\.1:\d+$/.test(previous?.url||'')){
    try{active=(await fetch(previous.url+'/api/status',{signal:AbortSignal.timeout(1500)}).then(r=>r.json())).app==='montra-cloud-setup';}catch{}
  }
  if(active){openBrowser(previous.url);console.log('云端设置已打开，请在浏览器继续。');}
  else{
    const port=/^http:\/\/127\.0\.0\.1:\d+$/.test(previous?.url||'')?Number(new URL(previous.url).port):0;
    const setup=await startCloudSetup({listenPort:port}).catch(error=>{if(error.code==='EADDRINUSE')return startCloudSetup();throw error;});writePrivate('cloud-setup.json',{url:setup.url,pid:process.pid});
    console.log(`Montra 云端设置已打开：${setup.url}\n请在浏览器完成设置。设置期间保留此窗口，完成后可以关闭。`);
  }
}
