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
  vm.runInNewContext(fs.readFileSync('miniprogram/components/account-entry/index.js','utf8'),{Component:value=>definition=value,getApp:()=>app,getCurrentPages:()=>[{onAccountChange:()=>resets++}],wx:{showModal:opts=>opts.success({confirm})}});
  const component={...definition.methods,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};
  await component.activate();assert.equal(resets,1);await component.activate();assert.equal(resets,2);confirm=false;await component.activate();assert.equal(resets,2);
});
