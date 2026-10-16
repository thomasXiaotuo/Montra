import {mkdtemp,mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {edition as sourceEdition} from '../runtime.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
import {fileURLToPath} from 'node:url';
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const files=['package.json','package-lock.json','server.mjs','runtime.mjs','database.mjs','domain.mjs','sql-console.mjs','public','scripts','test','docs','README.md','README.en.md','CHANGELOG.md','LICENSE','CONTRIBUTING.md','SECURITY.md','.gitignore','.env.example','compose.yaml','.github'];
const launchers={macos:['打开记账.command','start.command'],linux:['start.sh'],windows:['start.cmd','打开记账.cmd']};
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
    for(const name of files)await cp(join(root,name),join(folder,name),{recursive:true});
    const entries=edition==='source'?Object.values(launchers).flat():launchers[edition];
    for(const name of entries)await cp(join(root,name),join(folder,name));
    if(edition==='windows' || edition==='linux'){
      const template=await readFile(join(folder,'.env.example'),'utf8');
      await writeFile(join(folder,'.env.example'),template+`\n# ${edition} edition: native SQL Server, no Docker required.\nSQL_USE_DOCKER=0\n`);
    }
    const release={name:'Montra',version,edition,releaseVersion:`${version}-${edition}`};
    await writeFile(join(folder,'release.json'),JSON.stringify(release,null,2)+'\n');
    await writeFile(join(folder,'VERSION'),release.releaseVersion+'\n');
    if(edition!=='source')await cp(join(root,'docs',{macos:'macOS.md',linux:'Linux.md',windows:'Windows.md'}[edition]),join(folder,'使用说明.md'));
    const target=resolve(root,'dist',`montra-${version}-${edition}.zip`);
    await exec(python[0],[...python[1],join(root,'scripts','archive.py'),folder,target],{windowsHide:true});
    console.log(`Generated / 已生成：${target}`);
  }
  console.log('Source distributions: install Node.js and runtime dependencies on the target computer. No .env, databases, node_modules or Git history included. / 安装式源码包，不含密码、数据库、依赖和 Git 历史。');
}finally{await rm(temp,{recursive:true,force:true});}
