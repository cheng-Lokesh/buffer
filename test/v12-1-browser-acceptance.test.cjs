const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STATE_KEY = 'buffer-zone.product.state.v1';
const ENTRY_KEY = 'buffer-zone.entry.completed.v1';
const SKIN_KEY = 'buffer-zone.visual-skin.v1';
const SKINS = ['ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field'];
const SKIN_LABELS = {
  'ink-contours': '水墨等高线', 'wallet-weather': '钱包天气漫画', 'pixel-garden': '像素花园',
  'felt-islands': '毛毡岛屿', 'riso-waves': '街头丝网印刷', 'sticker-field': '暗色贴纸磁场'
};

function item(text, overrides = {}) {
  return {
    semanticType: 'unsupported', direction: 'none', amount: null, amountCertainty: 'unknown',
    dateExpression: null, resolvedDate: null, frequency: null, nameHint: null, referenceHint: null,
    realityStatus: 'unsupported', evidenceText: text, ...overrides
  };
}

function parserFixture(text, currentDate) {
  if (text.includes('服务失败')) return null;
  if (text.includes('扣我1500') && text.includes('转了2000') && text.includes('6700')) return {
    status: 'candidates', items: [
      item('房东刚扣我1500', { semanticType: 'expense_paid', direction: 'expense', amount: 1500, amountCertainty: 'exact', nameHint: '房租', realityStatus: 'actual' }),
      item('我妈又给我转了2000', { semanticType: 'income_received', direction: 'income', amount: 2000, amountCertainty: 'exact', nameHint: '家人转账', realityStatus: 'actual' }),
      item('现在总共有6700', { semanticType: 'balance_confirmation', direction: 'balance', amount: 6700, amountCertainty: 'exact', resolvedDate: currentDate, realityStatus: 'actual' })
    ], scenarioItems: [], clarification: null
  };
  if (text.includes('押金1300') && text.includes('可能周五')) return {
    status: 'partial', items: [
      item('押金1300已经退了', { semanticType: 'income_received', direction: 'income', amount: 1300, amountCertainty: 'exact', nameHint: '押金', referenceHint: '押金', realityStatus: 'actual' }),
      item('客户3000可能周五给', { semanticType: 'future_income', direction: 'income', amount: 3000, amountCertainty: 'exact', nameHint: '客户款', realityStatus: 'uncertain' })
    ], scenarioItems: [], clarification: { question: '客户款是否已经确定？', itemIndexes: [1] }
  };
  if (text.includes('工资8500到了') && text.includes('如果以后')) return {
    status: 'partial', items: [item('工资8500到了', { semanticType: 'income_received', direction: 'income', amount: 8500, amountCertainty: 'exact', nameHint: '工资', referenceHint: '工资', realityStatus: 'actual' })],
    scenarioItems: [item('如果以后涨到12000', { semanticType: 'recurring_change', direction: 'income', amount: 12000, amountCertainty: 'exact', nameHint: '工资', realityStatus: 'scenario' })], clarification: null
  };
  if (text.includes('以后工资变成8500')) return {
    status: 'candidates', items: [item(text, { semanticType: 'recurring_change', direction: 'income', amount: 8500, amountCertainty: 'exact', nameHint: '工资', referenceHint: '工资', realityStatus: 'known_future', resolvedDate: currentDate })], scenarioItems: [], clarification: null
  };
  return { status: 'unsupported', items: [], scenarioItems: [], clarification: null };
}

function fixture(skinId = 'ink-contours') {
  const today = new Date().toISOString().slice(0, 10);
  return {
    schemaVersion: 9, visualSkinId: skinId, cash: { balance: 5000, reserve: 1200, daily: 100, monthly: 0 }, records: [],
    cashReality: { version: 1, conditions: [
      { id: 'balance', type: 'balance', amount: 5000, status: 'confirmed', confirmedAt: `${today}T08:00:00.000Z`, source: 'user_confirmed' },
      { id: 'reserve', type: 'reserve', amount: 1200, status: 'confirmed', source: 'user_confirmed' },
      { id: 'daily-floor', type: 'daily_floor', amount: 100, frequency: 'daily', startDate: today, status: 'confirmed', source: 'user_confirmed' },
      { id: 'salary', name: '工资', type: 'recurring_income', amount: 10000, frequency: 'monthly', nextOccurrence: today, status: 'confirmed', source: 'user_confirmed' }
    ], events: [], scenarioDrafts: [], occurrenceResolutions: [], realitySnapshots: [], forecastSnapshots: [] }
  };
}

async function routeProduct(context) {
  await context.route('http://buffer-v121.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/reality/parse') {
      const body = route.request().postDataJSON();
      const response = parserFixture(body.text, body.currentDate);
      return response
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
        : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'provider_unavailable' }) });
    }
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const filePath = path.join(DIST, relative);
    if (!filePath.startsWith(DIST) || !fs.existsSync(filePath)) return route.fulfill({ status: 404, body: 'not found' });
    const contentType = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(filePath)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType, body: fs.readFileSync(filePath) });
  });
}

async function reset(page, skinId = 'ink-contours') {
  await page.evaluate(({ key, skinKey, state, skinId }) => {
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(skinKey, JSON.stringify({ version: 1, skinId }));
  }, { key: STATE_KEY, skinKey: SKIN_KEY, state: fixture(skinId), skinId });
  await page.reload({ waitUntil: 'networkidle' });
}

async function openLanguage(page) {
  await page.getByRole('button', { name: '现实有变化', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '现实有变化' });
  await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
  return dialog;
}

async function parse(dialog, text) {
  await dialog.getByRole('textbox', { name: '发生了什么' }).fill(text);
  await dialog.getByRole('button', { name: /整理成事实/ }).click();
}

test('V12.1 browser flow keeps AI at candidate boundary across desktop, mobile and six skins', { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  let context;
  try {
  context = await browser.newContext({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
  await routeProduct(context);
  await context.addInitScript(({ stateKey, entryKey, skinKey, state }) => {
    localStorage.setItem(stateKey, JSON.stringify(state));
    localStorage.setItem(entryKey, 'true');
    localStorage.setItem(skinKey, JSON.stringify({ version: 1, skinId: 'ink-contours' }));
  }, { stateKey: STATE_KEY, entryKey: ENTRY_KEY, skinKey: SKIN_KEY, state: fixture() });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://buffer-v121.test', { waitUntil: 'networkidle' });

  let dialog = await openLanguage(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), STATE_KEY);
  await parse(dialog, '房东刚扣我1500，我妈又给我转了2000，现在总共有6700。');
  await dialog.getByRole('heading', { name: '我理解为' }).waitFor();
  assert.equal(await dialog.locator('.v12-candidate').count(), 3);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STATE_KEY), before, 'LLM result must not write before confirmation');
  await dialog.getByRole('button', { name: '确认这些变化' }).click();
  await dialog.getByRole('heading', { name: '现实已更新' }).waitFor();
  const committed = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), STATE_KEY)).cashReality;
  assert.equal(committed.conditions.find((entry) => entry.type === 'balance').amount, 6700);

  await reset(page);
  dialog = await openLanguage(page);
  await parse(dialog, '押金1300已经退了，客户3000可能周五给。');
  await dialog.getByRole('heading', { name: '我理解为' }).waitFor();
  assert.equal(await dialog.locator('.v12-candidate').count(), 1);
  assert.match(await dialog.innerText(), /明确部分[\s\S]*还需要确认/);

  await reset(page);
  dialog = await openLanguage(page);
  await parse(dialog, '工资8500到了，如果以后涨到12000会怎样？');
  await dialog.getByRole('heading', { name: '我理解为' }).waitFor();
  assert.equal(await dialog.locator('.v12-candidate').count(), 1);
  assert.match(await dialog.innerText(), /假设部分没有进入现实/);

  await reset(page);
  dialog = await openLanguage(page);
  await parse(dialog, '以后工资变成8500。');
  await dialog.getByRole('heading', { name: '我理解为' }).waitFor();
  assert.match(await dialog.innerText(), /已有规律更新[\s\S]*匹配到已有内容/);

  await reset(page);
  dialog = await openLanguage(page);
  await parse(dialog, '服务失败时保留这句复杂输入。');
  await dialog.getByText('暂时不能自动整理这句话', { exact: true }).waitFor();
  assert.match(await dialog.innerText(), /原句已保留[\s\S]*重新解析[\s\S]*精确修改[\s\S]*确认余额/);

  await page.setViewportSize({ width: 390, height: 844 });
  await reset(page);
  dialog = await openLanguage(page);
  await parse(dialog, '房东刚扣我1500，我妈又给我转了2000，现在总共有6700。');
  await dialog.getByRole('heading', { name: '我理解为' }).waitFor();
  const confirm = dialog.getByRole('button', { name: '确认这些变化' });
  const box = await confirm.boundingBox();
  assert.ok(box && box.y + box.height <= 844, 'three-candidate confirmation stays in the mobile viewport');
  const signatures = new Set();
  const signatureBySkin = {};
  for (const skinId of SKINS) {
    await reset(page);
    await page.getByRole('button', { name: '选择视觉皮肤' }).click();
    await page.getByRole('button').filter({ hasText: SKIN_LABELS[skinId] }).click();
    await page.getByRole('button', { name: '现实有变化', exact: true }).click();
    const dimensions = await page.evaluate(() => {
      const panel = document.querySelector('.v12-capture-panel');
      const detail = document.querySelector('.v12-due-card, .v12-path, .v12-candidate');
      const style = getComputedStyle(panel);
      const detailStyle = getComputedStyle(detail);
      return { skin: document.querySelector('.app-shell')?.dataset.skin, viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, signature: [style.backgroundImage, detailStyle.borderRadius, detailStyle.boxShadow, detailStyle.borderStyle, detailStyle.borderWidth].join('|') };
    });
    assert.equal(dimensions.skin, skinId);
    assert.ok(dimensions.scroll <= dimensions.viewport, `${skinId} must not overflow mobile width`);
    signatures.add(dimensions.signature);
    signatureBySkin[skinId] = dimensions.signature;
  }
  assert.ok(signatures.size >= 4, `six skins must not collapse into one V12.1 surface treatment: ${JSON.stringify(signatureBySkin)}`);
  assert.deepEqual(errors, []);
  } finally {
    if (context) await context.close();
    await browser.close();
  }
});
