import sqlite from 'node-sql-parser/build/sqlite.js';
import {UserError} from '../domain.mjs';
import {bookId} from './books.mjs';
const parser=new sqlite.Parser();
const allowedColumns=new Set(['id','riqi','type','amount','category','note']);
const number=value=>({type:'number',value});
const error=()=>new UserError('SQL 工作台仅操作当前账本的 jilu；请使用 SELECT、INSERT 或 UPDATE。');
function ledgerTarget(source){return source&&!source.db&&typeof source.table==='string'&&source.table.toLowerCase()==='jilu';}
function quoteAliases(code){
  // The parser reserves words such as COUNT even when SQLite accepts them as
  // aliases. Quote explicit aliases, while preserving CAST(... AS INTEGER).
  let out='',previous='',alias=false;const frames=[];
  for(let i=0;i<code.length;){
    const c=code[i],next=code[i+1];
    if(c==='-'&&next==='-'){const end=code.indexOf('\n',i);const stop=end<0?code.length:end;out+=code.slice(i,stop);i=stop;continue;}
    if(c==='/'&&next==='*'){const end=code.indexOf('*/',i+2);const stop=end<0?code.length:end+2;out+=code.slice(i,stop);i=stop;continue;}
    if(c==="'"||c==='"'||c==='`'||c==='['){
      const close=c==='['?']':c;out+=c;i++;while(i<code.length){const q=code[i++];out+=q;if(q===close){if(code[i]===close)out+=code[i++];else break;}}
      previous='';alias=false;continue;
    }
    const word=/^[A-Za-z_][A-Za-z0-9_]*/.exec(code.slice(i));
    if(word){const value=word[0];out+=alias?'"'+value+'"':value;alias=value.toUpperCase()==='AS'&&frames.at(-1)!=='CAST';previous=value.toUpperCase();i+=value.length;continue;}
    if(c==='('){frames.push(previous==='CAST'?'CAST':'');previous='';alias=false;}else if(c===')'){frames.pop();previous='';alias=false;}else if(!/\s/.test(c)){previous='';alias=false;}
    out+=c;i++;
  }
  return out;
}
function identifier(value){if(value!=='*'&&!/^[\p{L}\p{N}_ .-]+$/u.test(value))throw error();}
function strictIdentifiers(sql){
  // SQLite treats unknown double-quoted identifiers as string literals. Emit
  // backticks so a misspelled column fails instead of silently running later writes.
  let out='';
  for(let i=0;i<sql.length;i++){
    if(sql[i]==="'"){
      out+=sql[i++];for(;i<sql.length;i++){out+=sql[i];if(sql[i]==="'"){if(sql[i+1]==="'"){out+=sql[++i];}else break;}}
    }else if(sql[i]==='"'){
      let name='';while(++i<sql.length&&sql[i]!=='"')name+=sql[i];identifier(name);out+='`'+name+'`';
    }else out+=sql[i];
  }
  return out;
}

export function scopeSql(code,selected){
  const id=bookId(selected);let ast;
  try{ast=parser.astify(quoteAliases(code));}catch{throw new UserError('无法解析这段云端 SQL，请检查语法。');}
  if(Array.isArray(ast)){if(ast.length!==1)throw error();ast=ast[0];}
  if(!['select','insert','update'].includes(ast?.type)||ast.with?.length)throw error();
  // Transform every original nested SELECT, including joins and UNION branches,
  // before inserting trusted book-filtered sources. Strings are never rewritten.
  function walk(node){
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach(walk);return;}
    if(node.type==='double_quote_string'){node.type='column_ref';node.column=node.value;node.table=null;delete node.value;}
    for(const key of ['as','column','table','db'])if(typeof node[key]==='string')identifier(node[key]);
    for(const value of Object.values(node))walk(value);
    if(node.type==='select'){
      if(node.with?.length)throw error();
      node.from=node.from?.map(source=>{
        if(source.expr?.ast?.type==='select'&&!source.table&&!source.db)return source;
        if(!ledgerTarget(source))throw error();
        const inner=parser.astify(`SELECT id,riqi,type,amount,category,note FROM jilu WHERE book_id=${id}`);
        return {...source,table:undefined,db:undefined,expr:{ast:inner,parentheses:true},as:source.as||'jilu'};
      })??node.from;
    }
  }
  walk(ast);
  if(ast.type==='update'){
    if(ast.table?.length!==1||!ledgerTarget(ast.table[0])||ast.from||ast.set.some(item=>!allowedColumns.has(item.column?.toLowerCase())))throw error();
    const predicate={type:'binary_expr',operator:'=',left:{type:'column_ref',table:ast.table[0].as||'jilu',column:'book_id'},right:number(id)};
    ast.where=ast.where?{type:'binary_expr',operator:'AND',left:{...ast.where,parentheses:true},right:predicate}:predicate;
  }
  if(ast.type==='insert'){
    if(ast.table?.length!==1||!ledgerTarget(ast.table[0])||!Array.isArray(ast.columns)||ast.columns.some(column=>!allowedColumns.has(column.toLowerCase()))||new Set(ast.columns.map(c=>c.toLowerCase())).size!==ast.columns.length||ast.values?.type!=='values'||ast.on_duplicate_update)throw error();
    for(const row of ast.values.values){if(row.type!=='expr_list'||row.value.length!==ast.columns.length)throw error();row.value.push(number(id));}
    ast.columns.push('book_id');
  }
  // book_id is intentionally absent from all SELECT sources and cannot be set.
  return strictIdentifiers(parser.sqlify(ast));
}
