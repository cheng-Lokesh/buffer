const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'site/index.src.html'), 'utf8');
const layoutAudit = fs.readFileSync(path.join(root, 'site/audit_layout.py'), 'utf8');
const pageVerifier = fs.readFileSync(path.join(root, 'site/verify_pages.py'), 'utf8');

test('current site never presents the design fixture as the real user reality', () => {
  assert.match(source, /data-product-state="preview"/);
  assert.match(source, /当前是界面预览[^<]*数据尚未保存/);
  assert.doesNotMatch(source, />星河</);
});

test('the four primary spaces use native, stateful navigation controls', () => {
  for (const page of ['now', 'future', 'cond', 'rec']) {
    assert.match(
      source,
      new RegExp(`<button[^>]+class="nav-item[^"]*"[^>]+data-page="${page}"[^>]+aria-controls="page-${page}"`),
      `${page} must be a semantic navigation button`,
    );
  }
  assert.match(source, /aria-current="page"/);
  assert.match(source, /setAttribute\('aria-current',\s*'page'\)/);
});

test('decorative controls are not exposed as working product actions', () => {
  assert.match(source, /data-control-state="unavailable"/);
  assert.match(source, /当前是界面预览，数据尚未保存/);
});

test('visual verification uses isolated browser profiles and fails when Edge produces no evidence', () => {
  for (const script of [layoutAudit, pageVerifier]) {
    assert.match(script, /tempfile\.mkdtemp/);
    assert.match(script, /shutil\.rmtree/);
  }
  assert.match(layoutAudit, /raise RuntimeError\("Edge audit produced no report/);
  assert.match(pageVerifier, /raise RuntimeError\("Edge screenshot missing/);
});

test('current site has an explicit mobile layout and audits a phone viewport', () => {
  assert.match(source, /@media \(max-width: 700px\)/);
  assert.match(source, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(source, /overflow-y:\s*auto/);
  assert.match(layoutAudit, /\("390,844",\s*"PHONE390"\)/);
});

test('switching primary spaces resets the scroll position', () => {
  assert.match(source, /document\.querySelector\('main'\)\?\.scrollTo\(\{\s*top:\s*0/);
});
