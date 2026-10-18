import {UserError} from '../domain.mjs';
export function bookId(value=1){
  if(!/^[1-9]\d*$/.test(String(value))||Number(value)>2147483647)throw new UserError('账本编号无效。');
  return Number(value);
}
export function bookInput(data){
  const name=typeof data?.name==='string'?data.name.trim():'';
  if(!name||name.length>40||/[\u0000-\u001f\u007f]/.test(name))throw new UserError('账本名称需要 1–40 个字符。');
  if(typeof data?.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.requestId))throw new UserError('提交格式无效。');
  return {name,requestId:data.requestId};
}
export function cloudBooks(db){return {
  async list(){return (await db.prepare('SELECT id,name,created_at AS createdAt FROM books ORDER BY id').all()).results;},
  async get(id){const found=await db.prepare('SELECT id,name,created_at AS createdAt FROM books WHERE id=?').bind(bookId(id)).first();if(!found)throw new UserError('找不到这个账本，请重新选择。',404);return found;},
  async create(data){
    const {name,requestId}=bookInput(data);
    const previous=await db.prepare('SELECT id,name,created_at AS createdAt FROM books WHERE request_key=?').bind(requestId).first();
    if(previous){if(previous.name!==name)throw new UserError('添加请求已处理，请重新打开添加账本。',409);return previous;}
    try{
      const inserted=await db.prepare('INSERT INTO books(name,request_key) VALUES(?,?) ON CONFLICT(request_key) DO NOTHING RETURNING id,name,created_at AS createdAt').bind(name,requestId).first();
      if(inserted)return inserted;
      const replay=await db.prepare('SELECT id,name,created_at AS createdAt FROM books WHERE request_key=?').bind(requestId).first();
      if(replay?.name===name)return replay;
      throw new UserError('添加请求已处理，请重新打开添加账本。',409);
    }catch(error){
      if(error instanceof UserError)throw error;
      if(String(error.message).includes('UNIQUE constraint failed: books.name'))throw new UserError('已有同名账本，请换一个名称。',409);
      throw error;
    }
  }
};}
