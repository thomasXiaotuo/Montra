export class UserError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0,4) === '0000') throw new UserError('请选择有效日期。');
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw new UserError('日期不存在，请重新选择。');
  return value;
}
export function validateEntry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('提交格式无效。');
  const riqi = dateValue(body.riqi);
  if (!['i', 'e'].includes(body.type)) throw new UserError('请选择收入或支出。');
  const amount = String(body.amount ?? '').trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) throw new UserError('金额必须大于零，最多两位小数。');
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!category || category.length > 50) throw new UserError('类别不能为空，最多 50 个字符。');
  if (note.length > 200) throw new UserError('备注最多 200 个字符。');
  return { riqi, type: body.type, amount, category, note: note || null };
}
export function validateEntryId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value)>2147483647) throw new UserError('账单编号无效。');
  return Number(value);
}
export function validateEdit(body) {
  const entry=validateEntry(body);
  const original=body.original;
  // Keep the exact stored strings for conflict detection, including legacy whitespace.
  if (!original || typeof original!=='object' || Array.isArray(original) ||
      !['i','e'].includes(original.type) || typeof original.category!=='string' || original.category.length>50 ||
      !(original.note===null || typeof original.note==='string' && original.note.length<=200) ||
      !/^\d{1,8}(\.\d{1,2})?$/.test(String(original.amount)) || Number(original.amount)<=0) throw new UserError('原账单信息无效，请刷新后重新编辑。');
  dateValue(original.riqi);
  return {entry,original:{riqi:original.riqi,type:original.type,amount:String(original.amount),category:original.category,note:original.note}};
}
export function validateFilters(params) {
  const today = dateValue(params.get('today'));
  const month = params.get('month');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') || month.startsWith('0000') || month.startsWith('9999-12')) throw new UserError('请选择有效月份。');
  const start = dateValue(`${month}-01`);
  const d = new Date(`${start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth()+1);
  const end = d.toISOString().slice(0,10);
  const type = params.get('type') || '';
  if (!['', 'i', 'e'].includes(type)) throw new UserError('账单类型无效。');
  const category = params.get('category') || '';
  const q = params.get('q') || '';
  if (category.length > 50 || q.length > 200) throw new UserError('筛选内容过长。');
  const page = Number(params.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new UserError('页码无效。');
  return { today, month, start, end, type, category, q, page, all: params.get('all') === '1' };
}
export const literalSearch = value => `%${value.replace(/[~%_\[]/g, c => `~${c}`)}%`;
