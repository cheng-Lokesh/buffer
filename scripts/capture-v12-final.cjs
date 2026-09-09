const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUTPUT = path.join(ROOT, 'docs', 'testing', 'v12-after');
const STATE_KEY = 'buffer-zone.product.state.v1';
const ENTRY_KEY = 'buffer-zone.entry.completed.v1';
const SKINS = ['ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field'];

function fixture(skinId = 'ink-contours') {
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
        { id: 'salary', name: '工资', type: 'recurring_income', amount: 10000, frequency: 'monthly', nextOccurrence: today, status: 'confirmed', source: 'user_confirmed' }
      ],
      events: [],
      scenarioDrafts: [],
      occurrenceResolutions: [],
      realitySnapshots: [],
      forecastSnapshots: []
    }
  };
}

async function routeDist(context) {
  await context.route('http://buffer.test/**', async (route) => {
    const url = new URL(route.request().url());
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const filePath = path.join(DIST, relative);
    if (!filePath.startsWith(DIST) || !fs.existsSync(filePath)) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(filePath)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(filePath) });
  });
}

async function newPage(browser, viewport, skinId = 'ink-contours') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
  await routeDist(context);
  await context.addInitScript(({ state, stateKey, entryKey }) => {
    localStorage.setItem(stateKey, JSON.stringify(state));
    localStorage.setItem(entryKey, 'true');
  }, { state: fixture(skinId), stateKey: STATE_KEY, entryKey: ENTRY_KEY });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText || 'unknown'}`));
  await page.goto('http://buffer.test', { waitUntil: 'networkidle' });
  await page.locator('#root').filter({ hasText: '缓冲区' }).waitFor();
  await page.waitForTimeout(350);
  return { context, page, errors };
}

async function openCapture(page) {
  const now = page.locator('.v6-primary-nav:visible, .mobile-primary-nav:visible').locator('button').filter({ hasText: '现在' }).first();
  if (await now.count()) await now.click();
  await page.getByRole('button', { name: '现实有变化', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '现实有变化' });
  await dialog.waitFor();
  await page.waitForTimeout(200);
  return dialog;
}

async function shot(page, filename) {
  await page.screenshot({ path: path.join(OUTPUT, filename), animations: 'disabled' });
}

async function desktopShots(browser) {
  const run = await newPage(browser, { width: 1440, height: 960 });
  let dialog = await openCapture(run.page);
  await shot(run.page, '01-capture-entry-desktop.png');
  await dialog.getByRole('button', { name: /^确认现在有多少钱/ }).click();
  await shot(run.page, '02-balance-checkpoint-desktop.png');
  await run.context.close();

  const due = await newPage(browser, { width: 1440, height: 960 });
  dialog = await openCapture(due.page);
  await dialog.locator('.v12-due-card').filter({ hasText: '工资' }).getByRole('button', { name: '金额不同' }).click();
  await shot(due.page, '03-due-occurrence-desktop.png');
  await due.context.close();

  const language = await newPage(browser, { width: 1440, height: 960 });
  dialog = await openCapture(language.page);
  await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
  await dialog.getByPlaceholder('今天交了1500房租，现在还有4200').fill('今天房租1500，现在还有3500');
  await shot(language.page, '04-natural-language-input-desktop.png');
  await dialog.getByRole('button', { name: /整理成事实/ }).click();
  await dialog.getByText('我理解为', { exact: true }).waitFor();
  await shot(language.page, '05-natural-language-confirm-desktop.png');
  await language.context.close();

  const multi = await newPage(browser, { width: 1440, height: 960 });
  dialog = await openCapture(multi.page);
  await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
  await dialog.getByPlaceholder('今天交了1500房租，现在还有4200').fill('今天房租1500，押金退了1300，现在4680');
  await dialog.getByRole('button', { name: /整理成事实/ }).click();
  await dialog.getByText('我理解为', { exact: true }).waitFor();
  await shot(multi.page, '06-multi-change-confirm-desktop.png');
  await dialog.getByRole('button', { name: '确认这些变化' }).click();
  await dialog.getByRole('heading', { name: '现实已更新', exact: true }).waitFor();
  await shot(multi.page, '07-capture-complete-desktop.png');
  await multi.context.close();
}

async function mobileShots(browser) {
  const size = { width: 390, height: 844 };
  const entry = await newPage(browser, size);
  let dialog = await openCapture(entry.page);
  await shot(entry.page, '08-capture-entry-mobile.png');
  await dialog.getByRole('button', { name: /^确认现在有多少钱/ }).click();
  await shot(entry.page, '09-balance-mobile.png');
  await entry.context.close();

  const language = await newPage(browser, size);
  dialog = await openCapture(language.page);
  await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
  await dialog.getByPlaceholder('今天交了1500房租，现在还有4200').fill('今天房租1500，押金退了1300，现在4680');
  await shot(language.page, '10-natural-language-mobile.png');
  await dialog.getByRole('button', { name: /整理成事实/ }).click();
  await dialog.getByText('我理解为', { exact: true }).waitFor();
  await shot(language.page, '11-confirm-mobile.png');
  await language.context.close();

  const voice = await newPage(browser, size);
  await voice.page.evaluate(() => {
    window.SpeechRecognition = class {
      start() { this.onstart?.(); }
      abort() { this.onend?.(); }
    };
    window.webkitSpeechRecognition = undefined;
  });
  dialog = await openCapture(voice.page);
  await dialog.getByRole('button', { name: /^说一句发生了什么/ }).click();
  await dialog.getByRole('button', { name: '使用语音输入' }).click();
  await shot(voice.page, '12-voice-mobile.png');
  await voice.context.close();

  const due = await newPage(browser, size);
  dialog = await openCapture(due.page);
  await dialog.locator('.v12-due-card').filter({ hasText: '房租' }).getByRole('button', { name: '日期不同' }).click();
  await shot(due.page, '13-due-occurrence-mobile.png');
  await due.context.close();

  const complete = await newPage(browser, size);
  dialog = await openCapture(complete.page);
  await dialog.getByRole('button', { name: /^确认现在有多少钱/ }).click();
  await dialog.locator('input[type="number"]').fill('4360');
  await dialog.getByRole('button', { name: '确认这个余额' }).click();
  await dialog.getByRole('heading', { name: '现实已更新', exact: true }).waitFor();
  await shot(complete.page, '14-complete-mobile.png');
  await complete.context.close();
}

async function skinShots(browser) {
  const skinDir = path.join(OUTPUT, 'skins');
  fs.mkdirSync(skinDir, { recursive: true });
  for (const skinId of SKINS) {
    const run = await newPage(browser, { width: 1280, height: 850 }, skinId);
    await openCapture(run.page);
    await run.page.screenshot({ path: path.join(skinDir, `${skinId}-capture-desktop.png`), animations: 'disabled' });
    if (run.errors.length) throw new Error(`${skinId}: ${run.errors.join(' | ')}`);
    await run.context.close();
  }
}

(async () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.V12_BROWSER === 'chromium' ? undefined : 'msedge', headless: true, args: ['--no-proxy-server'] });
  try {
    await desktopShots(browser);
    await mobileShots(browser);
    await skinShots(browser);
    console.log(`V12 screenshots written to ${OUTPUT}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
