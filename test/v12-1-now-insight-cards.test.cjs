const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const port = 8964;
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

test('Now replaces the duplicate chart with useful fact cards and only shows evidence-backed spending', { timeout: 60000 }, async (t) => {
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
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await confirmBaseline(page);

  const grid = page.getByTestId('now-insight-grid');
  await grid.waitFor();
  assert.equal(await grid.locator(':scope > article').count(), 6, 'the Now dashboard should show six distinct facts');
  for (const label of ['7 天后预计余额', '30 天后预计余额', '60 天后预计余额', '触及保留金额', '每日最低支出', '最近一笔变化']) {
    assert.equal(await grid.getByText(label, { exact: true }).count(), 1, `missing ${label} fact card`);
  }
  assert.equal(await grid.locator('svg').count(), 0, 'fact cards regress into a duplicate chart');
  assert.equal(await grid.getByText('近30天暂无收支记录', { exact: true }).count(), 1, 'absence of a complete ledger must not be shown as zero spending');
  assert.equal(await grid.getByText('90 天后预计余额', { exact: true }).count(), 0, 'the bottom cards repeat the 90-day amount in the main conclusion');
  assert.match(await grid.locator('article').nth(0).locator('strong').innerText(), /^¥/);
  assert.match(await grid.locator('article').nth(1).locator('strong').innerText(), /^¥/);
  assert.equal(await grid.getByText(/较现在少/).count(), 3, 'the forecast cards should show how much cash changes');
  assert.equal(await grid.getByText(/90 天后仍高于保留金额/).count(), 1, 'the reserve card should show the remaining margin');
  const inspector = page.locator('.live-space-now .reality-inspector');
  const outcome = page.locator('.live-space-now .now-outcome');
  assert.equal(await outcome.getByText('90天后预计余额', { exact: true }).count(), 1);
  assert.equal(await outcome.getByText('90天预计变化', { exact: true }).count(), 1);
  assert.match(await outcome.getByText('90天后预计余额', { exact: true }).locator('..').locator('strong').innerText(), /¥1,270/);
  assert.equal(await inspector.getByText('未来30天日常最低支出', { exact: true }).count(), 1);
  assert.equal(await inspector.getByText('30天后高于保留金额', { exact: true }).count(), 1);
  assert.equal(await inspector.getByText('近30天已记录收入', { exact: true }).count(), 0, 'empty actual-income rows should not crowd the panel');
  assert.equal(await inspector.getByText('近30天已记录支出', { exact: true }).count(), 0, 'empty actual-expense rows should not crowd the panel');

  const geometry = await page.locator('.page.on').evaluate((rootNode) => ({
    scrollHeight: rootNode.scrollHeight,
    clientHeight: rootNode.clientHeight,
    gridHeight: rootNode.querySelector('[data-testid="now-insight-grid"]')?.getBoundingClientRect().height,
    gridBottom: rootNode.querySelector('[data-testid="now-insight-grid"]')?.getBoundingClientRect().bottom,
    viewportHeight: window.innerHeight
  }));
  assert.ok(geometry.scrollHeight <= geometry.clientHeight + 1, `Now requires page scrolling: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.gridHeight >= 240, `the dashboard facts collapsed into a short stat strip: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.gridBottom >= geometry.viewportHeight * .8, `the lower section leaves most of the page empty: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.gridBottom <= geometry.viewportHeight + 1, `fact cards fall below the first screen: ${JSON.stringify(geometry)}`);

  if (process.env.BUFFER_VISUAL_QA === '1') {
    const { mkdirSync } = require('node:fs');
    mkdirSync(resolve(root, 'output/playwright'), { recursive: true });
    await page.screenshot({ path: resolve(root, 'output/playwright/now-rich-desktop.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 850 });
  const compactDesktop = await page.locator('.page.on').evaluate((node) => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
  assert.ok(compactDesktop.scrollHeight <= compactDesktop.clientHeight + 1, `Now overflows at 1280×850: ${JSON.stringify(compactDesktop)}`);
  await page.setViewportSize({ width: 375, height: 812 });
  const mobileWidth = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(mobileWidth.scrollWidth <= mobileWidth.viewport + 1, `Now overflows horizontally on mobile: ${JSON.stringify(mobileWidth)}`);
  if (process.env.BUFFER_VISUAL_QA === '1') {
    await page.screenshot({ path: resolve(root, 'output/playwright/now-rich-mobile.png'), fullPage: true });
    await grid.locator('article').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(root, 'output/playwright/now-rich-mobile-bottom.png') });
  }
  await page.setViewportSize({ width: 320, height: 700 });
  const narrowWidth = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(narrowWidth.scrollWidth <= narrowWidth.viewport + 1, `Now overflows at 320px: ${JSON.stringify(narrowWidth)}`);
  if (process.env.BUFFER_VISUAL_QA === '1') {
    await page.locator('.now-outcome').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(root, 'output/playwright/now-rich-narrow.png') });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(() => {
    const key = 'buffer-zone.product.state.v1';
    const value = JSON.parse(localStorage.getItem(key));
    const oldDate = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    value.cashReality.events.push({
      id: 'old-large-expense', name: '旧支出', type: 'expense', occurredAt: oldDate,
      amount: 500, createdAt: new Date().toISOString(), source: 'user_confirmed', captureSource: 'natural_language'
    });
    localStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();
  assert.equal(await grid.getByText('近30天暂无收支记录', { exact: true }).count(), 1, 'an old expense should not be presented as recent');

  await page.evaluate(() => {
    const key = 'buffer-zone.product.state.v1';
    const value = JSON.parse(localStorage.getItem(key));
    value.cashReality.events.push({
      id: 'confirmed-large-expense',
      name: '房租',
      type: 'expense',
      occurredAt: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()),
      amount: 500,
      createdAt: new Date().toISOString(),
      source: 'user_confirmed',
      captureSource: 'natural_language'
    });
    localStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();

  assert.equal(await grid.locator(':scope > article').count(), 6, 'confirmed spending fills an existing fact slot rather than growing the layout');
  assert.match(await grid.getByText('最近一笔变化', { exact: true }).locator('..').locator('strong').innerText(), /¥500/);
  assert.equal(await grid.getByText(/房租/).count(), 1, 'latest change omits the confirmed source name');
  assert.equal(await inspector.getByText('近30天已记录支出', { exact: true }).count(), 1);
  assert.match(await inspector.getByText('近30天已记录支出', { exact: true }).locator('..').locator('dd').innerText(), /¥500/);
  assert.equal(await inspector.getByText('近30天收支记录', { exact: true }).count(), 0);
});
