import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {publishedCloudUrl,browserCommand} from '../runtime.mjs';
import {writeCloudShortcut} from '../scripts/cloud-shortcut.mjs';
import {readFile} from 'node:fs/promises';
test('daily launcher opens only a verified cloud ledger, leaving unfinished setup in local mode',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'montra-cloud-launch-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await mkdir(join(directory,'.montra'));const file=join(directory,'.montra','cloud-deployment.json');
  const url='https://montra-test.montra-account.workers.dev';
  assert.equal(publishedCloudUrl(directory),null);
  await writeFile(file,JSON.stringify({url}));assert.equal(publishedCloudUrl(directory),null);
  await writeFile(file,JSON.stringify({url,verifiedAt:new Date().toISOString()}));assert.equal(publishedCloudUrl(directory),url);
  assert.deepEqual(browserCommand(url,'darwin'),['/usr/bin/open',[url]]);
  for(const target of ['https://evil.example','http://montra-test.montra-account.workers.dev','https://montra-test.montra-account.workers.dev/elsewhere','https://a.b.workers.dev@evil.example']){
    await writeFile(file,JSON.stringify({url:target,verifiedAt:'verified'}));assert.equal(publishedCloudUrl(directory),null);assert.throws(()=>browserCommand(target));
  }
});
test('release packages carry only the public ledger address and validate it before opening',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'montra-cloud-package-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const url='https://montra-test.montra-account.workers.dev';
  await writeFile(join(directory,'release.json'),JSON.stringify({cloudUrl:url}));
  assert.equal(publishedCloudUrl(directory),url);
  await writeCloudShortcut(directory,url);
  assert.ok((await readFile(join(directory,'open-ledger.html'),'utf8')).includes(`content="0;url=${url}"`));
  for(const cloudUrl of ['https://evil.example','https://a.b.workers.dev/\"><script>','https://a.b.workers.dev?password=abcd']){
    await writeFile(join(directory,'release.json'),JSON.stringify({cloudUrl}));assert.equal(publishedCloudUrl(directory),null);
    await assert.rejects(writeCloudShortcut(directory,cloudUrl));
  }
});
