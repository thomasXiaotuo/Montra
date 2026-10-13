export class UserError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0,4) === '0000') throw new UserError('请选择有效日期。');
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw new UserError('日期不存在，请重新选择。');
  return value;
}
export function validateEntry(body) {
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
