import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('platform entry works from another directory with Chinese/spaces, loads .env and exits on child failure',async t=>{
  const fixture=await mkdtemp(join(tmpdir(),'Montra 测试 space '));
  t.after(()=>rm(fixture,{recursive:true,force:true}));
  await mkdir(join(fixture,'scripts'));
  await mkdir(join(fixture,'node_modules','mssql'),{recursive:true});
  await writeFile(join(fixture,'node_modules','mssql','package.json'),'{}');
  await writeFile(join(fixture,'package.json'),'{"version":"1.3.0","type":"module"}');
  await writeFile(join(fixture,'.env'),'PORT=49876\nSQL_SERVER=example.invalid\nSQL_CONTAINER=custom-ledger\nMONTRA_FIXTURE_CONFIG=from-project-env\n');
  for(const name of ['runtime.mjs','scripts/launch.mjs',process.platform==='win32'?'start.cmd':'start.sh'])await copyFile(new URL(`../${name}`,import.meta.url),join(fixture,name));
  const resultPath=join(fixture,'result.json');
  await writeFile(join(fixture,'server.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(resultPath)},JSON.stringify({cwd:process.cwd(),port:process.env.PORT,container:process.env.SQL_CONTAINER,config:process.env.MONTRA_FIXTURE_CONFIG}));process.exitCode=Number(process.env.MONTRA_FIXTURE_EXIT||0);`);
  const env={...process.env,PORT:'49876',SQL_SERVER:'example.invalid',LEDGER_OPEN_BROWSER:'0'};
  delete env.SQL_CONTAINER;
  delete env.MONTRA_FIXTURE_CONFIG;
  const entry=process.platform==='win32'
    ? [process.env.ComSpec||'cmd.exe',['/d','/s','/c',`""${join(fixture,'start.cmd')}""`]]
    : ['/bin/sh',[join(fixture,'start.sh')]];
  const run=()=>{
    const result=promisify(execFile)(...entry,{cwd:tmpdir(),env,timeout:15000,windowsVerbatimArguments:process.platform==='win32'});
    result.child.stdin.end();
    return result;
  };
  await run();
  assert.deepEqual(JSON.parse(await readFile(resultPath,'utf8')),{cwd:fixture,port:'49876',container:'custom-ledger',config:'from-project-env'});
  if(process.platform==='win32'){
    // Exercise cmd.exe npm dispatch with a harmless installer fixture.
    await rm(join(fixture,'node_modules'),{recursive:true});
    const fakeBin=join(fixture,'fake-bin');await mkdir(fakeBin);
    await writeFile(join(fakeBin,'npm.cmd'),'@echo off\r\necho %* > "%~dp0installed.txt"\r\nexit /b 0\r\n');
    const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path')||'Path';
    env[pathKey]=`${fakeBin}${delimiter}${env[pathKey]||''}`;
    await run();
    assert.equal((await readFile(join(fakeBin,'installed.txt'),'utf8')).trim(),'ci --omit=dev --no-audit --no-fund');
  }
  // Child failures must propagate through the wrapper rather than report success.
  env.MONTRA_FIXTURE_EXIT='1';
  await assert.rejects(run(),error=>error.code===1);
});
