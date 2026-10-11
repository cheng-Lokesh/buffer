const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function adapter(){const file=path.resolve('miniprogram/utils/browser-pairing.js');assert.ok(fs.existsSync(file),'native browser authorization adapter missing');return require(file).approveMiniBrowserLogin;}
function fixture(){let generation=1,requests=0;const app={accountStatus:()=>({phase:'signed_in',accountId:'fixture-owner',viewGeneration:generation}),getAccountAccessToken:async()=> 'fixture-access'};
  const platform={login:options=>options.success({code:'fresh-fixture-code'}),request:options=>{requests++;assert.equal(options.header.Authorization,'Bearer fixture-access');assert.deepEqual(options.data,{code:'ABCDEFGH',wechatCode:'fresh-fixture-code'});options.success({statusCode:200,data:{approved:true}});}};
  return {app,platform,scope:app.accountStatus(),switch:()=>generation++,get requests(){return requests;}};}
test('native explicit approval uses fresh wx login and current user token, not local financial storage',async()=>{const f=fixture();await adapter()(f.platform,f.app,'ABCDEFGH',{confirmed:true,scope:f.scope});assert.equal(f.requests,1);});
test('native approval rejects missing consent, invalid code and changed account before sending',async()=>{
  const fn=adapter(),f=fixture();await assert.rejects(fn(f.platform,f.app,'ABCDEFGH',{}),/browser_approval_rejected/);
  await assert.rejects(fn(f.platform,f.app,'bad',{confirmed:true,scope:f.scope}),/browser_approval_rejected/);
  f.switch();await assert.rejects(fn(f.platform,f.app,'ABCDEFGH',{confirmed:true,scope:f.scope}),/browser_approval_rejected/);assert.equal(f.requests,0);
});
test('visible native entry asks for code and a separate confirmation before approving',async()=>{
  let definition,calls=0;const scopes={phase:'signed_in',accountId:'fixture-owner',viewGeneration:1},dialogs=[];
  vm.runInNewContext(fs.readFileSync('miniprogram/components/account-entry/index.js','utf8'),{
    Component:v=>definition=v,getApp:()=>({accountStatus:()=>scopes}),
    require:()=>({approveMiniBrowserLogin:async(_wx,_app,code,options)=>{calls++;assert.equal(code,'ABCDEFGH');assert.equal(options.confirmed,true);}}),
    wx:{showModal:options=>{dialogs.push(options);options.success({confirm:true,content:'abcdefgh'});},showToast:()=>{}}
  });
  const component={...definition.methods,data:structuredClone(definition.data),setData:v=>Object.assign(component.data,v)};
  assert.equal(typeof component.authorizeBrowser,'function','native browser login entry missing');await component.authorizeBrowser();assert.equal(calls,1);assert.equal(dialogs.length,2);assert.equal(dialogs[0].editable,true);
  assert.match(fs.readFileSync('miniprogram/components/account-entry/index.wxml','utf8'),/bindtap="authorizeBrowser"/);
});
