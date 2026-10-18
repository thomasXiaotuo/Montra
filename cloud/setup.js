const $=id=>document.getElementById(id);let nonce='',timer;
function showStatus(status){
  nonce=status.nonce;$('password-fields').hidden=status.alreadyConfigured;$('existing').hidden=!status.alreadyConfigured;
  for(const id of ['password','confirm']){$(id).disabled=status.alreadyConfigured;$(id).required=!status.alreadyConfigured;}
  const busy=status.stage==='publishing',done=status.stage==='done';
  $('setup').hidden=busy||done;$('progress').hidden=!busy;$('done').hidden=!done;$('status').textContent=status.message;
  $('error').hidden=!status.error;$('error').textContent=status.error||'';
  $('publish').disabled=busy;$('publish').textContent=status.stage==='error'?'重试':status.alreadyConfigured?'更新云端账本':'连接 Cloudflare 并启用账本';
  if(done){const url=new URL(status.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev'))return;$('ledger-url').textContent=url.href;$('ledger-url').href=url.href;$('open-ledger').href=url.href;clearInterval(timer);}
}
async function refresh(){try{const response=await fetch('/api/status');if(response.ok)showStatus(await response.json());}catch{$('error').hidden=false;$('error').textContent='设置窗口已关闭。需要继续时，重新双击 publish-cloud 即可。';}}
$('setup-form').addEventListener('submit',async event=>{
  event.preventDefault();if($('password').value!==$('confirm').value){$('error').hidden=false;$('error').textContent='两次输入的密码不一致。';return;}
  $('publish').disabled=true;
  try{const response=await fetch('/api/publish',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Token':nonce},body:JSON.stringify({password:$('password').value,confirm:$('confirm').value})});const data=await response.json();if(!response.ok)throw new Error(data.error);$('password').value='';$('confirm').value='';await refresh();}
  catch(error){$('error').hidden=false;$('error').textContent=error.message;$('publish').disabled=false;}
});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('ledger-url').href);$('copy').textContent='已复制';}catch{$('copy').textContent='请长按或选中上方网址复制';}});
await refresh();timer=setInterval(refresh,1500);
