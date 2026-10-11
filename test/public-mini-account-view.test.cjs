const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('account view reset clears drafts, predictions and financial display before refresh',()=>{
  const {withAccountView}=require('../miniprogram/utils/account-view');
  let phase='signed_out',id=null,refreshes=0;
  const definition=withAccountView({data:{captureText:'',candidateItems:[],balanceLabel:'待确认',simulationResult:null},refresh(){refreshes++;}},{accountStatus:()=>({phase,accountId:id})});
  const page={...definition,data:{...definition.data},setData:value=>Object.assign(page.data,value)};
  page.onShow();page.data.captureText='private draft';page.data.candidateItems=[{amount:999}];page.data.balanceLabel='private amount';page.data.simulationResult={private:true};
  phase='signed_in';id='fixture-a';page.onShow();assert.equal(page.data.captureText,'');assert.equal(page.data.balanceLabel,'待确认');assert.equal(page.data.simulationResult,null);assert.deepEqual(page.data.candidateItems,[]);
  page.data.captureText='same account draft';page.onShow();assert.equal(page.data.captureText,'same account draft');
  id='fixture-b';page.onAccountChange();assert.equal(page.data.captureText,'');assert.equal(refreshes,4);
});
test('real account component notifies active page after approved login and logout, not after cancellation',async()=>{
  let definition,phase='signed_out',resets=0,confirm=true;
  const app={accountStatus:()=>({phase}),loginWechat:async()=>{phase='signed_in';},logoutAccount:()=>{phase='signed_out';}};
  vm.runInNewContext(fs.readFileSync('miniprogram/components/account-entry/index.js','utf8'),{Component:value=>definition=value,getApp:()=>app,getCurrentPages:()=>[{onAccountChange:()=>resets++}],wx:{showModal:opts=>opts.success({confirm})}},{filename:require('node:path').resolve('miniprogram/components/account-entry/index.js')});
  const component={...definition.methods,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};
  await component.activate();assert.equal(resets,1);await component.activate();assert.equal(resets,2);confirm=false;await component.activate();assert.equal(resets,2);
});
test('local/default page lifecycle remains usable without optional refresh or account hooks',()=>{
  const {withAccountView}=require('../miniprogram/utils/account-view');
  const empty=withAccountView({});const page={...empty,setData(){}};page.onShow();page.onAccountChange();
  let calls=0;const definition=withAccountView({data:{draft:''},onShow(){calls++;}});
  const p={...definition,setData(){}};p.onShow();p.onShow();assert.equal(calls,2);
});

test('visible pages subscribe once, refresh same-account facts and clear drafts on scope change',()=>{
  const {withAccountView}=require('../miniprogram/utils/account-view');let callback,subscribes=0,detaches=0,refreshes=0,id='fixture-a';
  const app={accountStatus:()=>({phase:'signed_in',accountId:id}),subscribeAccountSync(fn){subscribes++;callback=fn;return ()=>{detaches++;callback=null;};}};
  const definition=withAccountView({data:{draft:''},refresh(){refreshes++;}},app),page={...definition,data:{draft:''},setData(value){Object.assign(this.data,value);}};
  page.onShow();page.onShow();assert.equal(subscribes,1);page.data.draft='unsaved';callback();assert.equal(page.data.draft,'unsaved');assert.equal(refreshes,3);
  id='fixture-b';callback();assert.equal(page.data.draft,'');page.onHide();assert.equal(detaches,1);assert.equal(callback,null);
  page.onShow();assert.equal(subscribes,2);page.onUnload();assert.equal(detaches,2);
});

test('account entry observes real sync phases and stops listening when hidden',()=>{
  let definition,callback,phase='synced',detaches=0;
  const app={accountStatus:()=>({phase:'signed_in'}),accountSyncStatus:()=>({phase,pendingCount:phase==='offline'?2:0}),subscribeAccountSync(fn){callback=fn;return ()=>{callback=null;detaches++;};}};
  vm.runInNewContext(fs.readFileSync('miniprogram/components/account-entry/index.js','utf8'),{Component:value=>definition=value,getApp:()=>app},{filename:require('node:path').resolve('miniprogram/components/account-entry/index.js')});
  const component={...definition.methods,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};
  definition.lifetimes.attached.call(component);assert.equal(component.data.message,'已同步');
  phase='offline';callback();assert.match(component.data.message,/2.*待同步/);
  phase='conflict';callback();assert.match(component.data.message,/冲突/);
  definition.pageLifetimes.hide.call(component);assert.equal(detaches,1);
  definition.pageLifetimes.show.call(component);assert.equal(typeof callback,'function');definition.lifetimes.detached.call(component);assert.equal(detaches,2);
});
