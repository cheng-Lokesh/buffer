const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const miniRequire=createRequire(require('node:path').resolve('miniprogram/app.js'));
function appFixture({failed=false}={}) {
  let app;const calls=[];
  const wx={login(options){calls.push({kind:'login',timeout:options.timeout});
    if(failed)options.fail({errMsg:'private failure'});else options.success({code:'fixture-code'});},
    request(options){calls.push({kind:'request',url:options.url,timeout:options.timeout});
      if(options.url.endsWith('/api/auth/wechat'))options.success({statusCode:200,data:{ticket:'ticket'}});
      else if(options.url.endsWith('/api/account/sync'))options.success({statusCode:404,data:{error:'not_deployed'}});
      else if(options.url.endsWith('/user/me'))options.success({statusCode:200,data:{sub:'fixture-account'}});
      else options.success({statusCode:200,data:{sub:'fixture-account',access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:120}});
    },getStorageSync(key){assert.ok(key.startsWith('buffer-zone.account.sync.v1:'));return '';},setStorageSync(key,value){assert.ok(key.startsWith('buffer-zone.account.sync.v1:'));assert.ok(!value.includes('fixture-access'));}};
  // Timer execution is covered by the lifecycle suite's deterministic scheduler.
  vm.runInNewContext(fs.readFileSync('miniprogram/app.js','utf8'),{App:value=>app=value,wx,require:miniRequire,setTimeout:()=>1,clearTimeout:()=>{}});
  return {app,calls};
}
test('application loads signed out with no hidden request, storage access or legacy upload',()=>{
  const f=appFixture();assert.equal(typeof f.app.loginWechat,'function');
  assert.equal(f.app.accountStatus().phase,'signed_out');assert.equal(f.calls.length,0);
  assert.ok(!JSON.stringify(f.app.globalData).includes('fixture-access'));
});
test('explicit login uses native wx transport and logout clears session',async()=>{
  const f=appFixture();const result=await f.app.loginWechat();assert.equal(result.phase,'signed_in');
  assert.equal(f.calls.length,5);assert.ok(f.calls.every(call=>call.timeout===10000));
  assert.equal(f.app.accountSyncStatus().phase,'unavailable');
  assert.equal(await f.app.getAccountAccessToken(),'fixture-access');
  f.app.logoutAccount();assert.equal(f.app.accountStatus().phase,'signed_out');
  await assert.rejects(f.app.getAccountAccessToken(),/authentication_required/);
});
test('native platform failure is recoverable and does not expose provider error text',async()=>{
  const f=appFixture({failed:true});await assert.rejects(f.app.loginWechat(),/^Error: login_unavailable$/);
  assert.equal(f.app.accountStatus().phase,'login_failed');assert.equal(f.calls.length,1);
});
test('same-owner logout/relogin has a new view generation, while concurrent login coalesces',async()=>{
  const f=appFixture();assert.equal(f.app.accountStatus().viewGeneration,0);
  await Promise.all([f.app.loginWechat(),f.app.loginWechat()]);assert.equal(f.app.accountStatus().viewGeneration,1);
  f.app.logoutAccount();assert.equal(f.app.accountStatus().viewGeneration,2);
  await f.app.loginWechat();assert.equal(f.app.accountStatus().viewGeneration,3);
  assert.equal(f.calls.filter(call=>call.kind==='login').length,2);
});
