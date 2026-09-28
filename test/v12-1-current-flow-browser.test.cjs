const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const siteRoot = path.resolve(__dirname, '../site');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

test('current site keeps edit, scenario, record and bill paths connected', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    await context.route('http://buffer-flow.test/**', (route) => {
      const requestPath = new URL(route.request().url()).pathname;
      const file = path.resolve(siteRoot, `.${requestPath === '/' ? '/index.html' : requestPath}`);
      if (!file.startsWith(siteRoot + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: contentTypes[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://buffer-flow.test/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: '现在', exact: true }).click();
    await page.getByRole('button', { name: '开始设置' }).click();
    const baseline = page.getByRole('dialog', { name: '首次设置' });
    await baseline.getByRole('textbox', { name: '当前余额' }).fill('4000');
    await baseline.getByRole('textbox', { name: '保留金额' }).fill('1000');
    await baseline.getByRole('textbox', { name: /每日最低支出/ }).fill('30');
    await baseline.getByRole('button', { name: '下一步核对' }).click();
    await baseline.getByRole('button', { name: '返回修改' }).click();
    assert.equal(await baseline.getByRole('textbox', { name: '当前余额' }).inputValue(), '4000');
    assert.equal(await baseline.getByRole('textbox', { name: '保留金额' }).inputValue(), '1000');
    assert.equal(await baseline.getByRole('textbox', { name: /每日最低支出/ }).inputValue(), '30');
    await baseline.getByRole('button', { name: '下一步核对' }).click();
    await baseline.getByRole('button', { name: '确认保存' }).click();
    await page.getByRole('heading', { name: '你的现金航向' }).waitFor();

    await page.getByRole('button', { name: '依据', exact: true }).click();
    const emptyConditionHeight = await page.locator('#page-cond .condition-group.group-2').evaluate((element) => element.getBoundingClientRect().height);
    assert.ok(emptyConditionHeight < 140, `empty condition should not fill a ${emptyConditionHeight}px card`);
    await page.getByRole('button', { name: '修改当前余额' }).click();
    const edit = page.getByRole('dialog', { name: '修改金额' });
    await edit.getByRole('button', { name: '下一步核对' }).click();
    assert.match(await edit.innerText(), /金额没有变化/);
    await edit.getByRole('textbox', { name: '新的金额（元）' }).fill('4001');
    await edit.getByRole('button', { name: '下一步核对' }).click();
    assert.match(await edit.innerText(), /原金额[\s\S]*新金额/);
    await edit.getByRole('button', { name: '返回修改' }).click();
    assert.equal(await edit.getByRole('textbox', { name: '新的金额（元）' }).inputValue(), '4001');
    await edit.getByRole('button', { name: '下一步核对' }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '关闭');
    await edit.getByRole('button', { name: '关闭' }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '修改当前余额');

    await page.getByRole('button', { name: '未来', exact: true }).click();
    assert.equal(await page.locator('#page-future .fut-cards article').count(), 3);
    assert.equal(await page.locator('#page-future .fut-cards button').count(), 0);
    await page.getByRole('button', { name: '试算变化' }).click();
    const scenario = page.getByRole('dialog', { name: '试算变化' });
    await scenario.getByRole('textbox', { name: '收支名称' }).fill('试算样本');
    await scenario.getByRole('textbox', { name: '金额' }).fill('100');
    await scenario.getByRole('button', { name: '查看试算结果' }).click();
    await page.getByRole('button', { name: '保存试算' }).click();
    assert.equal(await page.getByRole('button', { name: /试算样本.*查看/ }).count(), 1);
    await page.getByRole('button', { name: '关闭试算' }).click();
    await page.getByRole('button', { name: /试算样本.*查看/ }).click();
    assert.equal(await page.getByTestId('future-scenario-result').count(), 1);
    await page.locator('#page-future .chart-tabs [data-value="30"]').click();
    assert.match(await page.getByTestId('future-scenario-result').innerText(), /试算结果/);

    await page.getByRole('button', { name: '记录', exact: true }).click();
    await page.getByRole('button', { name: '本机账单' }).click();
    assert.equal(await page.locator('#page-rec [data-action="bill-import"]').count(), 1);
    await page.locator('#page-rec [data-role="bill-file"]').setInputFiles({
      name: 'flow-check.csv', mimeType: 'text/csv',
      buffer: Buffer.from('日期,收支,金额,交易类型\n2026-09-28,收入,200,工资\n2026-09-28,支出,50,餐饮\n')
    });
    await page.locator('.bill-row').filter({ hasText: '工资' }).getByRole('button', { name: '计入观察' }).click();
    assert.match(await page.locator('.bill-summary').innerText(), /已核对支出\s*待核对/);
    await page.getByRole('button', { name: '依据', exact: true }).click();
    await page.getByRole('button', { name: '记录', exact: true }).click();
    assert.equal(await page.getByRole('heading', { name: '你的记录' }).count(), 1);
    const sparseTimelineHeight = await page.locator('#page-rec .rec-card').evaluate((element) => element.getBoundingClientRect().height);
    assert.ok(sparseTimelineHeight < 260, `one record should not fill a ${sparseTimelineHeight}px panel`);
    await page.getByRole('button', { name: '备份', exact: true }).click();
    const backup = page.getByRole('dialog', { name: '备份与恢复' });
    assert.equal(await backup.getByRole('button', { name: '导出备份' }).count(), 1);
    assert.equal(await backup.getByRole('button', { name: '恢复备份' }).count(), 1);
    const downloadEvent = page.waitForEvent('download');
    await backup.getByRole('button', { name: '导出备份' }).click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /^buffer-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backupBytes = fs.readFileSync(await download.path());
    assert.ok(JSON.parse(backupBytes.toString()).cashReality);
    await page.getByRole('button', { name: '备份', exact: true }).click();
    await page.getByRole('dialog', { name: '备份与恢复' }).getByRole('button', { name: '恢复备份' }).click();
    await page.locator('#page-rec [data-role="backup-file"]').setInputFiles({ name: 'flow-check-backup.json', mimeType: 'application/json', buffer: backupBytes });
    await page.getByRole('dialog', { name: '恢复备份' }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: '恢复备份' }).getByRole('button', { name: '确认恢复' }).count(), 1);
    await page.getByRole('dialog', { name: '恢复备份' }).getByRole('button', { name: '取消' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const space of ['现在', '未来', '依据', '记录']) {
      await page.getByRole('button', { name: space, exact: true }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${space} has ${overflow}px of horizontal overflow on a narrow screen`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
});
