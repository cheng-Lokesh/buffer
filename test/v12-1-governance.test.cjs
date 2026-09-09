const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function readPngSize(file) {
  const data = fs.readFileSync(path.join(root, file));
  assert.equal(data.toString('ascii', 1, 4), 'PNG', `${file} must be a PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test('V12.1 is the only current product truth and stops before later product work', () => {
  for (const file of ['AGENTS.md', 'PRODUCT.md', 'DESIGN.md', 'PROJECT_REQUIREMENTS.md']) {
    const text = read(file);
    assert.match(text, /docs\/V12_1_PRODUCT_CONTRACT\.md/, file);
    assert.match(text, /v0\.35\.0/, file);
    assert.match(text, /不得.*OCR[\s\S]*银行同步[\s\S]*AI Chat[\s\S]*Final Hardening[\s\S]*V13|停止[\s\S]*OCR[\s\S]*银行同步[\s\S]*AI Chat[\s\S]*Final Hardening[\s\S]*V13/, file);
  }

  const contract = read('docs/V12_1_PRODUCT_CONTRACT.md');
  assert.match(contract, /LLM understands[\s\S]*Code validates[\s\S]*User confirms[\s\S]*Code commits/);
  assert.match(contract, /Language.*Candidate Facts|自然语言.*候选事实/s);
  assert.match(contract, /大模型没有 Reality 写权限/);
  assert.match(contract, /完整历史[\s\S]*备份[\s\S]*身份资料[\s\S]*无关数据/);
  assert.match(contract, /Scenario.*Reality/s);
  assert.match(contract, /Balance Anchor/);
});

test('AI entry points reject historical product shapes and public deployment', () => {
  for (const file of [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    '.github/copilot-instructions.md',
    'docs/HISTORY_BOUNDARY.md'
  ]) {
    const text = read(file);
    assert.match(text, /V12_1_PRODUCT_CONTRACT\.md/, file);
    assert.match(text, /历史|historical|old contracts/i, file);
  }

  assert.match(read('docs/HISTORY_BOUNDARY.md'), /buffer-full-history-before-public-sanitize-2026-09-09\.bundle/);

  for (const file of [
    'docs/V2_PRODUCT_CONTRACT.md',
    'docs/V7_PRODUCT_BLUEPRINT.md',
    'docs/V9_PRODUCT_CONTRACT.md',
    'docs/V10_PRODUCT_CONTRACT.md',
    'docs/V11_PRODUCT_CONTRACT.md'
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, file);

  assert.equal(fs.existsSync(path.join(root, 'docs/V12_PRODUCT_CONTRACT.md')), true);

  for (const file of [
    '.github/workflows/deploy-pages.yml',
    'docs/BACKEND_SETUP.md',
    'docs/BUFFER_V9_FINAL_COMPLETION_REPORT.md',
    'docs/CLOUDFLARE_DEPLOY.md',
    'docs/HOME_COMMAND_CENTER_BLUEPRINT.md',
    'docs/PAYMENT_SYSTEM.md'
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, file);
});

test('V12.1 release evidence and exact browser screenshots are present', () => {
  for (const file of [
    'docs/v12-1/00-parser-audit.md',
    'docs/v12-1/01-architecture-privacy.md',
    'docs/v12-1/06-daily-use-acceptance.md',
    'docs/v12-1/07-screenshot-review.md',
    'docs/v12-1/08-final-acceptance.md',
    'docs/v12-1/DEFERRED.md',
    'docs/v12-1/REAL_LANGUAGE_CASES.md',
    'docs/v12-1/live-ai-evaluation.json',
    'docs/product-research/V12_1_LLM_PROVIDER_RESEARCH.md'
  ]) assert.equal(fs.existsSync(path.join(root, file)), true, file);

  const expected = [
    ['01-fast-path-desktop.png', 1280, 850],
    ['02-natural-language-input-desktop.png', 1280, 850],
    ['03-llm-candidates-desktop.png', 1280, 850],
    ['04-multi-fact-desktop.png', 1280, 850],
    ['05-partial-clarification-desktop.png', 1280, 850],
    ['06-scenario-mixed-desktop.png', 1280, 850],
    ['07-condition-change-desktop.png', 1280, 850],
    ['08-balance-anchor-desktop.png', 1280, 850],
    ['09-provider-error-desktop.png', 1280, 850],
    ['10-natural-language-mobile.png', 390, 844],
    ['11-multi-candidate-mobile.png', 390, 844],
    ['12-clarification-mobile.png', 390, 844],
    ['13-confirm-mobile.png', 390, 844],
    ['14-complete-mobile.png', 390, 844]
  ];
  const directory = path.join(root, 'docs/testing/v12-1-after');
  const actual = fs.readdirSync(directory).filter((name) => name.endsWith('.png')).sort();
  assert.deepEqual(actual, expected.map(([name]) => name));
  for (const [name, width, height] of expected) {
    assert.deepEqual(readPngSize(`docs/testing/v12-1-after/${name}`), { width, height }, name);
  }
});

test('V12.1 release report records the live safety gate and release identity', () => {
  const report = read('docs/v12-1/08-final-acceptance.md');
  for (const phrase of [
    'TOTAL: 50',
    'CORRECT: 40',
    'CORRECT_WITH_CLARIFICATION: 10',
    'WRONG_PARSE: 0',
    'UNSUPPORTED: 0',
    'UNSAFE_PARSE: 0',
    'Scenario→Reality: 0',
    'Negation Error: 0',
    'Balance duplicate: 0',
    'v0.35.0',
    'RELEASED'
  ]) assert.match(report, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), phrase);
});
