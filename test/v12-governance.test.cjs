const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('V12 invariants remain preserved under the current V12.1 product truth', () => {
  for (const file of ['AGENTS.md', 'PRODUCT.md', 'DESIGN.md', 'PROJECT_REQUIREMENTS.md']) {
    const text = read(file);
    assert.match(text, /docs\/V12_1_PRODUCT_CONTRACT\.md/, file);
    assert.match(text, /v0\.35\.0/, file);
    assert.match(text, /不得.*OCR.*银行同步.*Final Hardening.*V13|停止.*OCR.*银行同步.*Final Hardening.*V13/s, file);
  }
  assert.equal(fs.existsSync(path.join(root, 'docs/V12_PRODUCT_CONTRACT.md')), true);
  const contract = read('docs/V12_PRODUCT_CONTRACT.md');
  assert.match(contract, /不追求完整账本/);
  assert.match(contract, /一次性.*余额重新确认/s);
  assert.match(contract, /AI may parse[\s\S]*User must confirm[\s\S]*Only confirmed facts become Reality/);
  assert.match(contract, /Balance Anchor/);
  assert.match(contract, /Scenario/);
});

test('V12 release evidence is complete and screenshots are present', () => {
  for (const file of [
    'docs/v12/03-ai-architecture-privacy.md',
    'docs/v12/04-platform-voice-support.md',
    'docs/v12/05-undo-decision.md',
    'docs/v12/06-daily-use-acceptance.md',
    'docs/v12/07-screenshot-review.md',
    'docs/v12/08-final-acceptance.md',
    'docs/v12/DEFERRED_HARDENING.md'
  ]) assert.equal(fs.existsSync(path.join(root, file)), true, file);
  for (let index = 1; index <= 14; index += 1) {
    const prefix = `${String(index).padStart(2, '0')}-`;
    const matches = fs.readdirSync(path.join(root, 'docs/testing/v12-after')).filter((name) => name.startsWith(prefix) && name.endsWith('.png'));
    assert.equal(matches.length, 1, prefix);
  }
});
