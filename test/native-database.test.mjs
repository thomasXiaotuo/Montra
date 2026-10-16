import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('native mode never invokes Docker, including when the SQL password is missing',async()=>{
  const databaseUrl=new URL('../database.mjs',import.meta.url).href;
  const code=`
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    let calls=0;
    childProcess.execFile=()=>{calls++;throw new Error('Unexpected Docker invocation');};
    syncBuiltinESMExports();
    process.env.SQL_USE_DOCKER='0';process.env.SQL_DATABASE='montra_native_fixture';process.env.SQL_USER='test_app';
    delete process.env.SQL_PASSWORD;
    const {connectionConfig}=await import(${JSON.stringify(databaseUrl)});
    await assert.rejects(connectionConfig(),error=>error.status===503);
    process.env.SQL_PASSWORD='isolated-test-value';
    assert.equal((await connectionConfig()).password,'isolated-test-value');
    process.env.SQL_SERVER='db.example.invalid';
    assert.equal((await connectionConfig()).options.trustServerCertificate,false);
    process.env.SQL_SERVER='127.0.0.1';
    assert.equal((await connectionConfig()).options.trustServerCertificate,true);
    process.env.SQL_USER='sa';
    await assert.rejects(connectionConfig(),error=>error.status===503);
    process.env.SQL_USER='test_app';process.env.SQL_USE_DOCKER='1';delete process.env.SQL_PASSWORD;
    await assert.rejects(connectionConfig(),error=>error.status===503);
    assert.equal(calls,0);
  `;
  await promisify(execFile)(process.execPath,['--input-type=module','-e',code]);
});
