import assert from 'node:assert/strict';
import sql from 'mssql';
import {getPool,readState} from '../database.mjs';
import {validateFilters} from '../domain.mjs';
const today=process.env.CHECK_TODAY||'2026-10-13';
const f=validateFilters(new URLSearchParams({today,month:today.slice(0,7)}));
const pool=await getPool();
try{
  const {recordset:rows}=await pool.request().query('SELECT CONVERT(char(10),riqi,23) AS riqi,type,CONVERT(varchar(50),amount) AS amount,category FROM dbo.jilu');
  const state=await readState(f);
  const cents=s=>{const [a,b='']=String(s).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0').slice(0,2));};
  const decimal=n=>{const neg=n<0n;if(neg)n=-n;return `${neg?'-':''}${n/100n}.${String(n%100n).padStart(2,'0')}`;};
  const monthly=rows.filter(r=>r.riqi>=f.start&&r.riqi<f.end&&r.riqi<=today);
  const income=monthly.filter(r=>r.type==='i').reduce((s,r)=>s+cents(r.amount),0n);
  const expense=monthly.filter(r=>r.type==='e').reduce((s,r)=>s+cents(r.amount),0n);
  assert.equal(decimal(income),state.summary.income);assert.equal(decimal(expense),state.summary.expense);assert.equal(decimal(income-expense),state.summary.net);
  const net=rows.filter(r=>r.riqi<=today).reduce((s,r)=>s+(r.type==='i'?cents(r.amount):-cents(r.amount)),0n);assert.equal(decimal(net),state.allNet);
  for(const r of state.breakdown){const sum=monthly.filter(x=>x.type==='e'&&x.category===r.category).reduce((s,x)=>s+cents(x.amount),0n);assert.equal(decimal(sum),r.amount);}
  const calendarRows=rows.filter(r=>r.riqi>=f.start&&r.riqi<f.end);
  assert.equal(state.daily.length,new Set(calendarRows.map(r=>r.riqi)).size);
  for(const day of state.daily)for(const [field,type] of [['income','i'],['expense','e']]){
    assert.equal(day[field],decimal(calendarRows.filter(r=>r.riqi===day.riqi&&r.type===type).reduce((sum,r)=>sum+cents(r.amount),0n)));
  }
  const filteredState=await readState({...f,q:'no matching transaction calendar check',page:2});
  assert.deepEqual(filteredState.daily,state.daily);
  console.log('PASS: calendar daily totals verified against all monthly rows; filters and pagination do not affect calendar.');
  // Driver round-trip only. SELECT does not insert a row.
  const check=await pool.request().input('amount',sql.Decimal(10,2),14.48).input('category',sql.NVarChar(50),"O'Brien / 餐饮").query('SELECT CONVERT(varchar(30),@amount) AS amount, @category AS category');
  assert.equal(check.recordset[0].amount,'14.48');assert.equal(check.recordset[0].category,"O'Brien / 餐饮");
  console.log(`PASS: existing database connected, ${rows.length} records read, monthly income/expense/net, cumulative net and category sums verified independently; decimal and Unicode parameters verified. No rows written.`);
}finally{await pool.close();}
