const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const port = 8962;
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
  await page.goto(origin);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '开始设置' }).click();
  await page.getByLabel('当前余额').fill('24800');
  await page.getByLabel('保留金额').fill('5000');
  await page.getByLabel('每日最低支出').fill('340');
  await page.getByRole('button', { name: '下一步核对' }).click();
  await page.getByRole('button', { name: '确认保存' }).click();
}

async function expectBalancedFirstViewport(page, primarySelector, limits = {}) {
  const geometry = await page.locator('.page.on').evaluate((pageRoot, selector) => {
    const heading = pageRoot.querySelector('.live-heading');
    const primary = pageRoot.querySelector(selector);
    if (!heading || !primary) return null;
    const headingRect = heading.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    return {
      headingTop: headingRect.top,
      headingBottom: headingRect.bottom,
      primaryTop: primaryRect.top,
      overlap: headingRect.bottom > primaryRect.top
    };
  }, primarySelector);
  assert.ok(geometry, `missing layout geometry for ${primarySelector}`);
  assert.ok(geometry.headingTop <= (limits.headingTop ?? 145), `heading starts too low at ${geometry.headingTop}px`);
  assert.ok(geometry.primaryTop <= (limits.primaryTop ?? 300), `primary content starts too low at ${geometry.primaryTop}px`);
  assert.equal(geometry.overlap, false, 'page heading overlaps its primary content');
}

async function expectDesktopFitsWithoutPageScroll(page, label) {
  const geometry = await page.locator('.page.on').evaluate((pageRoot) => {
    const stack = pageRoot.querySelector('.live-stack');
    const pageRect = pageRoot.getBoundingClientRect();
    const stackRect = stack?.getBoundingClientRect();
    return {
      clientHeight: pageRoot.clientHeight,
      scrollHeight: pageRoot.scrollHeight,
      pageBottom: pageRect.bottom,
      stackBottom: stackRect?.bottom ?? Infinity,
      viewportHeight: window.innerHeight,
      overflowY: getComputedStyle(pageRoot).overflowY
    };
  });
  assert.equal(geometry.overflowY, 'hidden', `${label} still enables whole-page vertical scrolling`);
  assert.ok(
    geometry.scrollHeight <= geometry.clientHeight + 1,
    `${label} content exceeds its page by ${geometry.scrollHeight - geometry.clientHeight}px`
  );
  assert.ok(
    geometry.stackBottom <= Math.min(geometry.pageBottom, geometry.viewportHeight) + 1,
    `${label} stack extends below the visible page`
  );
}

async function expectEveryDesktopSpaceFits(page, viewport) {
  await page.setViewportSize(viewport);
  for (const [name, label] of [
    [/^现在/, '现在'],
    [/^未来/, '未来'],
    [/^(条件|依据)/, '依据'],
    [/^记录/, '记录']
  ]) {
    await page.getByRole('button', { name }).click();
    await expectDesktopFitsWithoutPageScroll(page, `${viewport.width}×${viewport.height} ${label}`);
  }
}

async function expectCompactRightRail(page, selector, label) {
  const geometry = await page.locator(selector).evaluate((rail) => ({
    width: rail.getBoundingClientRect().width,
    scrollWidth: rail.scrollWidth,
    clientWidth: rail.clientWidth,
    parentWidth: rail.parentElement?.getBoundingClientRect().width ?? 0,
    parentColumns: getComputedStyle(rail.parentElement).gridTemplateColumns
  }));
  assert.ok(geometry.width >= 268, `${label} is too narrow: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.width <= 322, `${label} is too wide: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, `${label} has horizontal overflow`);
}

async function expectPlainReadableCopy(page, label) {
  const bannedTerms = [
    'REALITY',
    'FORECAST',
    'TEMPORAL MEMORY',
    'VISUAL SKIN',
    'REALITY TOPOGRAPHY',
    'KEY MOMENTS',
    '区间末解释',
    '区间差额',
    '末日构成',
    '现实快照',
    '预测快照'
  ];
  const audit = await page.locator('.page.on').evaluate((pageRoot, terms) => {
    const visibleText = pageRoot.innerText;
    const jargon = terms.filter((term) => visibleText.includes(term));
    const groups = [
      { name: 'body copy', selector: 'p', minimum: 15 },
      { name: 'labels and actions', selector: 'small, dt, label, button, span', minimum: 14 },
      { name: 'dates and chart metadata', selector: 'time, .live-chart footer, .future-canvas footer', minimum: 13 }
    ];
    const tiny = groups.flatMap(({ name, selector, minimum }) => [...pageRoot.querySelectorAll(selector)].flatMap((node) => {
      if (name === 'labels and actions' && node.closest('.live-chart footer, .future-canvas footer')) return [];
      const rect = node.getBoundingClientRect();
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || rect.width === 0 || rect.height === 0) return [];
      const size = Number.parseFloat(getComputedStyle(node).fontSize);
      return size < minimum ? [{ group: name, text: text.slice(0, 32), size, minimum }] : [];
    }));
    return { jargon, tiny };
  }, bannedTerms);
  assert.deepEqual(audit.jargon, [], `${label} exposes internal terminology: ${audit.jargon.join(', ')}`);
  assert.deepEqual(audit.tiny, [], `${label} contains undersized product copy: ${JSON.stringify(audit.tiny.slice(0, 8))}`);
}

async function expectConciseProductCopy(page, label) {
  const redundantPhrases = [
    '只显示你确认过的金额',
    '当前余额减去保留金额',
    '由你设定',
    '这里只显示你确认过的信息',
    '以下金额和收支会用于计算未来余额',
    '你最近确认的金额',
    '由你亲自确认',
    '只改变界面外观',
    '目前只按每日最低支出估算'
  ];
  const audit = await page.locator('.page.on').evaluate((pageRoot, phrases) => {
    const visibleText = pageRoot.innerText;
    const redundant = phrases.filter((phrase) => visibleText.includes(phrase));
    const headingExplanations = [...pageRoot.querySelectorAll('.live-heading p')].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length;
    return { redundant, headingExplanations };
  }, redundantPhrases);
  assert.deepEqual(audit.redundant, [], `${label} repeats self-evident explanations: ${audit.redundant.join(', ')}`);
  assert.equal(audit.headingExplanations, 0, `${label} repeats its page title with a heading paragraph`);
}

test('each live product space restores its own dense visual structure', { timeout: 60000 }, async (t) => {
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
  await confirmBaseline(page);

  for (const [name, label] of [
    [/^现在/, '现在'],
    [/^未来/, '未来'],
    [/^(条件|依据)/, '依据'],
    [/^记录/, '记录']
  ]) {
    await page.getByRole('button', { name }).click();
    await expectPlainReadableCopy(page, label);
    await expectConciseProductCopy(page, label);
  }
  const shellTextSizes = await page.locator('.nav-item .t1, .nav-item .t2, .greet .g1, .greet .g3, .info-box').evaluateAll((nodes) => nodes.map((node) => ({
    text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32),
    size: Number.parseFloat(getComputedStyle(node).fontSize),
    minimum: node.matches('.nav-item .t1') ? 15 : 13
  })).filter((item) => item.text && item.size < item.minimum));
  assert.deepEqual(shellTextSizes, [], `shell contains undersized navigation copy: ${JSON.stringify(shellTextSizes)}`);
  const redundantShellCopy = await page.locator('body').evaluate((body) => [
    '查看当前金额',
    '查看预计变化',
    '查看计算使用的信息',
    '查看已确认收支',
    '只显示确认过的信息'
  ].filter((phrase) => body.innerText.includes(phrase)));
  assert.deepEqual(redundantShellCopy, [], `shell repeats navigation meaning: ${redundantShellCopy.join(', ')}`);
  await page.getByRole('button', { name: /^现在/ }).click();

  const sidebarVideo = await page.locator('.side-card video').evaluate((video) => ({
    playbackRate: video.playbackRate,
    defaultPlaybackRate: video.defaultPlaybackRate,
    muted: video.muted,
    loop: video.loop
  }));
  assert.equal(sidebarVideo.playbackRate, 0.6, 'left background video should play at 0.6×');
  assert.equal(sidebarVideo.defaultPlaybackRate, 0.6, 'left background video should keep 0.6× after media reloads');
  assert.equal(sidebarVideo.muted, true, 'left background video must remain muted');
  assert.equal(sidebarVideo.loop, true, 'left background video must remain looped');

  for (const testId of ['now-observatory', 'now-composition']) {
    await assert.doesNotReject(() => page.getByTestId(testId).waitFor());
  }
  assert.equal(await page.getByTestId('now-future-preview').count(), 0, '现在页不应重复完整未来空间');
  await expectBalancedFirstViewport(page, '.live-metrics');

  await page.getByRole('button', { name: /^未来/ }).click();
  for (const testId of ['future-canvas', 'future-inspector']) {
    await assert.doesNotReject(() => page.getByTestId(testId).waitFor());
  }
  assert.equal(await page.getByTestId('future-events').count(), 0, '没有未来收支时不应渲染空事件区');
  await expectBalancedFirstViewport(page, '.future-toolbar');

  await page.getByRole('button', { name: /^(条件|依据)/ }).click();
  for (const testId of ['conditions-topography', 'conditions-groups']) {
    await assert.doesNotReject(() => page.getByTestId(testId).waitFor());
  }
  assert.equal(await page.locator('[data-testid="conditions-groups"] > section').count(), 1);
  await expectBalancedFirstViewport(page, '[data-testid="conditions-topography"]');

  await page.getByRole('button', { name: /^记录/ }).click();
  for (const testId of ['records-timeline', 'records-memory']) {
    await assert.doesNotReject(() => page.getByTestId(testId).waitFor());
  }
  await expectBalancedFirstViewport(page, '.records-layout');

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.getByRole('button', { name: /^现在/ }).click();
  const wideNow = await page.locator('.live-space-now').evaluate((stack) => {
    const hero = stack.querySelector('.reality-landscape')?.getBoundingClientRect();
    const rail = stack.querySelector('.reality-inspector')?.getBoundingClientRect();
    const cash = stack.querySelector('.cash-altitude')?.getBoundingClientRect();
    const visible = (selector) => [...stack.querySelectorAll(selector)].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length;
    return {
      stackWidth: stack.getBoundingClientRect().width,
      heroHeight: hero?.height ?? Infinity,
      railTopDelta: Math.abs((hero?.top ?? 0) - (rail?.top ?? Infinity)),
      railBottomDelta: Math.abs((hero?.bottom ?? 0) - (rail?.bottom ?? Infinity)),
      cashVisible: Boolean(cash && cash.width > 0 && cash.height > 0),
      redundantLabels: visible('.landscape-copy>span, .cash-altitude>small'),
      previewCount: stack.querySelectorAll('.future-preview').length
    };
  });
  assert.ok(wideNow.stackWidth <= 1680, `超宽屏内容被拉伸到 ${wideNow.stackWidth}px`);
  assert.ok(wideNow.heroHeight <= 560, `中央主卡被拉高到 ${wideNow.heroHeight}px`);
  assert.ok(wideNow.railTopDelta <= 1 && wideNow.railBottomDelta <= 1, `右栏没有与中央主卡对齐: ${JSON.stringify(wideNow)}`);
  assert.equal(wideNow.cashVisible, false, '中央主卡重复展示当前余额');
  assert.equal(wideNow.redundantLabels, 0, '现在页仍显示重复辅助标签');
  assert.equal(wideNow.previewCount, 0, '现在页仍保留重复的未来预测区');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: /^现在/ }).click();
  await expectCompactRightRail(page, '.reality-inspector', '现在页右栏');
  assert.equal(await page.locator('.reality-inspector > p').count(), 0, '现在页右栏仍显示对已确认信息的重复解释');

  await page.getByRole('button', { name: /^未来/ }).click();
  await expectCompactRightRail(page, '.future-inspector', '未来页右栏');

  await page.getByRole('button', { name: /^记录/ }).click();
  await expectCompactRightRail(page, '.records-memory', '记录页右栏');

  await expectEveryDesktopSpaceFits(page, { width: 1440, height: 900 });
  await expectEveryDesktopSpaceFits(page, { width: 1280, height: 720 });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: /^现在/ }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await assert.doesNotReject(() => page.getByTestId('now-composition').waitFor());
  await expectBalancedFirstViewport(page, '.live-metrics', { headingTop: 175, primaryTop: 390 });
  const mobileHero = await page.locator('.reality-landscape').evaluate((hero) => {
    const heroRect = hero.getBoundingClientRect();
    const copyRect = hero.querySelector('.landscape-copy')?.getBoundingClientRect();
    return { height: heroRect.height, copyTop: copyRect?.top ?? Infinity, viewportHeight: window.innerHeight };
  });
  assert.ok(mobileHero.height <= 300, `手机中央主卡仍有 ${mobileHero.height}px 高`);
  assert.ok(mobileHero.copyTop < mobileHero.viewportHeight, `手机中央结论未出现在首屏: ${JSON.stringify(mobileHero)}`);
  for (const name of [/^现在/, /^未来/, /^记录/]) {
    await page.getByRole('button', { name }).click();
    const leakedSidebarRules = await page.locator('.page.on aside').evaluateAll((rails) => rails.map((rail) => ({
      height: getComputedStyle(rail).height,
      width: rail.getBoundingClientRect().width,
      overflow: rail.scrollHeight > rail.clientHeight + 1
    })));
    assert.ok(leakedSidebarRules.length > 0, `missing responsive rails for ${name}`);
    for (const rail of leakedSidebarRules) {
      assert.notEqual(rail.height, '76px', `${name} content rail inherited the mobile navigation height`);
      assert.ok(rail.width <= 347, `${name} content rail exceeds the mobile content width`);
      assert.equal(rail.overflow, false, `${name} content rail clips its mobile content`);
    }
  }
});
