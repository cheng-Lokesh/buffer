const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

test('local bill import stays outside confirmed cash and disappears on reload', { timeout: 60000 }, async (t) => {
  const server = spawn(process.execPath, ['server/site-server.mjs', '8972'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('site timeout')), 15000);
    server.stdout.on('data', (data) => { if (String(data).includes('Buffer site running')) { clearTimeout(timeout); resolve(); } });
    server.once('exit', reject);
  });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const billRequests = [];
  page.on('request', (request) => { if (request.method() !== 'GET') billRequests.push(request.url()); });
  await page.goto('http://127.0.0.1:8972/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '开始设置' }).click();
  await page.getByLabel('当前余额').fill('4000');
  await page.getByLabel('保留金额').fill('1000');
  await page.getByLabel('每日最低支出').fill('30');
  await page.getByRole('button', { name: '下一步核对' }).click();
  await page.getByRole('button', { name: '确认保存' }).click();
  await page.locator('[data-page="rec"]').click();
  await page.getByRole('button', { name: '本机账单' }).click();
  await page.locator('[data-role="bill-file"]').setInputFiles({ name: 'bill.csv', mimeType: 'text/csv', buffer: Buffer.from('日期,收支,金额,类型,状态\n2026-09-01,支出,25,餐饮,成功') });
  await page.getByText('-¥25', { exact: true }).waitFor();
  await page.getByRole('button', { name: '计入观察' }).click();
  if (process.env.BUFFER_VISUAL_QA === '1') {
    const { mkdirSync } = require('node:fs');
    mkdirSync('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/bill-records-desktop.png', fullPage: true });
  }
  await page.locator('[data-page="now"]').click();
  await page.getByRole('button', { name: '账单观察' }).click();
  assert.equal(await page.locator('#page-now').getByText('已核对支出', { exact: true }).count(), 1);
  assert.match(await page.locator('.live-metrics').innerText(), /¥4,000/);
  assert.deepEqual(billRequests, [], 'bill must never be posted to the server');
  const desktop = await page.locator('.page.on').evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight }));
  assert.ok(desktop.scroll <= desktop.client + 1, `bill overview exceeds desktop viewport: ${JSON.stringify(desktop)}`);
  if (process.env.BUFFER_VISUAL_QA === '1') await page.screenshot({ path: 'output/playwright/bill-now-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'bill overview overflows mobile width');
  if (process.env.BUFFER_VISUAL_QA === '1') await page.screenshot({ path: 'output/playwright/bill-now-mobile.png', fullPage: true });
  await page.reload();
  assert.equal(await page.getByRole('button', { name: '账单观察' }).count(), 0);
  assert.ok(!JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes('bill-1'));
});
