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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });
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
    const nowReadout = nowChart.locator('.tip');
    await page.getByTestId('now-chart-lookup-toggle').click();
    const nowLookup = page.getByTestId('now-chart-lookup');
    assert.equal(await page.getByTestId('now-chart-lookup-toggle').innerText(), '查某天余额');
    assert.equal(await nowLookup.getByRole('button', { name: '7天后', exact: true }).isVisible(), true);
    await nowLookup.getByRole('button', { name: '7天后', exact: true }).click();
    assert.equal(await nowChart.getAttribute('aria-valuenow'), '7');
    assert.equal(await nowLookup.isVisible(), true, 'date lookup should stay open after choosing a date');
    assert.match(await nowLookup.getByRole('status').innerText(), /预计余额.*¥3,760/);
    assert.equal(await nowLookup.locator('input[type="date"]').count(), 0, 'date lookup should not open a system calendar');
    const nowMonth = nowLookup.getByLabel('月份');
    const nowDay = nowLookup.getByLabel('日期', { exact: true });
    assert.equal(await nowDay.isDisabled(), false, 'date lookup starts from the selected chart date');
    assert.equal(await nowLookup.getByLabel(/余额降到/).isVisible(), false, 'date and amount tasks should not compete');
    const firstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    const requestedDate = new Date(`${firstDate}T12:00:00Z`);
    requestedDate.setUTCDate(requestedDate.getUTCDate() + 17);
    const requestedIso = requestedDate.toISOString().slice(0, 10);
    await nowMonth.selectOption(requestedIso.slice(0, 7));
    assert.equal(await nowDay.isDisabled(), false);
    assert.ok((await nowDay.locator('option').evaluateAll((options) => options.map((item) => item.value))).includes(requestedIso));
    await nowDay.selectOption(requestedIso);
    assert.equal(await nowChart.getAttribute('aria-valuenow'), '17', 'entering a date should select that exact forecast day');
    const expectedCalendarDate = `${Number(requestedIso.slice(0,4))}年${Number(requestedIso.slice(5,7))}月${Number(requestedIso.slice(8))}日`;
    assert.ok((await nowLookup.getByRole('status').innerText()).includes(expectedCalendarDate), 'selected China date must not shift on an overseas device');
    assert.match(await page.getByTestId('now-cash-inspector').innerText(), /第 17 天/);
    if (process.env.BUFFER_CHART_CAPTURE) {
      fs.mkdirSync(path.resolve(__dirname, '../output/playwright'), { recursive: true });
      await page.screenshot({ path: path.resolve(__dirname, '../output/playwright/chart-lookup-desktop.png') });
    }
    await page.getByTestId('now-chart-balance-toggle').click();
    await nowLookup.getByLabel(/余额降到/).fill('2501');
    await nowLookup.getByRole('button', { name: '查看日期' }).click();
    assert.equal(await nowChart.getAttribute('aria-valuenow'), '49', 'balance lookup should select first day at or below the target');
    assert.equal(await nowLookup.isVisible(), true, 'balance lookup should keep its answer visible');
    assert.match(await nowLookup.getByRole('status').innerText(), /首次.*¥2,500/);
    await nowLookup.getByLabel(/余额降到/).fill('100');
    await nowLookup.getByRole('button', { name: '查看日期' }).click();
    assert.match(await nowLookup.getByRole('status').innerText(), /90 天内未达到/);
    assert.equal(await nowChart.getAttribute('aria-valuenow'), '49', 'a missing balance must not silently select a different point');
    assert.equal(await nowReadout.isVisible(), true);
    assert.match(await nowReadout.innerText(), /\d{4}年\d{1,2}月\d{1,2}日[\s\S]*¥/);
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
    await page.getByTestId('future-chart-lookup-toggle').click();
    const futureLookup = page.getByTestId('future-chart-lookup');
    const futureFirstDate = firstDate;
    const futureRequestedDate = new Date(`${futureFirstDate}T12:00:00Z`);
    futureRequestedDate.setUTCDate(futureRequestedDate.getUTCDate() + 23);
    const futureRequestedIso = futureRequestedDate.toISOString().slice(0, 10);
    await futureLookup.getByLabel('月份').selectOption(futureRequestedIso.slice(0, 7));
    await futureLookup.getByLabel('日期', { exact: true }).selectOption(futureRequestedIso);
    assert.equal(await futureChart.getAttribute('aria-valuenow'), '23');
    await futureLookup.getByRole('button', { name: '关闭查询' }).click();
    assert.equal(await futureLookup.isVisible(), false);
    await page.locator('[data-action="horizon"][data-value="30"]').click();
    await page.getByTestId('future-chart-lookup-toggle').click();
    const boundedDates = await futureLookup.getByLabel('月份').locator('option').evaluateAll((options) => options.map((item) => item.value));
    for (const month of boundedDates) {
      await futureLookup.getByLabel('月份').selectOption(month);
      const choices = await futureLookup.getByLabel('日期', { exact: true }).locator('option').evaluateAll((options) => options.map((item) => item.value));
      assert.ok(choices.every((date) => date >= firstDate && date <= new Date(new Date(`${firstDate}T12:00:00Z`).getTime() + 30 * 86400000).toISOString().slice(0, 10)));
    }
    await page.locator('[data-action="horizon"][data-value="90"]').click();
    await page.getByTestId('future-chart-balance-toggle').click();
    await futureLookup.getByLabel(/余额降到/).fill('2501');
    await futureLookup.getByRole('button', { name: '查看日期' }).click();
    assert.equal(await futureChart.getAttribute('aria-valuenow'), '49');
    const futureReadout = page.getByTestId('future-chart-readout');
    assert.equal(await futureReadout.isVisible(), true, 'future chart should show a date and balance on the plot before any click');
    assert.match(await futureReadout.innerText(), /\d{4}年\d{1,2}月\d{1,2}日[\s\S]*¥/);
    const futureAxisLabels = await futureChart.locator('svg text').allTextContents();
    assert.ok(futureAxisLabels.some((label) => /\d{1,2}月\d{1,2}日/.test(label)));
    assert.ok(futureAxisLabels.some((label) => label.includes('¥4,000')));
    await futureChart.click({ position: { x: 80, y: 120 } });
    assert.match(await page.getByTestId('future-selected-point').innerText(), /预计余额/);
    assert.match(await futureReadout.innerText(), /预计余额[\s\S]*¥/);
    await futureChart.focus();
    await page.keyboard.press('End');
    assert.match(await page.getByTestId('future-selected-point').innerText(), /第 90 天/);
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await futureReadout.isVisible(), true, 'selected point must remain readable on narrow phones');
    const readoutInsideChart = await futureChart.evaluate((chart) => {
      const plot = chart.getBoundingClientRect();
      const label = chart.querySelector('[data-testid="future-chart-readout"]').getBoundingClientRect();
      return label.left >= plot.left - 1 && label.right <= plot.right + 1 && label.top >= plot.top - 1;
    });
    assert.equal(readoutInsideChart, true, 'selected point label must stay inside the chart');
    const axis = futureChart.locator('svg .axis-date');
    assert.equal(await axis.count(), 3, 'narrow screens should keep a small set of readable date anchors');
    const boxes = await axis.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    assert.ok(boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right), 'date anchors must not overlap');
    await page.getByTestId('future-chart-lookup-toggle').click();
    assert.equal(await futureLookup.isVisible(), true, 'narrow phones should expose the direct lookup');
    const lookupInsideViewport = await futureLookup.evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight;
    });
    assert.equal(lookupInsideViewport, true, 'lookup must fit narrow phones');
    if (process.env.BUFFER_CHART_CAPTURE) {
      await page.screenshot({ path: path.resolve(__dirname, '../output/playwright/chart-lookup-mobile.png') });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.resolve(__dirname, '../output/playwright/chart-lookup-mobile-375.png') });
      await page.setViewportSize({ width: 320, height: 700 });
    }
    await futureLookup.getByLabel('月份').press('Escape');
    assert.equal(await futureLookup.isVisible(), false);
    assert.equal(await page.getByTestId('future-chart-lookup-toggle').getAttribute('aria-expanded'), 'false');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
});
