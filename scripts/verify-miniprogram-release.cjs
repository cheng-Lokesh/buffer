const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const miniRoot = path.join(root, 'miniprogram');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const checks = [];
const check = (ok, name, detail = '') => checks.push({ ok: Boolean(ok), name, detail });
const warn = (ok, name, detail = '') => checks.push({ ok: Boolean(ok), warning: true, name, detail });

function parseJson(relative) {
  try {
    return JSON.parse(read(relative));
  } catch (error) {
    check(false, `${relative} 是有效 JSON`, error.message);
    return null;
  }
}

const app = parseJson('miniprogram/app.json');
const project = parseJson('miniprogram/project.config.json');
const sitemap = parseJson('miniprogram/sitemap.json');
const expectedPages = ['pages/reality/index', 'pages/future/index', 'pages/conditions/index', 'pages/history/index'];
const expectedTabs = ['现在', '未来', '条件', '记录'];

if (app) {
  check(JSON.stringify(app.pages) === JSON.stringify(expectedPages), '仅声明四个正式手机入口', JSON.stringify(app.pages));
  check(JSON.stringify((app.tabBar?.list || []).map((item) => item.text)) === JSON.stringify(expectedTabs), '底部入口名称正确');
  for (const page of expectedPages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      check(exists(`miniprogram/${page}.${ext}`), `${page}.${ext} 存在`);
    }
  }
}

check(Boolean(sitemap), 'sitemap 可解析');
if (project) {
  check(project.compileType === 'miniprogram' && project.miniprogramRoot === './', '微信开发者工具导入配置正确');
  warn(project.appid && project.appid !== 'touristappid', '已配置正式 AppID', '当前 touristappid 可用于本地模拟；手机预览和平台审核前需替换。');
}

const runtimeFiles = fs.readdirSync(miniRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath || entry.path, entry.name));
const runtimeSource = runtimeFiles
  .filter((file) => /\.(?:js|json|wxml|wxss)$/.test(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

for (const forbidden of ['wx.request(', 'wx.login(', 'wx.requestPayment(', 'apiBase']) {
  check(!runtimeSource.includes(forbidden), `本地优先边界不包含 ${forbidden}`);
}
for (const retired of ['岗位', '机会', '项目推进', '会员购买']) {
  check(!runtimeSource.includes(retired), `正式手机端不包含旧概念“${retired}”`);
}

for (const asset of ['ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field']) {
  const relative = `miniprogram/assets/skins/${asset}.webp`;
  check(exists(relative) && fs.statSync(path.join(root, relative)).size > 0, `皮肤资源 ${asset} 完整`);
}

const packageSize = runtimeFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
check(packageSize < 2 * 1024 * 1024, '小程序主包小于 2 MiB', `${packageSize} bytes`);

const failures = checks.filter((item) => !item.ok && !item.warning);
const warnings = checks.filter((item) => !item.ok && item.warning);
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : item.warning ? 'WARN' : 'FAIL'} ${item.name}`);
  if (!item.ok && item.detail) console.log(`  ${item.detail}`);
}
console.log(`\nSummary: ${checks.length - failures.length - warnings.length}/${checks.length} passing, ${failures.length} failures, ${warnings.length} warnings`);
if (failures.length) process.exit(1);
