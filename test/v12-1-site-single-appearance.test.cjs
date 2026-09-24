const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const origin = 'http://127.0.0.1:8968';

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

test('one night appearance stays fixed on first use and after restoring a six-skin backup', { timeout: 60000 }, async (t) => {
  const server = spawn(process.execPath, ['server/site-server.mjs', '8968'], {
    cwd: root, env: { ...process.env, DEEPSEEK_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => server.kill());
  await waitForServer(server);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  assert.equal(await page.getByRole('combobox', { name: '选择界面风格' }).count(), 0);
  assert.equal(await page.locator('[data-role="skin-control"]').count(), 0);
  assert.equal(await page.locator('body').getAttribute('data-skin'), 'ink-contours');

  await page.getByRole('button', { name: '开始设置' }).click();
  await page.getByLabel('当前余额').fill('4000');
  await page.getByLabel('保留金额').fill('1000');
  await page.getByLabel('每日最低支出').fill('30');
  await page.getByRole('button', { name: '下一步核对' }).click();
  await page.getByRole('button', { name: '确认保存' }).click();

  await page.evaluate(() => {
    const key = 'buffer-zone.product.state.v1';
    const value = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...value, visualSkinId: 'wallet-weather' }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('body').getAttribute('data-skin'), 'ink-contours');

  const legacyBackup = await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('buffer-zone.product.state.v1'));
    return { ...value, visualSkinId: 'wallet-weather' };
  });
  await page.getByRole('button', { name: /^记录/ }).click();
  await page.locator('[data-role="backup-file"]').setInputFiles({
    name: 'old-buffer-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyBackup))
  });
  await page.getByRole('button', { name: '确认恢复' }).click();

  assert.equal(await page.locator('body').getAttribute('data-skin'), 'ink-contours');
  assert.equal(await page.getByRole('combobox', { name: '选择界面风格' }).count(), 0);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('buffer-zone.product.state.v1')));
  assert.equal(saved.visualSkinId, 'ink-contours');
  assert.equal(saved.cashReality.conditions.find((item) => item.type === 'balance').amount, 4000);
});
