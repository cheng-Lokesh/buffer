const aliases = {
  date: ['交易时间', '日期', '交易日期', '时间'],
  direction: ['收支类型', '收支', '资金方向'],
  amount: ['金额', '交易金额', '收支金额'],
  category: ['交易类型', '类型', '类别'],
  status: ['交易状态', '状态']
};

const safeCategories = ['餐饮', '交通', '购物', '日用', '住房', '医疗', '教育', '娱乐', '工资', '奖金', '其他'];

function csvCells(input) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('CSV 引号不完整');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function parseAmount(value) {
  const clean = String(value || '').trim().replace(/[¥￥,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function parseDate(value) {
  const match = String(value || '').match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

function directionOf(value) {
  const text = String(value || '').trim();
  if (/^(支出|付款|出账|借)$/.test(text)) return 'expense';
  if (/^(收入|收款|入账|贷)$/.test(text)) return 'income';
  return 'unknown';
}

function reviewReason(type, status, direction, date, amount, duplicate) {
  if (!date || amount == null) return 'invalid_field';
  if (/失败|关闭|撤销|未支付|处理中/.test(status)) return 'failed';
  if (/退款|退货|退费/.test(type)) return 'refund';
  if (/转账|充值|提现|理财|信用卡还款/.test(type)) return 'transfer';
  if (direction === 'unknown') return 'unknown_direction';
  if (duplicate) return 'possible_duplicate';
  return undefined;
}

export function parseBillCsv(text, { source = '本机文件' } = {}) {
  if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('文件过大或无法读取');
  const table = csvCells(text.replace(/^\uFEFF/, ''));
  const headerIndex = table.findIndex((row) => ['date', 'direction', 'amount'].every((key) => row.some((cell) => aliases[key].includes(cell.trim()))));
  if (headerIndex < 0) throw new Error('未找到日期、收支和金额字段，请使用 CSV 文件');
  const headers = table[headerIndex].map((cell) => cell.trim());
  const col = Object.fromEntries(Object.entries(aliases).map(([key, candidates]) => [key, headers.findIndex((header) => candidates.includes(header))]));
  const seen = new Set();
  const safeSource = String(source).slice(0, 20).replace(/[<>"']/g, '') || '本机文件';
  const rows = table.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim())).slice(0, 10000).map((record, index) => {
    const date = parseDate(record[col.date]);
    const direction = directionOf(record[col.direction]);
    const amountCents = parseAmount(record[col.amount]);
    const type = col.category < 0 ? '' : String(record[col.category] || '').trim();
    const status = col.status < 0 ? '' : String(record[col.status] || '').trim();
    const signature = `${date}|${direction}|${amountCents}|${type}`;
    const duplicate = seen.has(signature);
    seen.add(signature);
    const reason = reviewReason(type, status, direction, date, amountCents, duplicate);
    const row = { id: `bill-${index + 1}`, date, direction, amountCents, category: safeCategories.includes(type) ? type : '未分类', source: safeSource, status: 'pending' };
    if (reason) row.reviewReason = reason;
    return row;
  });
  return { rows, headerFound: true };
}

export function setBillRowStatus(rows, id, status) {
  if (!['included', 'excluded', 'pending'].includes(status)) throw new Error('无效的核对状态');
  return rows.map((row) => row.id === id ? { ...row, status } : row);
}

export function includeClearBillRows(rows) {
  return rows.map((row) => row.status === 'pending' && !row.reviewReason && row.category !== '未分类'
    ? { ...row, status: 'included' }
    : row);
}

export function summarizeBillRows(rows) {
  const included = rows.filter((row) => row.status === 'included' && row.amountCents != null && row.date);
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  return {
    count: rows.length,
    includedCount: included.length,
    pendingCount: rows.filter((row) => row.status === 'pending').length,
    expenseCents: included.filter((row) => row.direction === 'expense').reduce((sum, row) => sum + row.amountCents, 0),
    incomeCents: included.filter((row) => row.direction === 'income').reduce((sum, row) => sum + row.amountCents, 0),
    startDate: dates[0] || null,
    endDate: dates.at(-1) || null,
    largestExpense: included.filter((row) => row.direction === 'expense').sort((a, b) => b.amountCents - a.amountCents)[0] || null
  };
}
