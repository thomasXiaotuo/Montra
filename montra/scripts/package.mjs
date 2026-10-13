import {mkdtemp,mkdir,cp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=fileURLToPath(new URL('..',import.meta.url));
import {fileURLToPath} from 'node:url';
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const files=['package.json','package-lock.json','server.mjs','database.mjs','domain.mjs','sql-console.mjs','public','scripts','test','README.md','README.en.md','LICENSE','CONTRIBUTING.md','SECURITY.md','.gitignore','.env.example','compose.yaml','打开记账.command','start.command','.github'];
const temp=await mkdtemp(join(tmpdir(),'montra-source-'));
try{
  const folder=join(temp,'montra');await mkdir(folder);
  for(const name of files)await cp(join(root,name),join(folder,name),{recursive:true});
  await mkdir(join(root,'dist'),{recursive:true});
  const target=resolve(root,'dist',`montra-${version}-source.zip`);
  await rm(target,{force:true});
  await promisify(execFile)('python3',[join(root,'scripts','archive.py'),folder,target]);
  console.log(`源码包已生成：${target}\n采用文件白名单：不包含 .env、个人账单、截图、node_modules 或 Git 历史。`);
}finally{await rm(temp,{recursive:true,force:true});}
