const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const port = 8961;
const origin = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('site_server_timeout')), 15000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Buffer site running')) {
        clearTimeout(timer);
        resolveReady();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`site_server_exited_${code}`));
    });
  });
}

test('first-run reality confirmation becomes the persisted source of every space', { timeout: 60000 }, async (t) => {
  const server = spawn(process.execPath, ['server/site-server.mjs', String(port)], {
    cwd: root,
    env: { ...process.env, DEEPSEEK_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => server.kill());
  await waitForServer(server);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(origin);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await assert.doesNotReject(() => page.getByTestId('reality-empty').waitFor());
  await page.getByRole('button', { name: '开始设置' }).click();
  await page.getByLabel('当前余额').fill('24800');
  await page.getByLabel('保留金额').fill('5000');
  await page.getByLabel('每日最低支出').fill('340');
  await page.getByRole('button', { name: '下一步核对' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('buffer-zone.product.state.v1')), null);
  await page.getByRole('button', { name: '确认保存' }).click();

  await assert.doesNotReject(() => page.getByText('¥24,800').first().waitFor());
  assert.ok(await page.evaluate(() => localStorage.getItem('buffer-zone.product.state.v1')));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

  await page.reload();
  await assert.doesNotReject(() => page.getByText('¥24,800').first().waitFor());
  await page.getByRole('button', { name: '更新情况' }).click();
  await page.getByLabel('变化内容').fill('余额 4360');
  await page.getByRole('button', { name: '整理给我核对' }).click();
  await assert.doesNotReject(() => page.getByText('¥4,360').waitFor());
  const beforeConfirm = JSON.parse(await page.evaluate(() => localStorage.getItem('buffer-zone.product.state.v1')));
  assert.equal(beforeConfirm.cashReality.conditions.find((item) => item.type === 'balance').amount, 24800);
  await page.getByRole('button', { name: '确认保存' }).click();

  const afterConfirm = JSON.parse(await page.evaluate(() => localStorage.getItem('buffer-zone.product.state.v1')));
  assert.equal(afterConfirm.cashReality.conditions.find((item) => item.type === 'balance').amount, 4360);
  for (const name of ['未来', '依据', '记录']) {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await assert.doesNotReject(() => page.locator('.page.on').waitFor());
  }
});
