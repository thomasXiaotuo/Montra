import { UserError } from './domain.mjs';

// Recognize GO only outside strings, quoted identifiers and nested block comments.
export function splitBatches(code) {
  if (typeof code !== 'string' || !code.trim()) throw new UserError('先输入一段 SQL。');
  if (Buffer.byteLength(code, 'utf8') > 12000) throw new UserError('SQL 最多 12 KB，请分段执行。');
  const batches = [];
  let buffer = [], quote = null, depth = 0, startLine = 1;
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    if (!quote && !depth && /^\s*GO\s*(?:--.*)?$/i.test(line)) {
      if (buffer.join('\n').trim()) batches.push({ code: buffer.join('\n'), startLine });
      buffer = []; startLine = lineNo + 2; continue;
    }
    if (!quote && !depth && /^\s*GO\s+\d+/i.test(line)) throw new UserError('这里支持单独一行的 GO，不支持 GO 后面的重复次数。');
    if (!quote && !depth && /^\s*[:!]/.test(line)) throw new UserError('这里只执行 SQL；不支持 :r、:RESET 或 shell 命令。直接编辑输入框即可。');
    buffer.push(line);
    for (let i = 0; i < line.length; i++) {
      const c = line[i], next = line[i + 1];
      if (depth) { if (c === '/' && next === '*') { depth++; i++; } else if (c === '*' && next === '/') { depth--; i++; } continue; }
      if (quote) {
        const close = quote === '[' ? ']' : quote;
        if (c === close) { if (next === close) i++; else quote = null; }
        continue;
      }
      if (c === '-' && next === '-') break;
      if (c === '/' && next === '*') { depth++; i++; continue; }
      if (c === "'" || c === '"' || c === '[') quote = c;
    }
  }
  if (buffer.join('\n').trim()) batches.push({ code: buffer.join('\n'), startLine });
  if (batches.length > 20) throw new UserError('一次最多执行 20 个 GO 批次。');
  return batches;
}

export async function runSql(pool, batches) {
  const recordsets = [], messages = [], notices = [], rowsAffected = [];
  let retainedRows = 0, retainedChars = 0;
  let failed = false, sqlError = null, omittedSets = false;
  const started = Date.now();
  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    const request = pool.request(); request.stream = true; request.arrayRowMode = true;
    const timeout = setTimeout(() => request.cancel(), Math.max(1,30000-(Date.now()-started)));
    let executionError;
    let current;
    request.on('recordset', columns => {
      current = { batch: index + 1, columns: columns.map(c => c.name || ''), rows: [], rowCount: 0 };
      if (recordsets.length < 20) recordsets.push(current); else omittedSets = true;
    });
    request.on('row', row => {
      if (!current) return;
      current.rowCount++;
      if (retainedRows >= 1000 || retainedChars >= 500000 || !recordsets.includes(current)) return;
      const values = row.map(v => {
        if (v == null) return null;
        if (v instanceof Date) return v.toISOString();
        if (Buffer.isBuffer(v)) return `0x${v.toString('hex').slice(0,1000)}`;
        const result = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return result.length > 4000 ? `${result.slice(0,4000)}…` : result;
      });
      retainedRows++; retainedChars += values.reduce((n,v)=>n+(v?.length || 0),0);
      current.rows.push(values);
    });
    request.on('info', info => { if (messages.length < 100) messages.push(info.message); });
    request.on('rowsaffected', count => { if (rowsAffected.length < 100) rowsAffected.push({ batch: index + 1, count }); });
    request.on('error', error => { executionError ??= error; });
    try { await request.batch(batch.code); if (executionError) throw executionError; }
    catch (error) {
      failed = true;
      sqlError = { message: error.message || 'SQL 执行失败。', batch: index + 1,
        line: error.lineNumber ? batch.startLine + error.lineNumber - 1 : null };
      break;
    } finally { clearTimeout(timeout); }
    if (Date.now() - started >= 30000) { failed = true; sqlError = {message:'执行超过 30 秒，后续批次未运行。',batch:index+1,line:null}; break; }
  }
  // A script's unfinished transaction must never leak into a later UI operation.
  try {
    const result = await pool.request().batch('IF @@TRANCOUNT > 0 BEGIN ROLLBACK TRANSACTION; SELECT 1 AS rolled_back; END');
    if (result.recordset?.[0]?.rolled_back) notices.push('脚本中的事务没有 COMMIT，已回滚。需要保存时请在同一次执行中完成 COMMIT。');
  } catch { notices.push('连接已结束，未提交的事务不会保留。'); }
  return { ok: !failed, recordsets, messages, notices, rowsAffected, error: sqlError, elapsedMs: Date.now() - started,
    truncated: omittedSets || retainedRows >= 1000 || retainedChars >= 500000 || recordsets.some(r=>r.rowCount>r.rows.length) };
}
