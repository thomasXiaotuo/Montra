import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitBatches,runSql} from '../sql-console.mjs';
import {EventEmitter} from 'node:events';
test('GO 分批、报错行号与多行字符串',()=>{
  const batches=splitBatches("SELECT 1;\nGO\nSELECT 'hello\nGO\nworld';\nGO -- next\nSELECT 2;");
  assert.equal(batches.length,3);assert.equal(batches[1].startLine,3);assert.match(batches[1].code,/GO/);assert.equal(batches[2].startLine,7);
  assert.equal(splitBatches('/* outer\n/* nested */\nGO\n*/\nSELECT 1;').length,1);
  assert.equal(splitBatches('SELECT [hello\nGO\nworld];').length,1);
});
test('拒绝空输入、文件读取命令、GO 重复和超大代码',()=>{
  for(const code of ['',':r secrets.txt','GO 100','SELECT 1;\n'.repeat(2000),Array(22).fill('SELECT 1;').join('\nGO\n')])assert.throws(()=>splitBatches(code));
});
test('保留多结果、NULL 和重复列名；超限截断而不限制 SQL 写入行数',async()=>{
  const pool={request:()=>Object.assign(new EventEmitter(),{async batch(code){if(code.startsWith('IF @@TRANCOUNT'))return{recordset:[]};this.emit('recordset',[{name:'same'},{name:'same'}]);for(let i=0;i<1010;i++)this.emit('row',[i,null]);this.emit('rowsaffected',1010);},async query(){return{recordset:[]};}})};
  const result=await runSql(pool,splitBatches('SELECT 1;'));assert.equal(result.recordsets[0].rows.length,1000);assert.equal(result.recordsets[0].rowCount,1010);assert.equal(result.truncated,true);assert.deepEqual(result.recordsets[0].columns,['same','same']);assert.equal(result.recordsets[0].rows[0][1],null);
});
test('失败后停止后续批次，返回正确代码行号，并清理未完成事务',async()=>{
  let executions=0;
  const pool={request:()=>Object.assign(new EventEmitter(),{async batch(code){if(code.startsWith('IF @@TRANCOUNT'))return{recordset:[{rolled_back:1}]};executions++;if(executions===2)throw Object.assign(new Error('Invalid SQL'),{lineNumber:1});},async query(){return{recordset:[{rolled_back:1}]};}})};
  const result=await runSql(pool,splitBatches('SELECT 1;\nGO\nBAD;\nGO\nSELECT 3;'));assert.equal(executions,2);assert.equal(result.error.line,3);assert.equal(result.ok,false);assert.match(result.notices[0],/回滚/);
});
