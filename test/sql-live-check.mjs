// Uses SELECT and connection-local temporary objects only. No personal ledger rows are written.
import assert from 'node:assert/strict';
import {executeSql} from '../database.mjs';
const result=await executeSql(`SELECT 1 + 1 AS result, NULL AS empty_value;
GO
CREATE TABLE #console_test (amount decimal(10,2), note nvarchar(50));
INSERT INTO #console_test VALUES (12.34,N'O''Brien / 午饭');
GO
SELECT CONVERT(varchar(30),amount) AS amount,note FROM #console_test;
GO
BEGIN TRANSACTION;
INSERT INTO #console_test VALUES (5,N'will rollback');`);
assert.equal(result.ok,true);assert.equal(result.recordsets[0].rows[0][0],'2');assert.equal(result.recordsets[0].rows[0][1],null);
assert.deepEqual(result.recordsets[1].rows[0],['12.34',"O'Brien / 午饭"]);assert.ok(result.notices.some(m=>m.includes('回滚')));
const bad=await executeSql('SELECT 1;\nGO\nSELECT definitely_missing FROM dbo.jilu;\nGO\nSELECT 3;');assert.equal(bad.ok,false);assert.equal(bad.error.line,3);assert.equal(bad.recordsets.length,1);
const duplicate=await executeSql('SELECT 1 AS x, 2 AS x;');assert.deepEqual(duplicate.recordsets[0].columns,['x','x']);assert.deepEqual(duplicate.recordsets[0].rows[0],['1','2']);
const capped=await executeSql('SELECT TOP (1005) a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b;');assert.equal(capped.recordsets[0].rows.length,1000);assert.equal(capped.truncated,true);
console.log('PASS: SQL Server live SELECT, GO session continuity, temporary table writes, Unicode, unfinished transaction rollback, error lines, duplicate columns and result limit. No personal ledger rows written.');
