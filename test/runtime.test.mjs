import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {root,version,appPort,browserCommand,releaseVersion,dockerEnabled} from '../runtime.mjs';
import {npmCommand,probeService} from '../scripts/launch.mjs';
import {createApp} from '../server.mjs';

test('runtime rejects invalid ports and selects browser/installer for every platform',()=>{
  assert.equal(appPort('4321'),4321);
  assert.equal(appPort(''),3210);
  for(const port of ['0','-1','65536','abc','3.5'])assert.throws(()=>appPort(port));
  const url='http://127.0.0.1:4321';
  assert.deepEqual(browserCommand(url,'darwin'),['/usr/bin/open',[url]]);
  assert.deepEqual(browserCommand(url,'win32'),['rundll32.exe',['url.dll,FileProtocolHandler',url]]);
  assert.deepEqual(browserCommand(url,'linux'),['xdg-open',[url]]);
  assert.throws(()=>browserCommand('https://evil.example','win32'));
  assert.equal(npmCommand('win32')[1].at(-1),'npm ci --omit=dev --no-audit --no-fund');
  assert.equal(npmCommand('linux')[0],'npm');
  assert.equal(dockerEnabled({},'win32'),false);
  assert.equal(dockerEnabled({},'darwin'),true);
  assert.equal(dockerEnabled({},'linux'),false);
  assert.equal(dockerEnabled({SQL_USE_DOCKER:'0'},'linux'),false);
  assert.equal(dockerEnabled({SQL_USE_DOCKER:'1'},'win32'),true);
});
test('health reports the shared release and launcher reuses only a Montra server',async t=>{
  const server=createApp({},3214);
  await new Promise(resolve=>server.listen(3214,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const health=await probeService(url);
  assert.equal(health.version,version);
  assert.equal(health.releaseVersion,releaseVersion);
  assert.equal(health.platform,process.platform);
  const other=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"app":"other"}');});
  await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>other.close(resolve)));
  assert.equal(await probeService(`http://127.0.0.1:${other.address().port}`),false);
});
test('runtime resolves project files independently of the working directory',async()=>{
  const moduleUrl=new URL('../runtime.mjs',import.meta.url).href;
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',`const r=await import(${JSON.stringify(moduleUrl)});r.loadEnvironment();console.log(JSON.stringify({root:r.root,version:r.version}));`],{cwd:tmpdir()});
  assert.deepEqual(JSON.parse(stdout),{root,version});
});
