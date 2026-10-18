import {UserError,dateValue,validateEntryId,validateEntry} from '../domain.mjs';
export function sqlString(value){return value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";}
export function normalizeRows(rows){
  if(!Array.isArray(rows))throw new UserError('Invalid ledger backup.');
  const ids=new Set();
  return rows.map(row=>{
    const id=validateEntryId(row.id);if(ids.has(id))throw new UserError('Duplicate ledger ID.');ids.add(id);
    dateValue(row.riqi);validateEntry(row);
    return {id,riqi:row.riqi,type:row.type,amount:Number(row.amount).toFixed(2),category:row.category,note:row.note??null};
  }).sort((a,b)=>a.id-b.id);
}
export function ledgerImportSql(rows){
  const normalized=normalizeRows(rows);
  if(!normalized.length)return '-- Empty ledger.\n';
  return 'INSERT INTO jilu(id,riqi,type,amount,category,note) VALUES\n'+normalized.map(row=>`(${row.id},${sqlString(row.riqi)},${sqlString(row.type)},${row.amount},${sqlString(row.category)},${sqlString(row.note)})`).join(',\n')+';\n';
}
