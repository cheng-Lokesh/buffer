import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBillCsv, summarizeBillRows, setBillRowStatus, includeClearBillRows } from '../src/bill-observation.js';

test('parses quoted CSV locally and discards private identifying columns', () => {
  const csv = '\uFEFF交易时间,收支类型,金额,交易类型,交易状态,商户,交易单号\n2026-09-01 12:00:00,支出,¥25.50,餐饮,交易成功,"张三,咖啡",secret-123\n';
  const result = parseBillCsv(csv, { source: '微信支付' });
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], { id: 'bill-1', date: '2026-09-01', direction: 'expense', amountCents: 2550, category: '餐饮', source: '微信支付', status: 'pending' });
  assert.ok(!JSON.stringify(result).includes('secret-123'));
  assert.ok(!JSON.stringify(result).includes('张三'));
});

test('unknown, transfers, refunds, failed entries and potential duplicates require review', () => {
  const csv = '日期,收支,金额,类型,状态\n2026-09-01,支出,30,餐饮,成功\n2026-09-01,支出,30,餐饮,成功\n2026-09-02,支出,100,转账,成功\n2026-09-03,收入,20,退款,成功\n2026-09-04,收入,80,工资,失败\n2026-09-05,不明,15,其他,成功';
  const { rows } = parseBillCsv(csv, { source: '本机文件' });
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row.status === 'pending'));
  assert.equal(rows[1].reviewReason, 'possible_duplicate');
  assert.equal(rows[2].reviewReason, 'transfer');
  assert.equal(rows[3].reviewReason, 'refund');
  assert.equal(rows[4].reviewReason, 'failed');
  assert.equal(rows[5].reviewReason, 'unknown_direction');
  assert.equal(summarizeBillRows(rows).expenseCents, 0);
});

test('only user-confirmed rows affect bill observations, never Reality', () => {
  const original = [{ id: 'one', date: '2026-09-01', direction: 'expense', amountCents: 3000, category: '餐饮', source: '本机文件', status: 'pending' }];
  const changed = setBillRowStatus(original, 'one', 'included');
  assert.equal(original[0].status, 'pending');
  assert.equal(summarizeBillRows(changed).expenseCents, 3000);
  assert.equal(summarizeBillRows(changed).pendingCount, 0);
  assert.equal(summarizeBillRows(setBillRowStatus(changed, 'one', 'excluded')).expenseCents, 0);
});

test('rejects unmapped CSV and malformed amounts without treating them as zero', () => {
  assert.throws(() => parseBillCsv('foo,bar\na,b', { source: '本机文件' }), /字段/);
  const { rows } = parseBillCsv('日期,收支,金额\n2026-09-01,支出,not-money', { source: '本机文件' });
  assert.equal(rows[0].amountCents, null);
  assert.equal(rows[0].status, 'pending');
  assert.equal(summarizeBillRows(rows).expenseCents, 0);
});

test('rejects malformed quoting and impossible dates', () => {
  assert.throws(() => parseBillCsv('日期,收支,金额\n"2026-09-01,支出,20'), /引号/);
  const { rows } = parseBillCsv('日期,收支,金额\n2026-02-30,支出,20\n2026-09-02,收入,¥3.25');
  assert.equal(rows[0].date, null);
  assert.equal(rows[0].reviewReason, 'invalid_field');
  assert.equal(rows[1].amountCents, 325);
  assert.equal(rows[1].direction, 'income');
});

test('bulk review includes only clear classified entries, leaving uncertain entries pending', () => {
  const { rows } = parseBillCsv('日期,收支,金额,类型\n2026-09-01,支出,25,餐饮\n2026-09-02,支出,30,转账\n2026-09-03,支出,10,神秘用途');
  const reviewed = includeClearBillRows(rows);
  assert.deepEqual(reviewed.map((row) => row.status), ['included', 'pending', 'pending']);
  assert.equal(summarizeBillRows(reviewed).expenseCents, 2500);
});
