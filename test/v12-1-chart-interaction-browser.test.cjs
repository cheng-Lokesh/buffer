const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const siteRoot = path.resolve(__dirname, '../site');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

test('selecting a chart date changes its visible detail without changing confirmed reality', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await context.route('http://buffer-chart.test/**', (route) => {
      const requestPath = new URL(route.request().url()).pathname;
      const file = path.resolve(siteRoot, `.${requestPath === '/' ? '/index.html' : requestPath}`);
      if (!file.startsWith(siteRoot + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: contentTypes[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://buffer-chart.test/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '现在', exact: true }).click();
    await page.getByRole('button', { name: '开始设置' }).click();
    const baseline = page.getByRole('dialog', { name: '首次设置' });
    await baseline.getByRole('textbox', { name: '当前余额' }).fill('4000');
    await baseline.getByRole('textbox', { name: '保留金额' }).fill('1000');
    await baseline.getByRole('textbox', { name: /每日最低支出/ }).fill('30');
    await baseline.getByRole('button', { name: '下一步核对' }).click();
    await baseline.getByRole('button', { name: '确认保存' }).click();

    const nowChart = page.getByTestId('now-forecast-chart');
    const nowAxisLabels = await nowChart.locator('svg text').allTextContents();
    assert.ok(nowAxisLabels.some((label) => /\d{1,2}月\d{1,2}日/.test(label)), 'timeline must display calendar dates');
    assert.ok(nowAxisLabels.some((label) => label.includes('¥4,000')), 'timeline must pair a date with its balance');
    assert.ok(!nowAxisLabels.some((label) => /^\d+ 天$/.test(label)), 'timeline must not make users calculate dates from day counts');
    const initialDetail = await page.getByTestId('now-cash-inspector').innerText();
    await nowChart.click({ position: { x: 70, y: 120 } });
    const selectedDetail = await page.getByTestId('now-cash-inspector').innerText();
    assert.notEqual(selectedDetail, initialDetail, 'chart click must change the selected date and its details');
    assert.match(selectedDetail, /第 3 天|第 2 天|第 4 天/);
    await nowChart.focus();
    await page.keyboard.press('End');
    assert.match(await page.getByTestId('now-cash-inspector').innerText(), /第 90 天/);
    assert.match(await page.getByTestId('now-overview-metrics').innerText(), /¥4,000/);

    await page.getByRole('button', { name: '未来', exact: true }).click();
    const futureChart = page.getByTestId('future-chart-body');
    const futureAxisLabels = await futureChart.locator('svg text').allTextContents();
    assert.ok(futureAxisLabels.some((label) => /\d{1,2}月\d{1,2}日/.test(label)));
    assert.ok(futureAxisLabels.some((label) => label.includes('¥4,000')));
    await futureChart.click({ position: { x: 80, y: 120 } });
    assert.match(await page.getByTestId('future-selected-point').innerText(), /预计余额/);
    await futureChart.focus();
    await page.keyboard.press('End');
    assert.match(await page.getByTestId('future-selected-point').innerText(), /第 90 天/);
    await page.setViewportSize({ width: 320, height: 700 });
    const axis = futureChart.locator('svg .axis-date');
    assert.equal(await axis.count(), 3, 'narrow screens should keep a small set of readable date anchors');
    const boxes = await axis.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    assert.ok(boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right), 'date anchors must not overlap');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
});
