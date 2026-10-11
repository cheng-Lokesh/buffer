const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture({confirm=true,fail=false,modalFail=false,deferModal=false}={}) {
  let definition;let phase='signed_out',logins=0,logouts=0,modals=0,dialog;
  const app={accountStatus:()=>({phase,accountId:phase==='signed_in'?'fixture-private-id':null}),
    loginWechat:async()=>{logins++;if(fail)throw Error('private token');phase='signed_in';},
    logoutAccount:()=>{logouts++;phase='signed_out';}};
  vm.runInNewContext(fs.readFileSync('miniprogram/components/account-entry/index.js','utf8'),{
    Component:value=>definition=value,getApp:()=>app,
    wx:{showModal:options=>{modals++;dialog=options;if(!deferModal)modalFail?options.fail():options.success({confirm});}}
  },{filename:path.resolve('miniprogram/components/account-entry/index.js')});
  const component={...definition.methods,data:structuredClone(definition.data),
    setData(value){Object.assign(this.data,value);}};
  definition.lifetimes.attached.call(component);
  return {component,definition,setPhase(value){phase=value;},resolveModal(){dialog.success({confirm});},get modals(){return modals;},get logins(){return logins;},get logouts(){return logouts;}};
}
test('all four spaces expose one identical account component without a new navigation space',()=>{
  const config=JSON.parse(fs.readFileSync('miniprogram/app.json','utf8'));
  assert.equal(config.usingComponents?.['account-entry'],'/components/account-entry/index');
  for(const page of config.pages)assert.match(fs.readFileSync(`miniprogram/${page}.wxml`,'utf8'),/<account-entry id="accountEntry"\s*\/>/);
  assert.equal(config.pages.length,4);
});
test('entry starts locally, requires explicit login confirmation, and never displays account IDs',async()=>{
  const f=fixture({confirm:false});assert.equal(f.logins,0);
  assert.equal(f.component.data.label,'微信登录');await f.component.activate();assert.equal(f.logins,0);
  assert.ok(!JSON.stringify(f.component.data).includes('fixture-private-id'));
  const g=fixture();await g.component.activate();assert.equal(g.logins,1);
  assert.equal(g.component.data.label,'微信已登录');assert.equal(g.component.data.busy,false);
  // This fixture deliberately has no sync provider; do not invent a synced state.
  assert.equal(g.component.data.message,'同步尚未连接');
  await g.component.activate();assert.equal(g.logouts,1);assert.equal(g.component.data.label,'微信登录');
});
test('failures preserve local-only state with actionable sanitized retry and stable loading',async()=>{
  const f=fixture({fail:true});await f.component.activate();
  assert.equal(f.component.data.busy,false);assert.equal(f.component.data.label,'重新登录');
  assert.equal(f.component.data.message,'登录未完成，请重试');
  assert.ok(!JSON.stringify(f.component.data).includes('private token'));
  f.component.setData({busy:true});await f.component.activate();assert.equal(f.logins,1);
});

test('page visibility refreshes expired state and failed dialogs never log in',async()=>{
  const f=fixture({modalFail:true});await f.component.activate();assert.equal(f.logins,0);
  f.setPhase('session_expired');f.definition.pageLifetimes.show.call(f.component);
  assert.equal(f.component.data.label,'重新登录');
});

test('repeated taps and page-show cannot stack confirmation dialogs',async()=>{
  const f=fixture({deferModal:true});const first=f.component.activate();
  assert.equal(f.component.data.confirming,true);
  f.definition.pageLifetimes.show.call(f.component);
  await f.component.activate();assert.equal(f.modals,1);
  f.resolveModal();await first;
  assert.equal(f.component.data.confirming,false);assert.equal(f.logins,1);
});
