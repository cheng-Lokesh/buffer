const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

test('the default branch exposes only V12 and V12.1 product evidence', () => {
  const files = trackedFiles();
  const forbiddenExact = new Set([
    '.impeccable/design.json',
    '.impeccable/live/config.json',
    'CHANGELOG.md',
    'design-qa.md',
    '缓冲区｜空窗期生存操作系统.pdf',
    'docs/DESIGN_SYSTEM.md',
    'docs/MINIPROGRAM_LAUNCH_CHECKLIST.md',
    'docs/MINIPROGRAM_V1_PRODUCT_BLUEPRINT.md',
    'docs/VISUAL_SKIN_PRODUCT_MATRIX.md',
    'docs/VISUAL_SKIN_SYSTEM.md',
    'docs/V2_PRODUCT_CONTRACT.md',
    'docs/V2_ROADMAP.md',
    'docs/V2_STAGE_3_CASHFLOW_EXPERIENCE.md',
    'docs/V2_STAGE_4_FOUR_ENTRY_STRUCTURE.md',
    'docs/V2_STAGE_5_DAILY_DECISION_ENGINE.md',
    'docs/V2_STAGE_6_UNIFIED_PROGRESS_RECORDS.md',
    'docs/V2_STAGE_8_INSTRUMENTATION_AND_REAL_USER_VALIDATION.md',
    'docs/V3_PRODUCT_DESIGN_BLUEPRINT.md',
    'docs/V4_DESIGN_SYSTEM.md',
    'docs/V4_PRODUCT_DESIGN_BLUEPRINT.md',
    'docs/V5_DESIGN_SYSTEM.md',
    'docs/V5_NEXT_PRODUCT_BLUEPRINT.md',
    'docs/V5_PRODUCT_DESIGN_BLUEPRINT.md',
    'docs/V6_DESIGN_SYSTEM.md',
    'docs/V6_EXTREME_EXPERIENCE_BLUEPRINT.md',
    'docs/V6_ZERO_LEARNING_EXPERIENCE_BLUEPRINT.md',
    'docs/V7_PRODUCT_BLUEPRINT.md',
    'docs/V8_EXPLAINABLE_FUTURE_BLUEPRINT.md',
    'docs/V9_PRODUCT_CONTRACT.md',
    'docs/V10_PRODUCT_CONTRACT.md',
    'docs/V11_PRODUCT_CONTRACT.md',
    'docs/homepage-redesign-preview.html',
    'docs/miniprogram-v1-preview.css',
    'docs/miniprogram-v1-preview.html',
    'docs/miniprogram-v1-preview.js',
    'docs/v3-blueprint-preview.html',
    'docs/v4-blueprint-preview.html',
    'docs/v5-blueprint-preview.html',
    'docs/v8-blueprint-preview.html',
    'docs/v8-blueprint-preview.js',
    'docs/assets/v5-companion.png',
    'docs/product-research/V9_REFERENCE_RESEARCH.md',
    'docs/product-research/V10_PRODUCT_COMPLETION_RESEARCH.md',
    'docs/product-research/V11_EXPERIENCE_COMPRESSION_RESEARCH.md',
    'docs/product-research/V11_1_INTERACTION_RESEARCH.md',
    'src/cashflow-confirmation.js',
    'src/cashflow-engine.js',
    'src/cashflow-experience.js',
    'src/current-state-visualization.css',
    'src/current-state-visualization.js',
    'src/daily-decision-engine.js',
    'src/daily-records.js',
    'src/editor-validation.js',
    'src/home-command-center.js',
    'src/reality-memory.js',
    'src/research-validation.js',
    'src/v10-onboarding.js',
    'src/v4-confirmed-capture.js',
    'src/v4-decision-model.js',
    'src/v4-strategy-learning.js',
    'src/v4-v3-adapter.js',
    'src/v5-companion.js',
    'src/v5-contact-rhythm.js',
    'src/v5-experience-flow.js',
    'src/v5-quality-hardening.js',
    'src/v6-experience-architecture.js',
    'src/v6-experience-contract.js',
    'src/v7-product-boundary.js',
    'src/viewport-navigation.js',
    'src/visual-skin-artworks.js',
    'src/visual-skin-experience.js',
    'src/visual-skin-page-elements.js',
    'src/visual-skin-reality-map.js',
    'test/v6-experience-architecture.test.js',
    'test/v5-blueprint-contract.test.cjs'
  ]);
  const forbiddenPrefixes = [
    'docs/version-screenshots/',
    'docs/v9-stages/',
    'docs/v10/',
    'docs/v11/',
    'docs/v11-1/',
    'docs/research/',
    'docs/testing/full-product-',
    'docs/testing/home-',
    'docs/testing/homepage-',
    'docs/testing/v0.',
    'docs/testing/v2-',
    'docs/testing/v3-',
    'docs/testing/v4-',
    'docs/testing/v5-',
    'docs/testing/v5.',
    'docs/testing/v6-',
    'docs/testing/V6_',
    'docs/testing/v7-',
    'docs/testing/v8-',
    'docs/testing/v9-',
    'docs/testing/v10-',
    'docs/testing/v11-'
  ];
  const forbidden = files.filter((file) =>
    forbiddenExact.has(file) || forbiddenPrefixes.some((prefix) => file.startsWith(prefix))
  );

  assert.deepEqual(forbidden, [], `superseded evidence is still tracked:\n${forbidden.join('\n')}`);
});

test('current entry documents do not tell AI that superseded evidence remains in the tree', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const product = readFileSync(join(root, 'PRODUCT.md'), 'utf8');
  const copilot = readFileSync(join(root, '.github/copilot-instructions.md'), 'utf8');

  assert.doesNotMatch(readme, /CHANGELOG\.md.*docs\/testing\/.*docs\/version-screenshots\//s);
  assert.doesNotMatch(product, /历史文档保留用于追溯设计演变/);
  assert.doesNotMatch(copilot, /Those materials exist only for migration/);
  assert.match(copilot, /removed from GitHub and exist only in an owner-held offline Git bundle/);
});

test('only current release tests and scripts are exposed in the default tree', () => {
  const files = trackedFiles();
  const allowedTest = /^(?:test\/(?:v12(?:-1)?-|miniprogram-v1-|v8-miniprogram-|v8-platform-parity)|test\/fixtures\/v12-1-)/;
  const allowedScript = new Set([
    'scripts/capture-v12-final.cjs',
    'scripts/run-v12-1-live-ai-eval.mjs',
    'scripts/v12-1-live-evaluator.mjs',
    'scripts/verify-miniprogram-release.cjs'
  ]);
  const retiredSupport = files.filter((file) =>
    (file.startsWith('test/') && !allowedTest.test(file)) ||
    (file.startsWith('scripts/') && !allowedScript.has(file))
  );

  assert.deepEqual(retiredSupport, [], `retired tests or scripts are still tracked:\n${retiredSupport.join('\n')}`);
});
