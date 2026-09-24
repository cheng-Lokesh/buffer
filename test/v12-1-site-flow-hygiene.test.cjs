const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const port = 8963;
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

async function confirmBaseline(page) {
  await page.getByRole('button', { name: '开始设置' }).click();
  await page.getByLabel('当前余额').fill('4000');
  await page.getByLabel('保留金额').fill('1000');
  await page.getByLabel('每日最低支出').fill('30');
  await page.getByRole('button', { name: '下一步核对' }).click();
  await page.getByRole('button', { name: '确认保存' }).click();
}

test('every space keeps only useful information and every supporting control stays in its proper flow', { timeout: 60000 }, async (t) => {
  const server = spawn(process.execPath, ['server/site-server.mjs', String(port)], {
    cwd: root,
    env: { ...process.env, DEEPSEEK_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => server.kill());
  await waitForServer(server);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(origin);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  assert.equal(await page.locator('#uiwrap>main>header').isVisible(), false, 'decorative fake search and notification chrome still consumes the product header');
  assert.equal(await page.getByText('还没有可用的金额信息').count(), 0, 'first run repeats the same empty-state message');
  const emptyHeight = await page.getByTestId('reality-empty').locator('.live-empty').evaluate((node) => node.getBoundingClientRect().height);
  assert.ok(emptyHeight <= 300, `first-run action is buried in a ${emptyHeight}px empty card`);

  await confirmBaseline(page);

  assert.equal(await page.getByTestId('now-future-preview').count(), 0, 'Now duplicates the complete Future space');
  assert.equal(await page.locator('.page.on').getByText('收支记录', { exact: true }).count(), 0, 'Now shows a zero-value record row');
  assert.equal(await page.locator('.page.on').getByText('待确认事项', { exact: true }).count(), 0, 'Now shows a zero-value pending row');

  await page.getByRole('button', { name: '更新情况' }).click();
  const captureDialog = page.getByRole('dialog');
  assert.equal(await captureDialog.getAttribute('aria-label'), '更新情况');
  assert.equal(await captureDialog.getByText('我会先整理给你核对，你确认后才会保存。').count(), 0, 'capture repeats the confirmation rule');
  assert.equal(await captureDialog.getByLabel('变化内容').count(), 1, 'capture field does not use a direct label');
  await page.keyboard.press('Escape');
  assert.equal(await captureDialog.count(), 0, 'Escape does not close the modal');

  await page.getByRole('button', { name: '更新情况' }).click();
  await page.getByRole('button', { name: '直接修改金额' }).click();
  const preciseDialog = page.getByRole('dialog');
  assert.equal(await preciseDialog.getAttribute('aria-label'), '修改金额');
  await preciseDialog.getByLabel('选择项目').selectOption('reserve');
  assert.equal(await preciseDialog.getByLabel('新的金额').inputValue(), '1000', 'changing the precise item leaves the previous item amount in the field');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '更新情况' }).click();
  await page.getByLabel('变化内容').fill('余额 4500');
  await page.getByRole('button', { name: '整理给我核对' }).click();
  await page.getByRole('button', { name: '修改' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: '金额' }).fill('4600');
  await page.getByRole('button', { name: '保存修改' }).click();
  await page.getByRole('button', { name: '取消' }).click();
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('buffer-zone.product.state.v1'))).cashReality.conditions.find((item) => item.type === 'balance').amount, 4000, 'cancelled candidate edit changed Reality');

  await page.getByRole('button', { name: /^未来/ }).click();
  assert.equal(await page.getByTestId('future-events').count(), 0, 'Future renders a full empty-event section');
  await page.getByRole('button', { name: '30 天' }).click();
  assert.equal(await page.getByRole('button', { name: '30 天' }).getAttribute('aria-pressed'), 'true', 'horizon selection does not update');
  assert.equal(await page.getByRole('heading', { name: '未来 30 天的资金变化' }).count(), 1, 'horizon selection does not update the forecast');
  const scenarioSnapshots = await page.evaluate(() => JSON.parse(localStorage.getItem('buffer-zone.product.state.v1')).cashReality.realitySnapshots.length);
  await page.getByRole('button', { name: '试算变化' }).click();
  assert.equal(await page.getByRole('dialog').getAttribute('aria-label'), '试算变化');
  await page.getByRole('dialog').getByLabel('金额').fill('200');
  await page.getByRole('button', { name: '查看试算结果' }).click();
  assert.equal(await page.locator('.scenario-strip').count(), 1, 'scenario result is not displayed');
  await page.getByRole('button', { name: '保存这次试算' }).click();
  assert.equal(await page.locator('.scenario-strip').count(), 0, 'saved scenario remains as an active unsaved result');
  const scenarioState = await page.evaluate(() => JSON.parse(localStorage.getItem('buffer-zone.product.state.v1')).cashReality);
  assert.equal(scenarioState.scenarioDrafts.length, 1, 'saved scenario draft is missing');
  assert.equal(scenarioState.realitySnapshots.length, scenarioSnapshots, 'saving a scenario draft creates a false financial history snapshot');

  await page.getByRole('button', { name: /^依据/ }).click();
  assert.equal(await page.getByTestId('conditions-groups').locator(':scope > section').count(), 1, 'Conditions renders three empty category columns');

  await page.getByRole('button', { name: /^记录/ }).click();
  assert.equal(await page.locator('.record-skin-section').count(), 0, 'appearance settings still interrupt the records flow');
  const skin = page.locator('[data-role="skin-control"] select');
  assert.equal(await skin.count(), 1, 'appearance settings are not available in the supporting sidebar');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('buffer-zone.product.state.v1')).cashReality.realitySnapshots.length);
  await skin.selectOption('pixel-garden');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('buffer-zone.product.state.v1')).cashReality.realitySnapshots.length);
  assert.equal(after, before, 'changing appearance creates a false financial history snapshot');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出备份' }).click()
  ]);
  assert.match(download.suggestedFilename(), /^buffer-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '恢复备份' }).click();
  await chooserPromise;
});
