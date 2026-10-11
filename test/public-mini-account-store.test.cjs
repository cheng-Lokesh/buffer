const test=require('node:test'),assert=require('node:assert/strict');
function fixture(){
  const {createMiniAccountStore}=require('../miniprogram/utils/account-store');
  const {normalizeCashReality}=require('../miniprogram/core/v8-cash-reality');
  const {emptyState}=require('../miniprogram/core/state');
  let phase='signed_in',reads=0,writes=0,commands=[];
  const cloud={schemaVersion:9,cash:{balance:9000,reserve:500,daily:30},cashReality:normalizeCashReality()};
  const app={accountStatus:()=>({phase}),accountSyncStatus:()=>({phase:'synced',state:cloud}),
    confirmAccountOperation:async(operation,options)=>{commands.push({operation,options});return {phase:'synced',state:cloud,pendingCount:0};}};
  const local={load:()=>{reads++;return emptyState();},recordCash:()=>{writes++;return {ok:true};},captureReality:()=>{writes++;return {ok:true};},recordV8Event:()=>{writes++;return {ok:true};},restoreState:()=>{writes++;return {ok:true};},clear:()=>{writes++;return {ok:true};}};
  return {store:createMiniAccountStore({local,getApp:()=>app,now:()=>Date.parse('2026-10-11T02:00:00.000Z')}),app,commands,setPhase:value=>phase=value,get reads(){return reads;},get writes(){return writes;}};
}
test('signed-in view uses only own account state; signed-out local mode remains intact',()=>{
  const f=fixture();assert.equal(f.store.load().cash.balance,9000);assert.equal(f.reads,0);
  f.app.accountSyncStatus=()=>({phase:'unavailable',state:null});assert.equal(f.store.load().cash.balance,'');assert.equal(f.reads,0);
  f.setPhase('session_expired');assert.equal(f.store.load().storageError,true);assert.equal(f.reads,0);
  f.setPhase('signed_out');f.store.load();assert.equal(f.reads,1);
});
test('explicit page confirmations enqueue canonical operations rather than touching old device data',async()=>{
  const f=fixture();const result=await f.store.recordCash({balance:'4000',reserve:'1000',daily:'20'});
  assert.equal(result.ok,true);assert.deepEqual(f.commands[0].operation.cash,{balance:4000,reserve:1000,daily:20});assert.equal(f.commands[0].options.confirmed,true);
  await f.store.captureReality([{type:'one_off_expense',amount:30,occurredAt:'2026-10-11'}],{provenance:'natural_language'});
  await f.store.recordV8Event({type:'income',amount:'50',occurredAt:'2026-10-11'});
  assert.equal(f.commands[1].operation.action,'capture');assert.equal(f.commands[2].operation.candidates[0].type,'one_off_income');assert.equal(f.writes,0);
  const count=f.commands.length;assert.equal((await f.store.recordCash({balance:'',reserve:'0',daily:'20'})).ok,false);assert.equal(f.commands.length,count);
  f.app.confirmAccountOperation=async()=>{throw Error('secret token');};assert.equal((await f.store.recordCash({balance:1,reserve:0,daily:1})).ok,false);
  f.setPhase('signed_out');await f.store.recordCash({});assert.equal(f.writes,1);
});
test('old local restore/delete prompts cannot authorize cloud overwrite or deletion',async()=>{
  const f=fixture();assert.equal((await f.store.restoreState({}, {confirmed:true})).ok,false);assert.equal((await f.store.clear()).ok,false);assert.equal(f.writes,0);
});
