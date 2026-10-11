const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const nativeRequire=createRequire(require('node:path').resolve('miniprogram/app.js'));
function fixture(){
  let app,network,offline=false;const requests=[],storage=new Map(),reads=[];
  let view={protocolVersion:1,schemaVersion:9,revision:0,deletionGeneration:0,state:null};
  const wx={login:opts=>opts.success({code:'fixture-code'}),
    getStorageSync:key=>{reads.push(key);return storage.get(key)||'';},
    setStorageSync:(key,value)=>storage.set(key,value),
    onNetworkStatusChange:callback=>{network=callback;},
    request:opts=>{
      requests.push(opts);
      if(opts.url.endsWith('/api/account/sync')){
        if(offline)return opts.fail({errMsg:'private network error'});
        if(opts.method==='POST'){
          const command=opts.data;
          view={...view,revision:view.revision+1,state:{schemaVersion:9,cash:command.operation.cash}};
        }
        return opts.success({statusCode:200,data:view});
      }
      if(opts.url.endsWith('/api/auth/wechat'))return opts.success({statusCode:200,data:{ticket:'ticket'}});
      if(opts.url.endsWith('/user/me'))return opts.success({statusCode:200,data:{sub:'fixture-account'}});
      return opts.success({statusCode:200,data:{sub:'fixture-account',access_token:'fixture-token',refresh_token:'fixture-refresh',expires_in:120}});
    }};
  vm.runInNewContext(fs.readFileSync('miniprogram/app.js','utf8'),{App:value=>app=value,wx,require:nativeRequire});
  return {app,requests,reads,storage,setOffline:value=>offline=value,reconnect:()=>network({isConnected:true})};
}
const operation={type:'confirm_reality',action:'confirm_basics',cash:{balance:6000,reserve:1000,daily:30},confirmedAt:'2026-10-11T02:00:00.000Z'};
test('native App exposes confirmed sync without reading legacy state or making startup requests',async()=>{
  const f=fixture();assert.equal(typeof f.app.confirmAccountOperation,'function');
  f.app.onLaunch();await f.app.onShow();assert.equal(f.requests.length,0);assert.equal(f.reads.length,0);
  await f.app.loginWechat();assert.equal(f.app.accountSyncStatus().phase,'synced');
  assert.ok(f.reads.every(key=>key.startsWith('buffer-zone.account.sync.v1:')));
  assert.equal(f.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/api/account/sync')).length,0);
  await assert.rejects(f.app.confirmAccountOperation(operation),/explicit_confirmation_required/);
  await f.app.confirmAccountOperation(operation,{confirmed:true});
  assert.equal(f.app.accountSyncStatus().pendingCount,0);assert.equal(f.app.accountSyncStatus().state.cash.balance,6000);
  const sent=f.requests.find(r=>r.method==='POST'&&r.url.endsWith('/api/account/sync'));
  assert.equal(sent.header.Authorization,'Bearer fixture-token');assert.equal(sent.timeout,10000);
  assert.ok(!JSON.stringify([...f.storage.values()]).includes('fixture-token'));
  f.app.logoutAccount();assert.equal(f.app.accountSyncStatus().state,null);
});
test('native foreground and reconnect resume queued work; logout does not expose prior state',async()=>{
  const f=fixture();assert.equal(typeof f.app.accountSyncStatus,'function');f.app.onLaunch();await f.app.loginWechat();
  f.setOffline(true);await f.app.confirmAccountOperation(operation,{confirmed:true});assert.equal(f.app.accountSyncStatus().phase,'offline');
  assert.equal(f.app.accountSyncStatus().pendingCount,1);f.setOffline(false);await f.reconnect();
  assert.equal(f.app.accountSyncStatus().phase,'synced');await f.app.onShow();
  f.app.logoutAccount();await f.reconnect();await f.app.onShow();assert.equal(f.app.accountSyncStatus().state,null);
});
test('native account actions cannot migrate, delete or resolve another view before authentication',async()=>{
  const f=fixture();assert.equal(f.app.accountSyncStatus().state,null);f.app.logoutAccount();
  assert.throws(()=>f.app.previewAccountMigration({schemaVersion:9}),/authentication_required/);
  await assert.rejects(f.app.confirmAccountMigration({}, {confirmed:true}),/authentication_required/);
  await assert.rejects(f.app.deleteAccountData({confirmed:true}),/authentication_required/);
  assert.throws(()=>f.app.acceptCloudAccountVersion({confirmed:true,discardPending:true}),/authentication_required/);
  assert.equal(f.requests.length,0);assert.equal(f.reads.length,0);
  const {createMiniAccountController}=nativeRequire('./utils/account-controller');
  assert.throws(()=>createMiniAccountController({},{}),/native_account_storage_required/);
});
