const test=require('node:test');
const assert=require('node:assert/strict');
const {emptyState}=require('../miniprogram/core/state');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createBackup}=require('../miniprogram/core/transfer');
function fixture(){
  const values=new Map(),writes=[],notices=[];let failRead=false;
  global.wx={getStorageSync:key=>{if(failRead)throw Error('sensitive native error');return values.get(key);},setStorageSync:(key,value)=>{writes.push(key);values.set(key,value);},removeStorageSync:key=>values.delete(key),showToast:value=>notices.push(value)};
  const path=require.resolve('../miniprogram/utils/store');delete require.cache[path];const store=require(path);
  return {store,values,writes,notices,setFailRead:value=>{failRead=value;}};
}
test('storage read failure is visible and never acknowledged as new empty writable data',()=>{
  const f=fixture();f.values.set(f.store.KEY,{...emptyState(),cash:{balance:1000,reserve:100,daily:20}});const original=JSON.stringify(f.values.get(f.store.KEY));f.setFailRead(true);
  const state=f.store.load();assert.equal(state.storageError,true);assert.equal(state.cash.balance,'');assert.ok(f.notices.length>0);
  for(const action of [()=>f.store.recordCash({balance:2000,reserve:100,daily:20}),()=>f.store.recordV8Event({type:'expense',amount:20,occurredAt:'2026-10-11'}),()=>f.store.setSkin('pixel-garden'),()=>f.store.setV8Condition('x',{amount:2}),()=>f.store.addV8CashCondition({}),()=>f.store.saveV8Scenario({}),()=>f.store.captureReality([{type:'balance_confirmation',amount:2,occurredAt:'2026-10-11'}])])assert.equal(action().ok,false);
  assert.equal(f.store.save(state).ok,false);assert.equal(f.store.exportText(),null);assert.equal(f.writes.length,0);assert.equal(JSON.stringify(f.values.get(f.store.KEY)),original);
  f.setFailRead(false);assert.equal(f.store.load().storageError,undefined);assert.equal(f.store.load().cash.balance,1000);assert.equal(f.store.recordCash({balance:900,reserve:100,daily:20}).ok,true);delete global.wx;
});
test('corrupt and future current state are retained and cannot be normalized into overwrite permission',()=>{
  for(const broken of ['damaged',[],{...emptyState(),version:99},{...emptyState(),cashReality:{conditions:[{id:'broken',type:'nonsense',amount:1}]}}]){
    const f=fixture();f.values.set(f.store.KEY,broken);assert.equal(f.store.load().storageError,true);assert.equal(f.store.recordCash({balance:2000,reserve:100,daily:20}).ok,false);assert.equal(f.writes.length,0);assert.deepEqual(f.values.get(f.store.KEY),broken);delete global.wx;
  }
});
test('unreadable data cannot be exported as an empty backup or replaced without explicit recovery',()=>{
  const f=fixture();f.values.set(f.store.KEY,'damaged');assert.equal(f.store.exportText(),null);
  assert.equal(f.store.save(emptyState()).ok,false);assert.equal(f.values.get(f.store.KEY),'damaged');
  assert.equal(f.store.restoreState(emptyState()).ok,false);assert.equal(f.store.restoreState(emptyState(),{confirmed:true}).ok,true);assert.equal(f.store.load().storageError,undefined);delete global.wx;
});
test('new empty storage remains writable and invalid legacy data is not migrated destructively',()=>{
  const f=fixture();assert.equal(f.store.load().storageError,undefined);assert.equal(f.store.recordCash({balance:50,reserve:10,daily:2}).ok,true);delete global.wx;
  const g=fixture();g.values.set(g.store.LEGACY_KEY,'damaged');assert.equal(g.store.load().storageError,true);assert.equal(g.writes.length,0);assert.equal(g.values.get(g.store.LEGACY_KEY),'damaged');delete global.wx;
});
test('valid mutations, validation failures, restore/export and write errors preserve guard semantics',()=>{
  const f=fixture();f.store.load();assert.equal(f.store.recordCash({balance:5000,reserve:500,daily:20}).ok,true);
  assert.equal(f.store.recordCash({balance:-1}).ok,false);assert.equal(f.store.recordV8Event({type:'invalid'}).ok,false);assert.equal(f.store.addV8CashCondition({}).ok,false);
  assert.equal(f.store.recordV8Event({type:'income',amount:10,occurredAt:'2026-10-11'}).ok,true);
  assert.equal(f.store.addV8CashCondition({type:'recurring_expense',amount:10,frequency:'monthly',nextOccurrence:'2026-10-15'}).ok,true);
  assert.equal(f.store.setV8Condition('reserve',{amount:400}).ok,true);assert.equal(f.store.setSkin('pixel-garden').ok,true);
  assert.equal(f.store.saveV8Scenario({id:'fixture-scenario',dailyFloorDelta:5}).ok,true);
  assert.equal(f.store.captureReality([{type:'balance_confirmation',amount:4000,occurredAt:'2026-10-11'}]).ok,true);
  assert.equal(f.store.captureReality([{type:'unsupported'}]).ok,false);
  const backup=f.store.exportText();assert.equal(typeof backup,'string');assert.equal(f.store.importText(backup).ok,true);assert.equal(f.store.importText('broken').ok,false);
  assert.equal(f.store.restoreState({version:99},{confirmed:true}).ok,false);
  const before=JSON.stringify(f.values.get(f.store.KEY));global.wx.setStorageSync=()=>{throw Error('quota');};
  for(const action of [()=>f.store.recordCash({balance:900,reserve:100,daily:20}),()=>f.store.recordV8Event({type:'income',amount:10,occurredAt:'2026-10-11'}),()=>f.store.setV8Condition('reserve',{amount:400}),()=>f.store.addV8CashCondition({type:'known_event',amount:10,nextOccurrence:'2026-10-18'}),()=>f.store.saveV8Scenario({id:'fixture-other-scenario'}),()=>f.store.captureReality([{type:'balance_confirmation',amount:4000,occurredAt:'2026-10-11'}]),()=>f.store.importText(backup)])assert.equal(action().ok,false);
  assert.equal(JSON.stringify(f.values.get(f.store.KEY)),before);assert.equal(f.store.clear().ok,true);global.wx.removeStorageSync=()=>{throw Error('failed');};assert.equal(f.store.clear().ok,false);delete global.wx;
});
test('both backup controllers refuse empty exports and require the actual restore confirmation',async()=>{
  for(const page of ['history','settings']){
    let definition,dialog,clipboardWrites=0,restores=0,refreshes=0;
    const filename=path.resolve(`miniprogram/pages/${page}/index.js`),localRequire=require('node:module').createRequire(filename);
    const stub={exportText:()=>null,restoreState:(state,options)=>{assert.equal(options.confirmed,true);restores++;return {ok:true};}};
    const platform={showToast:()=>{},setClipboardData:()=>{clipboardWrites++;},getClipboardData:input=>input.success({data:JSON.stringify(createBackup(emptyState()))}),showModal:input=>{dialog=input;}};
    vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Page:value=>{definition=value;},wx:platform,require:name=>['../../utils/store','../../utils/account-store'].includes(name)?stub:localRequire(name)},{filename});
    const instance={...definition,data:structuredClone(definition.data),refresh:()=>{refreshes++;}};
    instance.exportBackup();assert.equal(clipboardWrites,0);
    instance.importBackup();await dialog.success({confirm:false});assert.equal(restores,0);
    instance.importBackup();await dialog.success({confirm:true});assert.equal(restores,1);assert.equal(refreshes,1);
  }
});
