import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEntry,validateFilters,literalSearch,validateEdit,validateEntryId,UserError} from '../domain.mjs';
const entry={riqi:'2026-10-01',type:'e',amount:'14.48',category:'eat',note:'Lunch'};
test('账本金额上限、分、零和负数',()=>{
  assert.equal(validateEntry({...entry,amount:'99999999.99'}).amount,'99999999.99');
  assert.equal(validateEntry({...entry,amount:'0.01'}).amount,'0.01');
  for(const amount of ['0','-1','1.001','100000000','NaN','1e3','1; DROP TABLE jilu'])assert.throws(()=>validateEntry({...entry,amount}));
});
test('修改校验保留原值并限制编号与输入',()=>{
  const original={...entry,category:' eat ',note:' Lunch '};
  const changed=validateEdit({...entry,amount:'1.25',note:'',original});
  assert.deepEqual(changed.original,original);assert.equal(changed.entry.note,null);
  assert.equal(validateEntryId('2147483647'),2147483647);
  for(const value of [null,[],undefined])assert.throws(()=>validateEntry(value),UserError);
  for(const original of [null,{},[],{...entry,amount:'0'},{...entry,note:42}])assert.throws(()=>validateEdit({...entry,original}),UserError);
});
test('真实日期与闰年',()=>{
  assert.equal(validateEntry({...entry,riqi:'2024-02-29'}).riqi,'2024-02-29');
  for(const riqi of ['2026-02-29','2026-04-31','2026-13-01','0000-01-01'])assert.throws(()=>validateEntry({...entry,riqi}));
});
test('类型、长度与中文备注',()=>{
  assert.throws(()=>validateEntry({...entry,type:'income'}));assert.throws(()=>validateEntry({...entry,category:'   '}));
  assert.throws(()=>validateEntry({...entry,note:'a'.repeat(201)}));
  assert.equal(validateEntry({...entry,note:' 午饭 '}).note,'午饭');
  assert.equal(validateEntry({...entry,note:''}).note,null);
});
test('按月跨年与搜索通配符按字面处理',()=>{
  const f=validateFilters(new URLSearchParams({today:'2026-10-13',month:'2026-12'}));assert.equal(f.end,'2027-01-01');
  assert.equal(literalSearch("50%_off[~'"),"%50~%~_off~[~~'%");
  assert.throws(()=>validateFilters(new URLSearchParams({today:'2026-10-13',month:'2026-13'})));
});
