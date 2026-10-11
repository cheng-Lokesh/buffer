const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('live Mini Program login acceptance follows current sync copy and proves local state unchanged', () => {
  const source = fs.readFileSync('scripts/check-mini-account-live.mjs', 'utf8');
  const start = source.indexOf("stage='visible_login_response'");
  const end = source.indexOf("stage='visible_logout'", start);

  assert.notEqual(start, -1, 'login acceptance stage exists');
  assert.notEqual(end, -1, 'logout acceptance stage exists');
  const loginFlow = source.slice(start, end);

  assert.match(loginFlow, /assert\.equal\(await phase\(\),'signed_in'\)/);
  assert.match(loginFlow, /assert\.equal\(await current\.component\.data\('label'\),'微信已登录'\)/);
  assert.doesNotMatch(loginFlow, /本机数据未上传/);
  assert.match(loginFlow, /assert\.equal\(await fingerprint\(\),original,'local_state_changed'\)/);
});
