import {UserError,literalSearch} from '../domain.mjs';
import {cloudBooks,bookId} from './books.mjs';
const amount=value=>(Math.round(Number(value)*100)/100).toFixed(2);
const fromCents=value=>(Number(value)/100).toFixed(2);
const row=value=>({...value,amount:amount(value.amount)});
export const columns='id,riqi,type,amount,category,note';
export function cloudDatabase(db,selected=1){
 const id=bookId(selected),books=cloudBooks(db);
 return {
  async readState(f){
    const book=await books.get(id);
    const filter="book_id=? AND (?=1 OR (riqi>=? AND riqi<?)) AND (?='' OR type=?) AND (?='' OR category=?) AND (category LIKE ? ESCAPE '~' OR coalesce(note,'') LIKE ? ESCAPE '~')";
    const values=[id,Number(f.all),f.start,f.end,f.type,f.type,f.category,f.category,literalSearch(f.q),literalSearch(f.q)];
    const result=await db.batch([
      db.prepare("SELECT coalesce(sum(CASE WHEN type='i' THEN cast(round(amount*100) AS INTEGER) ELSE 0 END),0) income,coalesce(sum(CASE WHEN type='e' THEN cast(round(amount*100) AS INTEGER) ELSE 0 END),0) expense FROM jilu WHERE book_id=? AND riqi>=? AND riqi<? AND riqi<=?").bind(id,f.start,f.end,f.today),
      db.prepare("SELECT coalesce(sum(CASE WHEN type='i' THEN cast(round(amount*100) AS INTEGER) ELSE -cast(round(amount*100) AS INTEGER) END),0) net FROM jilu WHERE book_id=? AND riqi<=?").bind(id,f.today),
      db.prepare('SELECT DISTINCT category FROM jilu WHERE book_id=? ORDER BY category').bind(id),
      db.prepare("SELECT category,sum(cast(round(amount*100) AS INTEGER)) amount FROM jilu WHERE book_id=? AND type='e' AND riqi>=? AND riqi<? AND riqi<=? GROUP BY category ORDER BY amount DESC").bind(id,f.start,f.end,f.today),
      db.prepare(`SELECT ${columns} FROM jilu WHERE ${filter} ORDER BY riqi DESC,id DESC LIMIT 10 OFFSET ?`).bind(...values,(f.page-1)*10),
      db.prepare(`SELECT count(*) total FROM jilu WHERE ${filter}`).bind(...values),
      db.prepare('SELECT id,name,created_at AS createdAt FROM books ORDER BY id')
    ]);
    const summary=result[0].results[0];
    return {database:'Cloud ledger',table:'jilu',book,books:result[6].results,summary:{income:fromCents(summary.income),expense:fromCents(summary.expense),net:fromCents(summary.income-summary.expense)},allNet:fromCents(result[1].results[0].net),categories:result[2].results.map(v=>v.category),breakdown:result[3].results.map(v=>({category:v.category,amount:fromCents(v.amount)})),rows:result[4].results.map(row),total:result[5].results[0].total,page:f.page,month:f.month,updatedAt:new Date().toISOString()};
  },
  async insertEntry(e){await books.get(id);return db.prepare('INSERT INTO jilu(riqi,type,amount,category,note,book_id) VALUES(?,?,?,?,?,?) RETURNING id').bind(e.riqi,e.type,Number(e.amount),e.category,e.note,id).first();},
  async updateEntry(entryId,e,o){
    await books.get(id);
    const changed=await db.prepare(`UPDATE jilu SET riqi=?,type=?,amount=?,category=?,note=?
      WHERE book_id=? AND id=? AND riqi=? AND type=? COLLATE BINARY AND amount=? AND category=? COLLATE BINARY AND note IS ? COLLATE BINARY RETURNING id`).bind(e.riqi,e.type,Number(e.amount),e.category,e.note,id,entryId,o.riqi,o.type,Number(o.amount),o.category,o.note).first();
    if(!changed)throw new UserError('账单已被修改或删除，请刷新后重新编辑。',409);
    return changed;
  },
  async exportRows(){await books.get(id);return (await db.prepare(`SELECT ${columns} FROM jilu WHERE book_id=? ORDER BY id`).bind(id).all()).results.map(row);},
  async exportAll(){const all=await books.list();const results=await db.batch(all.map(book=>db.prepare(`SELECT ${columns} FROM jilu WHERE book_id=? ORDER BY id`).bind(book.id)));return all.map((book,index)=>({...book,rows:results[index].results.map(row)}));}
};}
