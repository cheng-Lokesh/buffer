const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const filename=require('node:path').resolve('miniprogram/components/account-entry/index.js'),nativeRequire=require('node:module').createRequire(filename);
function fixture({cancel=false,clipboardFails=false,switchAccount=false,phase='conflict'}={}){
  const {applyConfirmedAccountOperation}=nativeRequire('../../core/account-confirmation');
  const state=balance=>applyConfirmedAccountOperation({state:null,operationId:`fixture-conflict-${balance}`,operation:{type:'confirm_reality',action:'confirm_basics',cash:{balance,reserve:100,daily:20},confirmedAt:'2026-10-11T02:00:00.000Z'}}).state;
  let definition,generation=1,adopted=0,retries=0,clips=0;const modals=[],toasts=[];
  const sync={phase,pendingCount:1,revision:1,state:state(200),conflict:{revision:2,state:state(400)}};
  const app={accountStatus:()=>({phase:'signed_in',accountId:'fixture-private-id',viewGeneration:generation}),accountSyncStatus:()=>sync,
    refreshAccount:async()=>{retries++;sync.phase='synced';},acceptCloudAccountVersion:options=>{assert.equal(options.confirmed,true);assert.equal(options.discardPending,true);adopted++;sync.phase='synced';sync.pendingCount=0;sync.state=sync.conflict.state;sync.conflict=null;}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Component:value=>definition=value,getApp:()=>app,require:id=>id==='../../utils/account-store'?{exportText:()=>JSON.stringify(sync.state)}:nativeRequire(id),wx:{
    showModal:options=>{modals.push(options);if(switchAccount&&modals.length===2)generation++;options.success({confirm:!cancel});},
    setClipboardData:options=>{clips++;clipboardFails?options.fail():options.success();},showToast:options=>toasts.push(options.title)
  }});
  const component={...definition.methods,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};
  return {component,modals,toasts,get adopted(){return adopted;},get retries(){return retries;},get clips(){return clips;}};
}
test('conflict entry shows both versions and requires successful backup plus a second scoped confirmation',async()=>{
  const f=fixture();assert.equal(typeof f.component.manageSync,'function');await f.component.manageSync();
  assert.equal(f.modals.length,2);assert.match(f.modals[0].content,/200/);assert.match(f.modals[0].content,/400/);assert.match(f.modals[1].content,/待同步/);
  assert.equal(f.clips,1);assert.equal(f.adopted,1);assert.ok(!JSON.stringify(f.component.data).includes('fixture-private-id'));assert.equal(f.component.data.busy,false);
});
test('cancel, failed backup and changed session cannot discard confirmed local work',async()=>{
  for(const options of [{cancel:true},{clipboardFails:true},{switchAccount:true}]){const f=fixture(options);await f.component.manageSync();assert.equal(f.adopted,0);assert.equal(f.component.data.busy,false);}
});
test('offline sync action retries without exporting or adopting data',async()=>{
  const f=fixture({phase:'offline'});await f.component.manageSync();assert.equal(f.retries,1);assert.equal(f.clips,0);assert.equal(f.adopted,0);assert.equal(f.modals.length,0);
});
