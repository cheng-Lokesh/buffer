const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { chromium, firefox } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const VITE_CLI = path.resolve(path.dirname(require.resolve('vite')), '..', '..', 'bin', 'vite.js');
const STATE_KEY = 'buffer-zone.product.state.v1';
const ENTRY_KEY = 'buffer-zone.entry.completed.v1';
const DIST = path.join(ROOT, 'dist');
const SKINS = ['ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field'];

function v12ParserFixture(text, currentDate) {
  const item = (overrides = {}) => ({
    semanticType: 'unsupported', direction: 'none', amount: null, amountCertainty: 'unknown',
    dateExpression: null, resolvedDate: null, frequency: null, nameHint: null, referenceHint: null,
    realityStatus: 'unsupported', evidenceText: text, ...overrides
  });
  if (text.includes('房租1500') && text.includes('押金') && text.includes('4680')) return {
    status: 'candidates',
    items: [
      item({ semanticType: 'expense_paid', direction: 'expense', amount: 1500, amountCertainty: 'exact', nameHint: '房租', referenceHint: '房租', realityStatus: 'actual', evidenceText: '房租1500' }),
      item({ semanticType: 'income_received', direction: 'income', amount: 1300, amountCertainty: 'exact', nameHint: '押金', referenceHint: '押金', realityStatus: 'actual', evidenceText: '押金退了1300' }),
      item({ semanticType: 'balance_confirmation', direction: 'balance', amount: 4680, amountCertainty: 'exact', resolvedDate: currentDate, realityStatus: 'actual', evidenceText: '现在4680' })
    ], scenarioItems: [], clarification: null
  };
  if (text.includes('如果下个月工资12000')) return {
    status: 'scenario', items: [], scenarioItems: [item({ semanticType: 'recurring_change', direction: 'income', amount: 12000, amountCertainty: 'exact', realityStatus: 'scenario' })], clarification: null
  };
  if (text.includes('可能收到3000')) return {
    status: 'clarification', items: [item({ semanticType: 'future_income', direction: 'income', amount: 3000, amountCertainty: 'exact', realityStatus: 'uncertain' })], scenarioItems: [], clarification: { question: '这是已经确定的未来事项，还是仍然只是可能？', itemIndexes: [0] }
  };
  return { status: 'unsupported', items: [], scenarioItems: [], clarification: null };
}

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function fixture(skinId = 'ink-contours', extraConditions = []) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    schemaVersion: 9,
    visualSkinId: skinId,
    cash: { balance: 5000, reserve: 1200, daily: 100, monthly: 0 },
    records: [],
    cashReality: {
      version: 1,
      conditions: [
        { id: 'balance', type: 'balance', amount: 5000, status: 'confirmed', confirmedAt: `${today}T08:00:00.000Z`, source: 'user_confirmed' },
        { id: 'reserve', type: 'reserve', amount: 1200, status: 'confirmed', source: 'user_confirmed' },
        { id: 'daily-floor', type: 'daily_floor', amount: 100, frequency: 'daily', startDate: today, status: 'confirmed', source: 'user_confirmed' },
        { id: 'rent', name: '房租', type: 'recurring_expense', amount: 1500, frequency: 'monthly', nextOccurrence: today, status: 'confirmed', source: 'user_confirmed' },
        { id: 'salary', name: '工资', type: 'recurring_income', amount: 10000, frequency: 'monthly', nextOccurrence: today, status: 'confirmed', source: 'user_confirmed' },
        ...extraConditions
      ],
      events: [],
      scenarioDrafts: [],
      occurrenceResolutions: [],
      realitySnapshots: [],
      forecastSnapshots: []
    }
  };
}

async function openProduct(browser, baseUrl, viewport, state = fixture()) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  if (baseUrl === 'http://buffer.test') {
    await context.route('http://buffer.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/reality/parse') {
        const body = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v12ParserFixture(body.text, body.currentDate)) });
      }
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
      const filePath = path.join(DIST, relative);
      if (!filePath.startsWith(DIST) || !fs.existsSync(filePath)) return route.fulfill({ status: 404, body: 'not found' });
      const extension = path.extname(filePath);
      const contentType = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' })[extension] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType, body: fs.readFileSync(filePath) });
    });
  }
  await context.addInitScript(({ state, stateKey, entryKey }) => {
    if (!localStorage.getItem(stateKey)) localStorage.setItem(stateKey, JSON.stringify(state));
    localStorage.setItem(entryKey, 'true');
  }, { state, stateKey: STATE_KEY, entryKey: ENTRY_KEY });
  const page = await context.newPage();
  const errors = [];
  page.__v12Errors = errors;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(`request failed ${request.url()}: ${request.failure()?.errorText || 'unknown'}`));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  return { context, page, errors };
}

async function resetProduct(page, state = fixture()) {
  await page.evaluate(({ state, stateKey }) => localStorage.setItem(stateKey, JSON.stringify(state)), { state, stateKey: STATE_KEY });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#root').filter({ hasText: '缓冲区' }).waitFor();
}

async function openCapture(page) {
  const now = page.locator('.v6-primary-nav:visible, .mobile-primary-nav:visible').locator('button').filter({ hasText: '现在' }).first();
  if (await now.count()) await now.click();
  const trigger = page.getByRole('button', { name: '现实有变化', exact: true });
  if (!await trigger.count()) throw new Error(`V12 trigger missing: ${(await page.locator('body').innerText()).slice(0, 1800)} | errors: ${page.__v12Errors.join(' | ')}`);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '现实有变化' });
  await dialog.waitFor();
  return dialog;
}

function storedReality(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).cashReality, STATE_KEY);
}

test('V12 Reality Capture completes desktop and mobile daily-use paths without hidden writes', { timeout: 180_000 }, async () => {
  const externalBaseUrl = String(process.env.BASE_URL || '').trim().replace(/\/$/, '');
  const baseUrl = externalBaseUrl || 'http://buffer.test';
  const vite = null;
  let output = '';
  vite?.stdout.on('data', (chunk) => { output += chunk; });
  vite?.stderr.on('data', (chunk) => { output += chunk; });
  let browser;
  try {
    if (externalBaseUrl) {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        try { if ((await fetch(baseUrl)).ok) break; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const browserType = process.env.V12_BROWSER === 'firefox' ? firefox : chromium;
    const launchOptions = browserType === chromium
      ? { headless: true, args: ['--no-proxy-server'], ...(process.env.V12_BROWSER === 'msedge' ? { channel: 'msedge' } : {}) }
      : { headless: true };
    browser = await browserType.launch(launchOptions);

    const balanceRun = await openProduct(browser, baseUrl, { width: 1280, height: 850 });
    let dialog = await openCapture(balanceRun.page);
    assert.match(await dialog.innerText(), /待确认[\s\S]*确认现在有多少钱[\s\S]*说一句发生了什么[\s\S]*精确修改/);
    assert.equal(await dialog.getByRole('button', { name: '如期发生', exact: true }).count(), 2);
    await dialog.getByRole('button', { name: /^确认现在有多少钱/ }).click();
    assert.equal(await dialog.locator('input[type="number"]').count(), 1);
    await dialog.locator('input[type="number"]').fill('4360');
    await dialog.getByRole('button', { name: '确认这个余额' }).click();
    await dialog.getByRole('heading', { name: '现实已更新', exact: true }).waitFor();
    const balanceReality = await storedReality(balanceRun.page);
    assert.equal(balanceReality.conditions.find((item) => item.type === 'balance').amount, 4360);
    assert.equal(balanceReality.events.filter((item) => item.type === 'balance_confirmation').length, 1);
    assert.equal(balanceReality.events.some((item) => item.type === 'expense' && item.amount === 640), false);
    assert.deepEqual(balanceRun.errors, []);
    await resetProduct(balanceRun.page);
    const occurrenceRun = balanceRun;
    dialog = await openCapture(occurrenceRun.page);
    const rentCard = dialog.locator('.v12-due-card').filter({ hasText: '房租' });
    await rentCard.getByRole('button', { name: '如期发生', exact: true }).click();
    await dialog.getByRole('heading', { name: '现实已更新', exact: true }).waitFor();
    const occurrenceReality = await storedReality(occurrenceRun.page);
    assert.equal(occurrenceReality.occurrenceResolutions.filter((item) => item.conditionId === 'rent').length, 1);
    assert.equal(occurrenceReality.events.filter((item) => item.expectedOccurrenceId && item.conditionId === 'rent').length, 1);
    assert.equal(occurrenceReality.conditions.find((item) => item.type === 'balance').amount, 5000);
    await resetProduct(balanceRun.page);
    const languageRun = balanceRun;
    dialog = await openCapture(languageRun.page);
    await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
    const beforeParse = await storedReality(languageRun.page);
    await dialog.getByPlaceholder('今天交了1500房租，现在还有4200').fill('今天房租1500，押金退了1300，现在4680');
    await dialog.getByRole('button', { name: /整理成事实/ }).click();
    await dialog.getByText('我理解为', { exact: true }).waitFor();
    assert.equal(await dialog.locator('.v12-candidate').count(), 3);
    assert.deepEqual(await storedReality(languageRun.page), beforeParse, 'candidate review must not mutate Reality');
    await dialog.getByRole('button', { name: '确认这些变化' }).click();
    try {
      await dialog.getByRole('heading', { name: '现实已更新', exact: true }).waitFor({ timeout: 5000 });
    } catch {
      throw new Error(`V12 confirmation failed: ${await dialog.innerText()}`);
    }
    const languageReality = await storedReality(languageRun.page);
    assert.equal(languageReality.conditions.find((item) => item.type === 'balance').amount, 4680);
    assert.deepEqual(languageReality.events.map((item) => item.type).sort(), ['balance_confirmation', 'expense', 'income']);
    assert.deepEqual(languageRun.errors, []);
    await resetProduct(balanceRun.page);
    const boundaryRun = balanceRun;
    dialog = await openCapture(boundaryRun.page);
    await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
    const boundaryBefore = await storedReality(boundaryRun.page);
    await dialog.getByPlaceholder('今天交了1500房租，现在还有4200').fill('如果下个月工资12000呢');
    await dialog.getByRole('button', { name: /整理成事实/ }).click();
    await dialog.getByText('这是一个模拟变化', { exact: true }).waitFor();
    assert.deepEqual(await storedReality(boundaryRun.page), boundaryBefore);
    await dialog.getByPlaceholder('今天交了1500房租，现在还有4200').fill('可能收到3000');
    await dialog.getByRole('button', { name: /整理成事实/ }).click();
    await dialog.getByText(/还不够确定|仍然只是可能|是否已经确定/).first().waitFor();
    assert.deepEqual(await storedReality(boundaryRun.page), boundaryBefore);
    await resetProduct(balanceRun.page);
    await balanceRun.page.setViewportSize({ width: 390, height: 844 });
    const voiceRun = balanceRun;
    dialog = await openCapture(voiceRun.page);
    await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
    await voiceRun.page.evaluate(() => {
      window.SpeechRecognition = class {
        start() { setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 0); }
        abort() {}
      };
      window.webkitSpeechRecognition = undefined;
    });
    await dialog.getByRole('button', { name: '使用语音输入' }).click();
    await dialog.getByText(/麦克风权限未开启|语音.*不可用|浏览器暂时不能可靠转写语音/).waitFor();
    assert.equal(await dialog.getByPlaceholder('今天交了1500房租，现在还有4200').isEnabled(), true);
    const geometry = await voiceRun.page.evaluate(() => {
      const panel = document.querySelector('.v12-capture-panel').getBoundingClientRect();
      return { viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, panel: { left: panel.left, right: panel.right, bottom: panel.bottom, height: panel.height } };
    });
    assert.ok(geometry.scroll <= geometry.viewport, `mobile overflow ${geometry.scroll}/${geometry.viewport}`);
    assert.ok(geometry.panel.left >= 0 && geometry.panel.right <= 390.5 && geometry.panel.bottom <= 844.5);
    assert.deepEqual(voiceRun.errors, []);

    await resetProduct(balanceRun.page);
    await balanceRun.page.evaluate(() => {
      window.SpeechRecognition = class {
        start() {
          setTimeout(() => {
            this.onstart?.();
            this.onresult?.({ results: [[{ transcript: '今天房租1500，押金退了1300，现在4680' }]] });
            this.onend?.();
          }, 0);
        }
        abort() {}
      };
      window.webkitSpeechRecognition = undefined;
    });
    dialog = await openCapture(balanceRun.page);
    await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
    const beforeVoice = await storedReality(balanceRun.page);
    await dialog.getByRole('button', { name: '使用语音输入' }).click();
    await dialog.getByText('我理解为', { exact: true }).waitFor();
    assert.equal(await dialog.locator('.v12-candidate').count(), 3);
    assert.deepEqual(await storedReality(balanceRun.page), beforeVoice, 'voice transcript must still wait for confirmation');
    const mobileConfirm = dialog.getByRole('button', { name: '确认这些变化' });
    assert.equal(await mobileConfirm.isVisible(), true, 'three-candidate confirmation must stay visible in the mobile first viewport');
    const mobileConfirmBox = await mobileConfirm.boundingBox();
    assert.ok(mobileConfirmBox && mobileConfirmBox.y + mobileConfirmBox.height <= 844, 'mobile confirmation must not require a scroll');

    for (const skinId of SKINS) {
      await resetProduct(balanceRun.page, fixture(skinId));
      const skinRun = balanceRun;
      dialog = await openCapture(skinRun.page);
      assert.equal(await dialog.getByRole('button', { name: /^确认现在有多少钱/ }).count(), 1, `${skinId} balance path`);
      assert.equal(await dialog.getByRole('button', { name: /^说一句发生了什么/ }).count(), 1, `${skinId} language path`);
      const dimensions = await skinRun.page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scroll <= dimensions.viewport, `${skinId} mobile overflow`);
      assert.deepEqual(skinRun.errors, [], skinId);
    }
    await balanceRun.context.close();
  } finally {
    if (browser) await browser.close();
    if (vite && vite.exitCode === null) {
      vite.kill('SIGTERM');
      await Promise.race([once(vite, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (vite.exitCode === null) vite.kill('SIGKILL');
    }
  }
});
