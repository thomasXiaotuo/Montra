import {UserError} from '../domain.mjs';
import {splitBatches} from '../sql-console.mjs';
import {scopeSql} from './sql-scope.mjs';

// Parse statement boundaries before validating the complete script. A rejected
// trailing statement must not leave a preceding UPDATE committed.
export function cloudStatements(code){
  const statements=[];
  for(const [batchIndex,batch] of splitBatches(code).entries()){
    let start=0,line=batch.startLine,statementLine=line,tokens=[];
    function finish(end){
      if(tokens.length){
        const first=tokens[0];
        const target=(offset)=>tokens[offset]?.kind==='identifier'&&tokens[offset].value.toLowerCase()==='jilu';
        const word=(offset,value)=>tokens[offset]?.kind==='word'&&tokens[offset].value===value;
        const allowed=word(0,'SELECT')||word(0,'INSERT')&&word(1,'INTO')&&target(2)&&tokens[3]?.value!=='.'||word(0,'UPDATE')&&target(1)&&word(2,'SET');
        if(!allowed)throw new UserError('云端 SQL 仅支持 SELECT 查询，以及对 jilu 的 INSERT 和 UPDATE。');
        statements.push({code:batch.code.slice(start,end).trim(),kind:first.value,batch:batchIndex+1,line:statementLine});
      }
      tokens=[];start=end+1;statementLine=line;
    }
    for(let i=0;i<batch.code.length;){
      const c=batch.code[i],next=batch.code[i+1];
      if(/\s/.test(c)){if(c==='\n')line++;i++;continue;}
      if(c==='-'&&next==='-'){while(i<batch.code.length&&batch.code[i]!=='\n')i++;continue;}
      if(c==='/'&&next==='*'){
        const end=batch.code.indexOf('*/',i+2);if(end<0)throw new UserError('SQL 注释没有结束。');
        line+=(batch.code.slice(i,end+2).match(/\n/g)||[]).length;i=end+2;continue;
      }
      if(c===';'){finish(i);i++;continue;}
      if(!tokens.length)statementLine=line;
      if(c==="'"||c==='"'||c==='`'||c==='['){
        const close=c==='['?']':c;let value='',closed=false;i++;
        while(i<batch.code.length){const q=batch.code[i++];if(q==='\n')line++;if(q===close){if(batch.code[i]===close){value+=close;i++;}else{closed=true;break;}}else value+=q;}
        if(!closed)throw new UserError('SQL 引号没有结束。');
        tokens.push({kind:c==="'"?'string':'identifier',value});continue;
      }
      const match=/^[A-Za-z_][A-Za-z0-9_]*/.exec(batch.code.slice(i));
      if(match){const value=match[0];tokens.push({kind:/^(SELECT|INSERT|INTO|UPDATE|SET)$/i.test(value)?'word':'identifier',value:/^(SELECT|INSERT|INTO|UPDATE|SET)$/i.test(value)?value.toUpperCase():value});i+=value.length;continue;}
      tokens.push({kind:'symbol',value:c});i++;
    }
    finish(batch.code.length);
  }
  if(statements.length>20)throw new UserError('云端 SQL 每次最多执行 20 条语句。');
  return statements;
}
export async function executeCloudSql(db,code,selected=1){
  const statements=cloudStatements(code).map(statement=>({...statement,code:scopeSql(statement.code,selected)})),recordsets=[],rowsAffected=[];
  let retained=0,chars=0,truncated=false,error=null;
  const started=Date.now();
  for(const statement of statements){
    try{
      if(statement.kind==='SELECT'){
        const raw=await db.prepare(`SELECT * FROM (${statement.code}\n) LIMIT 1001`).raw({columnNames:true});
        const columns=raw.shift()||[],rows=[];
        for(const values of raw){
          if(retained>=1000||chars>=500000){truncated=true;break;}
          const row=values.map(v=>v===null?null:String(v).slice(0,4000));
          rows.push(row);retained++;chars+=row.reduce((n,v)=>n+(v?.length||0),0);
        }
        recordsets.push({batch:statement.batch,columns,rows,rowCount:raw.length});
      }else{
        const result=await db.prepare(statement.code).run();rowsAffected.push({batch:statement.batch,count:result.meta.changes});
      }
    }catch(failure){error={message:failure.message||'SQL execution failed.',batch:statement.batch,line:statement.line};break;}
  }
  return {ok:!error,recordsets,rowsAffected,messages:[],notices:[],truncated,error,elapsedMs:Date.now()-started};
}
