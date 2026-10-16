import {detectLanguage,translate,localeFor,messageKey} from './i18n.js';
let savedLanguage;try{savedLanguage=localStorage.getItem('montra.language')||localStorage.getItem('xiaozhang.language');}catch{}
let language=detectLanguage(savedLanguage,navigator.languages||[navigator.language]);
const t=(key,args={})=>translate(key,args,language);
const errorText=error=>t(messageKey(error?.message||'无法连接，请稍后重试。'));
let lastState,lastSqlResult,lastOfflineError,formFeedback,sqlFeedback;
let editingEntry=null,editing=false,editFeedback=null;
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
$('month').value=localToday().slice(0,7);$('date').value=localToday();
function text(tag,content,className){const el=document.createElement(tag);el.textContent=content;if(className)el.className=className;return el;}
function message(key,error=false,args={}){formFeedback={key:messageKey(key),error,args};$('form-message').textContent=t(formFeedback.key,args);$('form-message').className=`form-message ${error?'error':'success'}`;}
function toast(content){$('toast').textContent=t(messageKey(content));$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
async function api(path,options={}){const res=await fetch(path,{...options,headers:{...options.headers,'X-Ledger-Language':language}});let data;try{data=await res.json();}catch{throw new Error(t('服务暂时不可用，请确认记账程序仍在运行。'));}if(!res.ok)throw new Error(data.error||t('操作失败，请重试。'));return data;}
function saveAvailability(){
  $('save').disabled=!connected||saving;
  $('edit-save').disabled=!connected||editing;
  $('edit-save').textContent=editing?t('正在保存…'):t('保存修改');
  $('edit-fields').disabled=editing;$('edit-cancel').disabled=editing;
  document.querySelectorAll('.edit-entry').forEach(button=>button.disabled=!connected);
}
function showOffline(error){lastOfflineError=error;connected=false;saveAvailability();$('connection').textContent=t('连接中断 · 数据可能未更新');$('connection').className='connection failed';$('offline').hidden=false;$('connection-error').textContent=errorText(error);}
function params(){return new URLSearchParams({today:localToday(),month:$('month').value,type:$('filter-type').value,category:$('filter-category').value,q:$('search').value,page:String(page),all:$('all-months').checked?'1':'0'});}
function render(data){
  lastState=data;lastOfflineError=null;
  if(data.database){$('database-label').textContent=`${data.database} / dbo.jilu`;$('sql-database').textContent=t('默认数据库 · {database}',{database:data.database});}
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
async function refresh(){const mine=++seq;try{const data=await api(`/api/state?${params()}`);if(mine!==seq)return;if(page>1&&!data.rows.length){page=1;return refresh();}render(data);}catch(error){if(mine===seq)showOffline(error);}}
$('entry-form').addEventListener('submit',async e=>{
  e.preventDefault();if(saving||!connected)return;
  const amount=$('amount').value.trim();if(!/^\d{1,8}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0){message(t('金额必须大于零，最多两位小数。'),true);$('amount').focus();return;}
  if(!$('date').value){message(t('请选择有效日期。'),true);$('date').focus();return;}
  if(!$('category').value.trim()){message(t('请填写类别。'),true);$('category').focus();return;}
  saving=true;saveAvailability();$('save').textContent=t('正在保存…');message('');
  let saved=false;
  try{const entry={riqi:$('date').value,type:$('entry-form').elements.type.value,amount,category:$('category').value.trim(),note:$('note').value.trim()};const result=await api('/api/entries',{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify(entry)});saved=true;$('amount').value='';$('note').value='';message(t('已保存 #{id} · {type} {amount}。'),false,{id:result.id,type:entry.type==='i'?t('收入'):t('支出'),amount:money(amount)});toast('账单已保存到 jilu');await refresh();$('amount').focus();}
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
setInterval(()=>{if(!document.hidden)refresh();},10000);refresh();

// The SQL editor never auto-executes a template or a draft.
let sqlRunning=false;
const examples=()=>({
  list:"SELECT TOP (50) *\nFROM dbo.jilu\nORDER BY riqi DESC, id DESC;",
  summary:"SELECT\n    SUM(CASE WHEN type = 'i' THEN amount ELSE 0 END) AS total_income,\n    SUM(CASE WHEN type = 'e' THEN amount ELSE 0 END) AS total_expense,\n    SUM(CASE WHEN type = 'i' THEN amount ELSE -amount END) AS net_balance\nFROM dbo.jilu;",
  expense:"SELECT *\nFROM dbo.jilu\nWHERE type = 'e' AND category = 'eat'\nORDER BY riqi DESC, id DESC;",
  insert:`${t('-- 修改日期、金额、类别和备注后再执行。\n-- i = 收入，e = 支出；金额必须大于零。')}\nINSERT INTO dbo.jilu (riqi, type, amount, category, note)\nVALUES ('${localToday()}', 'e', 0.00, 'eat', 'Your note');`
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
  sqlRunning=true;$('sql-run').disabled=true;$('sql-run').textContent=t('正在执行…');lastSqlResult=null;setSqlStatus(t('正在执行代码，请勿重复提交…'));
  try{const result=await api('/api/sql',{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify({code:$('sql-code').value})});renderSql(result);await refresh();}
  catch(error){setSqlStatus('执行结果未确认：{error}\n如果代码会修改账单，请先刷新核对，再决定是否重新执行。',true,{error:errorText(error)});await refresh();}
  finally{sqlRunning=false;$('sql-run').disabled=false;$('sql-run').textContent=t('▶ 执行 SQL');}
}
$('sql-run').addEventListener('click',executeEditor);
$('sql-code').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();executeEditor();}else if(e.key==='Tab'){e.preventDefault();const box=e.target,start=box.selectionStart,end=box.selectionEnd;box.setRangeText('    ',start,end,'end');}});

function setSqlStatus(key,error=false,args={}){sqlFeedback={key:messageKey(key),error,args};$('sql-status').textContent=t(sqlFeedback.key,args);$('sql-status').classList.toggle('error',error);}
$('language').addEventListener('change',()=>{
  language=$('language').value;
  try{localStorage.setItem('montra.language',language);}catch{}
  const offlineError=lastOfflineError;
  applyStaticLanguage();
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
