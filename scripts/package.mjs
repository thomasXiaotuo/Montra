import {mkdtemp,mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {edition as sourceEdition,publishedCloudUrl} from '../runtime.mjs';
import {writeCloudShortcut} from './cloud-shortcut.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
import {fileURLToPath} from 'node:url';
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const files=['package.json','package-lock.json','server.mjs','auth.mjs','private-store.mjs','database-security.mjs','runtime.mjs','database.mjs','domain.mjs','sql-console.mjs','public','cloud','scripts','test','docs','README.md','README.en.md','CHANGELOG.md','LICENSE','CONTRIBUTING.md','SECURITY.md','.gitignore','.env.example','compose.yaml','.github'];
const launchers={macos:['launch.command','start.command','publish-cloud.command','publish-cloud.sh'],linux:['start.sh','publish-cloud.sh'],windows:['start.cmd','launch.cmd','publish-cloud.cmd']};
const exec=promisify(execFile);
let python;
for(const [command,args] of (process.platform==='win32' ? [['py',['-3']],['python',[]],['python3',[]]] : [['python3',[]],['python',[]]])){
  try{await exec(command,[...args,'-c','import sys; assert sys.version_info >= (3, 9)'],{windowsHide:true});python=[command,args];break;}catch{}
}
if(!python)throw new Error('Packaging requires Python 3.9+. / 打包需要 Python 3.9 或更新版本。');
const temp=await mkdtemp(join(tmpdir(),'montra-source-'));
try{
  await mkdir(join(root,'dist'),{recursive:true});
  for(const edition of (sourceEdition === 'source' ? ['source','macos','linux','windows'] : [sourceEdition])){
    const folder=join(temp,`montra-${version}-${edition}`);await mkdir(folder);
    for(const name of files)await cp(join(root,name),join(folder,name),{recursive:true,filter:path=>basename(path)!=='.wrangler'});
    const entries=edition==='source'?Object.values(launchers).flat():launchers[edition];
    for(const name of entries)await cp(join(root,name),join(folder,name));
    if(edition==='windows' || edition==='linux'){
      const template=await readFile(join(folder,'.env.example'),'utf8');
      await writeFile(join(folder,'.env.example'),template+`\n# ${edition} edition: native SQL Server, no Docker required.\nSQL_USE_DOCKER=0\n`);
    }
    const cloudUrl=publishedCloudUrl(root);
    const release={name:'Montra',version,edition,releaseVersion:`${version}-${edition}`,...(cloudUrl?{cloudUrl}:{})};
    if(cloudUrl)await writeCloudShortcut(folder,cloudUrl);
    await writeFile(join(folder,'release.json'),JSON.stringify(release,null,2)+'\n');
    await writeFile(join(folder,'VERSION'),release.releaseVersion+'\n');
    if(cloudUrl){
      const entry={macos:'start.command',windows:'start.cmd',linux:'start.sh',source:'open-ledger.html'}[edition];
      await writeFile(join(folder,'USER_GUIDE.md'),`# Montra ${release.releaseVersion}\n\n1. 完整解压后，打开 open-ledger.html 或 ${entry}。只需浏览器和网络，无需安装数据库、Node.js 或 Docker。Linux 脚本需要 xdg-open，也可用浏览器打开 HTML。\n2. 输入原来的账本密码，点击“登录”。无需登录 Cloudflare。\n3. 选择账本或点击“＋ 添加账本”，电脑和手机共享记录。\n4. 点击“设置 → 退出登录”退出当前浏览器。退出会清除本页未保存的草稿；云端账单保留，其他设备继续登录。\n5. 点击“设置 → 导出备份”保存所有账本。\n\n账本网址：${cloudUrl}\n\n安装包仅含公开网址，不含密码、账单、登录状态或 Cloudflare 凭据。当前为一个私有登录管理多本账本。可选的本机模式见 docs 中的系统说明，本机与云端不持续双向同步。\n`);
    }else if(edition!=='source')await cp(join(root,'docs',{macos:'macOS.md',linux:'Linux.md',windows:'Windows.md'}[edition]),join(folder,'USER_GUIDE.md'));
    const target=resolve(root,'dist',`montra-${version}-${edition}.zip`);
    await exec(python[0],[...python[1],join(root,'scripts','archive.py'),folder,target],{windowsHide:true});
    console.log(`Generated / 已生成：${target}`);
  }
  console.log('Connected cloud packages open directly in a browser; local mode requires Node.js and SQL Server. No passwords, records, sessions, .env or Git history included. / 已连接的云端包可直接用浏览器打开；本机模式需另行安装。安装包不含密码、账单或登录状态。');
}finally{await rm(temp,{recursive:true,force:true});}
