import {detectLanguage,translate,localeFor,messageKey} from './i18n.js';
import {cloudPasswordProof,newCloudPassword} from './cloud-auth.js';
let savedLanguage;try{savedLanguage=localStorage.getItem('montra.language')||localStorage.getItem('xiaozhang.language');}catch{}
let language=detectLanguage(savedLanguage,navigator.languages||[navigator.language]);
const t=(key,args={})=>translate(key,args,language);
const errorText=error=>t(messageKey(error?.message||'无法连接，请稍后重试。'));
let lastState,lastSqlResult,lastOfflineError,formFeedback,sqlFeedback;
let editingEntry=null,editing=false,editFeedback=null;
let authenticated=false,passwordEnabled=true,cloudMode=false,authSeq=0,loggingOut=false;
let accessToken='';try{accessToken=localStorage.getItem('montra.session')||'';}catch{}
function storeToken(value){accessToken=value;try{if(value)localStorage.setItem('montra.session',value);else localStorage.removeItem('montra.session');}catch{}}
window.addEventListener('storage',event=>{if(event.key==='montra.session'){accessToken=event.newValue||'';checkAuth();}});
function applyStaticLanguage(){
  document.documentElement.lang=localeFor(language);
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  for(const attr of ['placeholder','aria-label'])document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el=>el.setAttribute(attr,t(el.getAttribute(`data-i18n-${attr}`))));
  document.getElementById('language').value=language;
}
const formatDate=value=>new Intl.DateTimeFormat(localeFor(language),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
const $=id=>document.getElementById(id);
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const money=value=>{let s=String(value??'0');const negative=s.startsWith('-');if(negative)s=s.slice(1);let [a,b='']=s.split('.');return `${negative?'-':''}${a.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${b.padEnd(2,'0').slice(0,2)}`;};
let page=1,connected=false,saving=false,seq=0,timer,toastTimer;
let sqlRunning=false,addingBook=false,booksLoaded=false,selectedBookId=1,bookRequestId='';
let availableBooks=[];const bookDrafts=new Map();
try{const saved=Number(sessionStorage.getItem('montra.book'));if(Number.isInteger(saved)&&saved>0)selectedBookId=saved;}catch{}
$('month').value=localToday().slice(0,7);$('date').value=localToday();
function text(tag,content,className){const el=document.createElement(tag);el.textContent=content;if(className)el.className=className;return el;}
function message(key,error=false,args={}){formFeedback={key:messageKey(key),error,args};$('form-message').textContent=t(formFeedback.key,args);$('form-message').className=`form-message ${error?'error':'success'}`;}
function toast(content){$('toast').textContent=t(messageKey(content));$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
async function api(path,options={}){const res=await fetch(path,{...options,headers:{...options.headers,'X-Ledger-Language':language,'X-Ledger-Session':accessToken,...(cloudMode?{'X-Ledger-Book':String(selectedBookId)}:{})}});let data;try{data=await res.json();}catch{throw new Error(t('服务暂时不可用，请确认记账程序仍在运行。'));}if(!res.ok){if(res.status===401&&!path.startsWith('/api/auth/'))lockView();throw new Error(data.error||t('操作失败，请重试。'));}return data;}
function saveAvailability(){
  const bookBusy=saving||editing||sqlRunning||addingBook;
  $('book-select').disabled=!authenticated||bookBusy;$('add-book').disabled=!connected||bookBusy;
  $('save').disabled=!connected||saving;
  $('edit-save').disabled=!connected||editing;
  $('edit-save').textContent=editing?t('正在保存…'):t('保存修改');
  $('edit-fields').disabled=editing;$('edit-cancel').disabled=editing;
  document.querySelectorAll('.edit-entry').forEach(button=>button.disabled=!connected);
}
function showOffline(error){lastOfflineError=error;connected=false;saveAvailability();$('connection').textContent=t('连接中断 · 数据可能未更新');$('connection').className='connection failed';$('offline').hidden=false;$('connection-error').textContent=errorText(error);}
function params(){return new URLSearchParams({today:localToday(),month:$('month').value,type:$('filter-type').value,category:$('filter-category').value,q:$('search').value,page:String(page),all:$('all-months').checked?'1':'0'});}
function render(data){
  if(data.book&&data.book.id!==selectedBookId)return;
  if(data.books){availableBooks=data.books;booksLoaded=true;renderBookOptions();}
  lastState=data;lastOfflineError=null;
  if(data.database){$('database-label').textContent=`${data.database} / ${data.table||'dbo.jilu'}`;$('sql-database').textContent=t('默认数据库 · {database}',{database:data.database});}
  if(data.book)$('sql-database').textContent=data.book.name;
  connected=true;saveAvailability();$('offline').hidden=true;$('connection').textContent=t('账本已连接 · 自动同步');$('connection').className='connection';
  for(const [id,val]of [['income',data.summary.income],['expense',data.summary.expense],['net',data.summary.net],['all-net',data.allNet]]){$(id).textContent=money(val);$(id).classList.toggle('negative',String(val).startsWith('-'));}
  const month=$('month').value,today=localToday();$('period').textContent=month===today.slice(0,7)?t('{month} · 本月截至 {today}',{month,today:formatDate(today)}):month<today.slice(0,7)?t('{month} · 整月统计',{month}):t('{month} · 截至今天，未来账单暂不计入汇总',{month});
  const chosen=$('filter-category').value;
  $('filter-category').replaceChildren(new Option(t('全部类别'),''),...data.categories.map(c=>new Option(c,c)));
  if(chosen&&!data.categories.includes(chosen))$('filter-category').add(new Option(chosen,chosen));$('filter-category').value=chosen;
  $('category-list').replaceChildren(...data.categories.map(c=>new Option(c,c)));
  const defaults=$('entry-form').elements.type.value==='i'?['salary','refund','other']:['eat','shop','car','other'];
  const chips=[...new Set([...defaults,...data.categories])].slice(0,8);
  $('category-chips').replaceChildren(...chips.map(c=>{const b=text('button',c,'chip');b.type='button';b.addEventListener('click',()=>{$('category').value=c;$('amount').focus();});return b;}));
  $('records').replaceChildren();
  if(!data.rows.length){const tr=document.createElement('tr'),td=text('td',t('这里还没有账单。换个筛选条件，或在左边记下第一笔。'),'empty-cell');td.colSpan=4;tr.append(td);$('records').append(tr);}
  for(const r of data.rows){const tr=document.createElement('tr'),detail=document.createElement('td');detail.append(text('div',formatDate(r.riqi),'date'),text('div',r.note||t('无备注'),'note'));const actions=text('div','','record-actions');const edit=text('button',t('编辑'),'secondary edit-entry');edit.type='button';edit.dataset.entryId=r.id;edit.setAttribute('aria-label',t('编辑账单 #{id}',{id:r.id}));edit.addEventListener('click',()=>openEdit(r));actions.append(text('div',`#${r.id}`,'record-id'),edit);detail.append(actions);const cat=document.createElement('td');const tag=text('span',r.category,'category-tag');tag.title=r.category;cat.append(tag);const type=document.createElement('td');type.append(text('span',r.type==='i'?t('收入'):t('支出'),r.type==='i'?'badge income':'badge'));const amt=text('td',`${r.type==='i'?'+':'−'}${money(r.amount)}`,`money ${r.type==='i'?'amount-income':'amount-expense'}`);tr.append(detail,cat,type,amt);$('records').append(tr);}
  $('record-count').textContent=t('{count} 笔',{count:data.total});$('page-info').textContent=t('第 {page} 页 / {pages} 页 · 每页 10 笔',{page,pages:Math.max(1,Math.ceil(data.total/10))});
  $('page-prev').disabled=page<=1;$('page-next').disabled=page*10>=data.total;
  const scopes=[$('all-months').checked?t('所有月份'):month,{'':t('全部收支'),i:t('收入'),e:t('支出')}[$('filter-type').value],chosen||t('全部类别')];if($('search').value)scopes.push(t('搜索：{query}',{query:$('search').value}));$('filter-description').textContent=scopes.join(' · ');
  $('breakdown').replaceChildren();
  if(!data.breakdown.length)$('breakdown').append(text('p',t('这个月还没有支出记录。'),'empty-text'));
  const max=Math.max(1,...data.breakdown.map(r=>Number(r.amount)));
  for(const r of data.breakdown){const b=document.createElement('button');b.type='button';b.className='breakdown-item';b.title=t('筛选 {category}',{category:r.category});const top=document.createElement('div');top.className='breakdown-top';top.append(text('span',r.category),text('span',money(r.amount)));const track=document.createElement('div');track.className='bar-track';const bar=document.createElement('div');bar.className='bar-fill';bar.style.width=`${Number(r.amount)/max*100}%`;track.append(bar);b.append(top,track);b.addEventListener('click',()=>{$('filter-category').value=r.category;$('filter-type').value='e';$('all-months').checked=false;page=1;refresh();$('records-card').scrollIntoView({behavior:'smooth',block:'start'});});$('breakdown').append(b);}
  $('updated').textContent=t('已同步 {time} · 每 10 秒更新',{time:new Date(data.updatedAt).toLocaleTimeString(localeFor(language),{hour:'2-digit',minute:'2-digit',second:'2-digit'})});
}
async function refresh(){if(!authenticated)return;const mine=++seq;try{if(cloudMode&&!booksLoaded)await loadBooks();if(mine!==seq||!authenticated)return;const data=await api(`/api/state?${params()}`);if(mine!==seq||!authenticated)return;if(page>1&&!data.rows.length){page=1;return refresh();}render(data);}catch(error){if(mine===seq&&authenticated)showOffline(error);}}
$('entry-form').addEventListener('submit',async e=>{
  e.preventDefault();if(saving||!connected)return;
  const amount=$('amount').value.trim();if(!/^\d{1,8}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0){message(t('金额必须大于零，最多两位小数。'),true);$('amount').focus();return;}
  if(!$('date').value){message(t('请选择有效日期。'),true);$('date').focus();return;}
  if(!$('category').value.trim()){message(t('请填写类别。'),true);$('category').focus();return;}
  saving=true;saveAvailability();$('save').textContent=t('正在保存…');message('');
  let saved=false;
  try{const entry={riqi:$('date').value,type:$('entry-form').elements.type.value,amount,category:$('category').value.trim(),note:$('note').value.trim()};const result=await api('/api/entries',{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify(entry)});saved=true;$('amount').value='';$('note').value='';message(t('已保存 #{id} · {type} {amount}。'),false,{id:result.id,type:entry.type==='i'?t('收入'):t('支出'),amount:money(amount)});toast(cloudMode?'账单已保存':'账单已保存到 jilu');await refresh();$('amount').focus();}
  catch(error){message(t('保存结果未确认：{error} 请先刷新账单核对，避免重复录入。'),true,{error:errorText(error)});}
  finally{saving=false;$('save').textContent=t('＋ 保存账单');saveAvailability();if(saved&&!connected)message(t('账单已保存，但统计更新失败。请刷新查看。'));}
});
$('connect-form').addEventListener('submit',async e=>{e.preventDefault();$('connect-button').disabled=true;try{await api('/api/connect',{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify({password:$('password').value})});$('password').value='';await refresh();}catch(error){showOffline(error);}finally{$('connect-button').disabled=false;}});
for(const id of ['month','filter-type','filter-category','all-months'])$(id).addEventListener('change',()=>{page=1;refresh();});
$('search').addEventListener('input',()=>{clearTimeout(timer);seq++;timer=setTimeout(()=>{page=1;refresh();},250);});
$('refresh').addEventListener('click',refresh);
$('this-month').addEventListener('click',()=>{$('month').value=localToday().slice(0,7);page=1;refresh();});
function shiftMonth(delta){const current=$('month').value||localToday().slice(0,7);const d=new Date(`${current}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);$('month').value=d.toISOString().slice(0,7);page=1;refresh();}
$('prev-month').addEventListener('click',()=>shiftMonth(-1));$('next-month').addEventListener('click',()=>shiftMonth(1));
$('page-prev').addEventListener('click',()=>{page=Math.max(1,page-1);refresh();});$('page-next').addEventListener('click',()=>{page++;refresh();});
$('entry-form').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();$('entry-form').requestSubmit();}});
$('entry-form').elements.type.forEach(r=>r.addEventListener('change',refresh));
function editMessage(key,args={}){
  editFeedback={key:messageKey(key),args};$('edit-message').textContent=t(editFeedback.key,args);
}
function openEdit(row){
  if(!connected||editing)return;
  editingEntry={id:row.id,riqi:row.riqi,type:row.type,amount:row.amount,category:row.category,note:row.note??null};
  $('edit-title').textContent=t('修改账单 #{id}',{id:row.id});
  $('edit-form').elements.type.value=row.type;
  for(const [field,value]of [['date',row.riqi],['amount',row.amount],['category',row.category],['note',row.note??'']])$(`edit-${field}`).value=value;
  editMessage('');saveAvailability();$('edit-dialog').showModal();$('edit-amount').focus();
}
$('edit-cancel').addEventListener('click',()=>{if(!editing)$('edit-dialog').close();});
$('edit-dialog').addEventListener('cancel',e=>{if(editing)e.preventDefault();});
$('edit-dialog').addEventListener('close',()=>{editingEntry=null;editFeedback=null;});
$('edit-form').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();$('edit-form').requestSubmit();}});
$('edit-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!editingEntry||editing||!connected)return;
  const amount=$('edit-amount').value.trim();
  if(!/^\d{1,8}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0){editMessage('金额必须大于零，最多两位小数。');$('edit-amount').focus();return;}
  if(!$('edit-date').value){editMessage('请选择有效日期。');$('edit-date').focus();return;}
  if(!$('edit-category').value.trim()){editMessage('请填写类别。');$('edit-category').focus();return;}
  const payload={riqi:$('edit-date').value,type:$('edit-form').elements.type.value,amount,category:$('edit-category').value.trim(),note:$('edit-note').value.trim(),original:editingEntry};
  editing=true;saveAvailability();editMessage('');
  try{
    await api(`/api/entries/${editingEntry.id}`,{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify(payload)});
    $('edit-dialog').close();toast('账单修改已保存');await refresh();
  }catch(error){editMessage('修改结果未确认：{error} 请关闭编辑并刷新账单核对后再试。',{error:errorText(error)});}
  finally{editing=false;saveAvailability();}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},10000);

function lockView(){
  authSeq++;
  authenticated=false;storeToken('');connected=false;seq++;lastState=null;lastSqlResult=null;lastOfflineError=null;
  document.body.classList.add('locked');
  booksLoaded=false;availableBooks=[];bookDrafts.clear();$('book-select').replaceChildren();
  for(const id of ['edit-dialog','password-dialog','book-dialog'])if($(id).open)$(id).close();
  $('records').replaceChildren();$('sql-results').replaceChildren();$('breakdown').replaceChildren();$('category-list').replaceChildren();$('category-chips').replaceChildren();
  for(const id of ['income','expense','net','all-net'])$(id).textContent='—';
  for(const id of ['amount','note','category','sql-code','password','current-password','new-password','confirm-password','access-password','search','book-name','edit-amount','edit-category','edit-note'])$(id).value='';
  formFeedback=null;sqlFeedback=null;editFeedback=null;page=1;
  $('filter-category').replaceChildren(new Option(t('全部类别'),''));
  for(const id of ['record-count','page-info','updated','filter-description','sql-database'])$(id).textContent='';
  $('auth-message').textContent='';if($('cloud-settings'))$('cloud-settings').open=false;
  $('form-message').textContent='';$('sql-status').textContent='';$('toast').hidden=true;
  saveAvailability();if(!$('auth-dialog').open)$('auth-dialog').showModal();$('access-password').focus();
}
async function authPost(path,data={},signal){
  if(cloudMode&&(path==='/api/auth/login'||path==='/api/auth/settings'&&data.enabled)){
    const {passwordSalt}=await api('/api/auth/status');
    if(path==='/api/auth/login')data={proof:await cloudPasswordProof(data.password,passwordSalt)};
    else{const next=await newCloudPassword(data.newPassword);data={enabled:true,currentProof:await cloudPasswordProof(data.currentPassword,passwordSalt),newSalt:next.salt,newProof:next.proof};}
  }
  return api(path,{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify(data),signal});
}
$('auth-dialog').addEventListener('cancel',e=>e.preventDefault());
$('auth-form').addEventListener('submit',async e=>{
  e.preventDefault();$('auth-submit').disabled=true;$('auth-message').textContent='';
  const generation=++authSeq;
  try{
    const result=await authPost('/api/auth/login',{password:$('access-password').value});if(generation!==authSeq)return;storeToken(result.accessToken);$('access-password').value='';$('auth-message').textContent='';
    authenticated=true;$('auth-dialog').close();document.body.classList.remove('locked');await refresh();
  }catch(error){$('auth-message').textContent=errorText(error);}
  finally{$('auth-submit').disabled=false;}
});
$('lock').addEventListener('click',async()=>{
  loggingOut=true;$('lock').disabled=true;$('auth-submit').disabled=true;
  // Start revocation with the current proof, then immediately erase local data.
  const revoke=authPost('/api/auth/logout',{},AbortSignal.timeout(8000));lockView();
  try{await revoke;}
  catch{$('auth-message').textContent=t('已在此浏览器退出，请联网后重新登录。');}
  finally{loggingOut=false;$('lock').disabled=false;$('auth-submit').disabled=false;}
});
function applyDeploymentMode(){
  if(!cloudMode)return;
  $('book-toolbar').hidden=false;
  $('password-required').querySelector('option[value="off"]').disabled=true;
  $('connect-form').hidden=true;$('export-backup').hidden=false;
  $('database-label').hidden=true;document.body.classList.add('cloud-ledger');
  if(!$('cloud-settings')){
    const settings=document.createElement('details');settings.id='cloud-settings';settings.className='cloud-settings';
    const summary=document.createElement('summary');summary.dataset.i18n='设置';summary.textContent=t('设置');
    const panel=document.createElement('div');panel.className='cloud-settings-panel';
    $('connection').before(settings);settings.append(summary,panel);
    panel.append($('change-password'),$('export-backup'),$('lock'),document.querySelector('.language-picker'));
    panel.addEventListener('click',event=>{if(event.target.closest('button'))settings.open=false;});
    const quick=document.createElement('a');quick.id='cloud-quick-entry';quick.className='cloud-quick-entry';quick.href='#entry-card';quick.dataset.i18n='＋ 记一笔';quick.textContent=t('＋ 记一笔');document.querySelector('.sidebar').append(quick);
  }
  let tools=$('advanced-tools');
  if(!tools){
    tools=document.createElement('details');tools.id='advanced-tools';tools.className='advanced-tools';
    const summary=document.createElement('summary');summary.dataset.i18n='高级工具（SQL）';summary.textContent=t('高级工具（SQL）');tools.append(summary);
    $('sql-card').before(tools);tools.append($('sql-card'));
    document.querySelector('a[href="#sql-card"]').addEventListener('click',()=>{tools.open=true;});
  }
  const replace=(key,value)=>{document.querySelectorAll('[data-i18n]').forEach(el=>{if(el.dataset.i18n===key)el.textContent=t(value);});};
  replace('解锁账本','登录账本');replace('解锁','登录');replace('锁定账本','退出登录');
  replace('请输入访问密码。首次密码保存在启动窗口提示的本机文件中。','输入账本密码即可登录，电脑和手机通用。无需登录 Cloudflare。');
  replace('关闭密码后，本机打开账本无需登录。','云端账本需要保留访问密码，电脑和手机使用同一个密码。');
  replace('SQL 工作台默认允许查询、新增和修改账单，执行后自动更新列表与统计。','查询、新增和修改只作用于当前账本，切换账本后会自动切换。');
  replace('终端和界面共享同一数据库。','电脑和手机共用同一份云端账本。');
  document.querySelector('a[href="#sql-card"] .i18n-text').textContent=t('高级工具');
  replace('⌘ / Ctrl + Enter 执行 · 支持单独一行的 GO','⌘ / Ctrl + Enter 执行 · 云端 SQLite');
  replace('每次执行是独立会话；事务的 BEGIN、COMMIT / ROLLBACK 要在同一次执行中完成。结果最多显示 1,000 行。','支持 SELECT、INSERT 和 UPDATE；每条修改独立提交。结果最多显示 1,000 行。');
}
function renderBookOptions(){
  $('book-select').replaceChildren(...availableBooks.map(book=>new Option(book.name,String(book.id))));
  $('book-select').value=String(selectedBookId);
}
async function loadBooks(){
  const generation=authSeq;const result=await api('/api/books');if(!authenticated||generation!==authSeq)return;availableBooks=result.books;
  if(!availableBooks.some(book=>book.id===selectedBookId))selectedBookId=result.defaultBookId;
  booksLoaded=true;renderBookOptions();
  try{sessionStorage.setItem('montra.book',String(selectedBookId));}catch{}
}
async function switchBook(id){
  if(saving||editing||sqlRunning||addingBook){$('book-select').value=String(selectedBookId);return;}
  id=Number(id);if(id===selectedBookId)return;
  if(!availableBooks.some(book=>book.id===id))return;
  bookDrafts.set(selectedBookId,{amount:$('amount').value,date:$('date').value,category:$('category').value,note:$('note').value,type:$('entry-form').elements.type.value,sql:$('sql-code').value});
  selectedBookId=id;seq++;connected=false;lastState=null;lastSqlResult=null;lastOfflineError=null;sqlFeedback=null;formFeedback=null;
  try{sessionStorage.setItem('montra.book',String(id));}catch{}
  page=1;$('month').value=localToday().slice(0,7);$('all-months').checked=false;$('filter-type').value='';$('search').value='';
  $('filter-category').replaceChildren(new Option(t('全部类别'),''));
  const draft=bookDrafts.get(id)||{amount:'',date:localToday(),category:'',note:'',type:'e',sql:examples().list};
  for(const field of ['amount','date','category','note'])$(field).value=draft[field];$('entry-form').elements.type.value=draft.type;$('sql-code').value=draft.sql;
  for(const target of ['records','breakdown','sql-results','category-list','category-chips'])$(target).replaceChildren();
  for(const target of ['income','expense','net','all-net'])$(target).textContent='—';
  $('form-message').textContent='';$('sql-status').textContent='';$('record-count').textContent='—';$('page-info').textContent=t('每页 10 笔');
  $('page-prev').disabled=true;$('page-next').disabled=true;$('connection').textContent=t('正在切换账本…');$('connection').className='connection pending';
  renderBookOptions();saveAvailability();await refresh();
}
$('book-select').addEventListener('change',()=>switchBook($('book-select').value));
$('add-book').addEventListener('click',()=>{if(saving||editing||sqlRunning)return;$('book-form').reset();$('book-message').textContent='';bookRequestId=crypto.randomUUID();$('book-dialog').showModal();$('book-name').focus();});
$('book-name').addEventListener('input',()=>{bookRequestId=crypto.randomUUID();});
$('book-cancel').addEventListener('click',()=>$('book-dialog').close());
$('book-dialog').addEventListener('cancel',event=>{if(addingBook)event.preventDefault();});
$('book-form').addEventListener('submit',async event=>{
  event.preventDefault();if(addingBook)return;const name=$('book-name').value.trim();
  if(!name||name.length>40){$('book-message').textContent=t('账本名称需要 1–40 个字符。');return;}
  addingBook=true;saveAvailability();$('book-save').disabled=true;$('book-cancel').disabled=true;$('book-name').disabled=true;
  try{
    const book=await api('/api/books',{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify({name,requestId:bookRequestId})});
    if(!availableBooks.some(item=>item.id===book.id))availableBooks.push(book);
    $('book-dialog').close();addingBook=false;await switchBook(book.id);toast('账本已创建，可以开始记账了。');
  }catch(error){$('book-message').textContent=errorText(error);}
  finally{addingBook=false;saveAvailability();$('book-save').disabled=false;$('book-cancel').disabled=false;$('book-name').disabled=false;}
});
$('export-backup').addEventListener('click',async()=>{
  $('export-backup').disabled=true;
  try{const data=await api('/api/export?allBooks=1');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`montra-backup-${localToday()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch(error){toast(errorText(error));}finally{$('export-backup').disabled=false;}
});
function passwordFields(){
  const enabled=$('password-required').value==='on';
  $('current-password-field').hidden=!passwordEnabled;$('current-password').required=passwordEnabled;$('current-password').disabled=!passwordEnabled;
  for(const name of ['new-password','confirm-password']){$(`${name}-field`).hidden=!enabled;$(name).required=enabled;$(name).disabled=!enabled;}
}
$('password-required').addEventListener('change',passwordFields);
$('change-password').addEventListener('click',()=>{$('password-message').textContent='';$('password-form').reset();$('password-required').value=passwordEnabled?'on':'off';passwordFields();$('password-dialog').showModal();});
$('password-cancel').addEventListener('click',()=>$('password-dialog').close());
$('password-form').addEventListener('submit',async e=>{
  e.preventDefault();const enabled=$('password-required').value==='on';if(enabled&&$('new-password').value!==$('confirm-password').value){$('password-message').textContent=t('两次输入的新密码不一致。');return;}
  $('password-save').disabled=true;$('password-cancel').disabled=true;
  try{const result=await authPost('/api/auth/settings',{enabled,currentPassword:$('current-password').value,newPassword:$('new-password').value});passwordEnabled=result.passwordEnabled;storeToken(result.accessToken);$('lock').hidden=!passwordEnabled;$('password-form').reset();$('password-dialog').close();toast(passwordEnabled?'访问密码已修改，其他登录已失效。':'已关闭访问密码。');}
  catch(error){$('password-message').textContent=errorText(error);}
  finally{$('password-save').disabled=false;$('password-cancel').disabled=false;}
});
async function checkAuth(){if(loggingOut)return;const generation=++authSeq;try{const status=await api('/api/auth/status');if(generation!==authSeq)return;const firstCloud=status.cloud===true&&!cloudMode;cloudMode=status.cloud===true;applyDeploymentMode();if(firstCloud)$('sql-code').value=examples().list;passwordEnabled=status.passwordEnabled;$('lock').hidden=!passwordEnabled;if(status.authenticated){authenticated=true;if($('auth-dialog').open)$('auth-dialog').close();document.body.classList.remove('locked');refresh();}else lockView();}catch{if(generation===authSeq)lockView();}}
checkAuth();

// The SQL editor never auto-executes a template or a draft.
const examples=()=>cloudMode?{
  list:'SELECT * FROM jilu ORDER BY riqi DESC, id DESC LIMIT 50;',
  summary:"SELECT SUM(CASE WHEN type='i' THEN amount ELSE 0 END) AS total_income, SUM(CASE WHEN type='e' THEN amount ELSE 0 END) AS total_expense FROM jilu;",
  expense:"SELECT * FROM jilu WHERE type='e' AND category='eat' ORDER BY riqi DESC,id DESC LIMIT 50;",
  insert:`${t('-- 修改日期、金额、类别和备注后再执行。\n-- i = 收入，e = 支出；金额必须大于零。')}\nINSERT INTO jilu(riqi,type,amount,category,note) VALUES('${localToday()}','e',0.00,'eat','Your note');`,
  update:`${t('-- 请把 0 替换为已核对的账单编号，再修改备注内容。')}\nUPDATE jilu SET note='Your note' WHERE id=0;`
}:({
  list:"SELECT TOP (50) *\nFROM dbo.jilu\nORDER BY riqi DESC, id DESC;",
  summary:"SELECT\n    SUM(CASE WHEN type = 'i' THEN amount ELSE 0 END) AS total_income,\n    SUM(CASE WHEN type = 'e' THEN amount ELSE 0 END) AS total_expense,\n    SUM(CASE WHEN type = 'i' THEN amount ELSE -amount END) AS net_balance\nFROM dbo.jilu;",
  expense:"SELECT *\nFROM dbo.jilu\nWHERE type = 'e' AND category = 'eat'\nORDER BY riqi DESC, id DESC;",
  insert:`${t('-- 修改日期、金额、类别和备注后再执行。\n-- i = 收入，e = 支出；金额必须大于零。')}\nINSERT INTO dbo.jilu (riqi, type, amount, category, note)\nVALUES ('${localToday()}', 'e', 0.00, 'eat', 'Your note');`,
  update:`${t('-- 请把 0 替换为已核对的账单编号，再修改备注内容。')}\nUPDATE dbo.jilu\nSET note = N'Your note'\nWHERE id = 0;`
});
$('sql-example').addEventListener('change',()=>{const value=$('sql-example').value;if(examples()[value]){$('sql-code').value=examples()[value];$('sql-code').focus();}});
$('sql-clear').addEventListener('click',()=>{$('sql-code').value='';$('sql-example').value='';$('sql-code').focus();});
function renderSql(result){
  lastSqlResult=result;sqlFeedback=null;
  $('sql-results').replaceChildren();
  for(const [index,set]of result.recordsets.entries()){
    const block=document.createElement('section');block.className='sql-result';
    const heading=document.createElement('div');heading.className='sql-result-heading';heading.append(text('span',t('结果 {index} · 批次 {batch}',{index:index+1,batch:set.batch})),text('span',t('{count} 行',{count:set.rowCount})+(set.rows.length<set.rowCount?t(' · 显示 {count} 行',{count:set.rows.length}):'')));
    const scroll=document.createElement('div');scroll.className='sql-result-scroll';const table=document.createElement('table');const head=document.createElement('thead'),headRow=document.createElement('tr');for(const name of set.columns)headRow.append(text('th',name||t('未命名')));head.append(headRow);const body=document.createElement('tbody');for(const row of set.rows){const tr=document.createElement('tr');for(const value of row)tr.append(text('td',value===null?'NULL':String(value),value===null?'null':''));body.append(tr);}if(!set.rows.length){const tr=document.createElement('tr');const td=text('td',t('没有返回数据。'),'empty-text');td.colSpan=Math.max(1,set.columns.length);tr.append(td);body.append(tr);}table.append(head,body);scroll.append(table);block.append(heading,scroll);$('sql-results').append(block);
  }
  if(result.messages.length)$('sql-results').append(text('pre',result.messages.join('\n'),'sql-print'));
  if(result.notices?.length)$('sql-results').append(text('pre',result.notices.map(n=>t(n)).join('\n'),'sql-print'));
  const counts=result.rowsAffected.map(r=>t('批次 {batch}：{count} 行受影响',{batch:r.batch,count:r.count})).join('；');
  const details=[result.ok?t('执行完成。'):t('执行出错，后续批次已停止。'),counts,t('耗时 {ms} ms。',{ms:result.elapsedMs})];
  if(result.error)details.push(`${result.error.line?t('第 {line} 行：',{line:result.error.line}):''}${errorText(result.error)}`);
  if(result.truncated)details.push(t('结果已截断，可用 TOP 或 WHERE 缩小查询范围。'));
  if(!result.ok)details.push(t('已成功执行并提交的前面语句可能已生效，重试前请先查询核对。'));
  $('sql-status').textContent=details.filter(Boolean).join('\n');$('sql-status').classList.toggle('error',!result.ok);
}
async function executeEditor(){
  if(sqlRunning)return;
  if(!$('sql-code').value.trim()){setSqlStatus(t('先输入一段 SQL。'));return;}
  sqlRunning=true;saveAvailability();$('sql-run').disabled=true;$('sql-run').textContent=t('正在执行…');lastSqlResult=null;setSqlStatus(t('正在执行代码，请勿重复提交…'));
  try{const result=await api('/api/sql',{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify({code:$('sql-code').value})});if(!authenticated)return;renderSql(result);await refresh();}
  catch(error){setSqlStatus('执行结果未确认：{error}\n如果代码会修改账单，请先刷新核对，再决定是否重新执行。',true,{error:errorText(error)});await refresh();}
  finally{sqlRunning=false;saveAvailability();$('sql-run').disabled=false;$('sql-run').textContent=t('▶ 执行 SQL');}
}
$('sql-run').addEventListener('click',executeEditor);
$('sql-code').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();executeEditor();}else if(e.key==='Tab'){e.preventDefault();const box=e.target,start=box.selectionStart,end=box.selectionEnd;box.setRangeText('    ',start,end,'end');}});

function setSqlStatus(key,error=false,args={}){sqlFeedback={key:messageKey(key),error,args};$('sql-status').textContent=t(sqlFeedback.key,args);$('sql-status').classList.toggle('error',error);}
$('language').addEventListener('change',()=>{
  language=$('language').value;
  try{localStorage.setItem('montra.language',language);}catch{}
  const offlineError=lastOfflineError;
  applyStaticLanguage();applyDeploymentMode();
  if(lastState)render(lastState);
  if(offlineError)showOffline(offlineError);
  if(formFeedback){const f=formFeedback;const args={...f.args};if(args.error)args.error=t(messageKey(args.error));if(args.type)args.type=t(messageKey(args.type));message(f.key,f.error,args);}
  if(lastSqlResult)renderSql(lastSqlResult);
  else if(sqlFeedback){const f=sqlFeedback;const args={...f.args};if(args.error)args.error=t(messageKey(args.error));setSqlStatus(f.key,f.error,args);}
  $('save').textContent=saving?t('正在保存…'):t('＋ 保存账单');
  if(editingEntry)$('edit-title').textContent=t('修改账单 #{id}',{id:editingEntry.id});
  if(editFeedback){const f=editFeedback;const args={...f.args};if(args.error)args.error=t(messageKey(args.error));editMessage(f.key,args);}
  saveAvailability();
  $('sql-run').textContent=sqlRunning?t('正在执行…'):t('▶ 执行 SQL');
  toast('语言已切换');
});
applyStaticLanguage();

api('/api/health').then(info=>{$('app-version').textContent=`Montra ${info.releaseVersion || info.version}`;$('docker-advice').hidden=!info.dockerEnabled;}).catch(()=>{});
