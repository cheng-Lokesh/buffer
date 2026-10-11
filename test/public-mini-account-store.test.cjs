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
test('expired, malformed and failing account responses never substitute old local facts',async()=>{
  const f=fixture();f.app.accountSyncStatus=()=>({phase:'synced',state:{schemaVersion:99}});assert.equal(f.store.load().storageError,true);
  assert.equal((await f.store.recordCash({balance:1,reserve:0,daily:1})).ok,false);
  f.setPhase('session_expired');assert.equal((await f.store.captureReality([])).ok,false);
  assert.equal((await f.store.recordV8Event({type:'unexpected',amount:1})).ok,false);
  assert.equal((await f.store.recordV8Event({type:'expense',amount:-1})).ok,false);
  assert.equal((await f.store.recordCash({balance:true,reserve:0,daily:1})).ok,false);
  assert.equal(f.writes,0);assert.equal(f.reads,0);
});
test('explicit local mode keeps its existing backup/delete and capture semantics',async()=>{
  const f=fixture();f.setPhase('signed_out');await f.store.restoreState({}, {confirmed:true});await f.store.clear();await f.store.captureReality([]);await f.store.recordV8Event({});assert.equal(f.writes,4);
  const {createMiniAccountStore}=require('../miniprogram/utils/account-store');let calls=0;
  const noAccount=createMiniAccountStore({local:{load:()=>{calls++;return {};}}});noAccount.load();assert.equal(calls,1);
});
test('account conditions and scenario drafts preserve precise page intent',async()=>{
  const f=fixture();assert.equal(typeof f.store.addV8CashCondition,'function');
  await f.store.addV8CashCondition({type:'recurring_expense',amount:'30',frequency:'monthly',nextOccurrence:'2026-11-01',includedInDailyFloor:true});
  assert.equal(f.commands[0].operation.candidates[0].includedInDailyFloor,true);
  assert.equal(f.commands[0].operation.candidates[0].startDate,'2026-11-01');
  await f.store.addV8CashCondition({type:'known_event',eventKind:'income',amount:50,nextOccurrence:'2026-11-02'});
  assert.equal(f.commands[1].operation.candidates[0].type,'known_future_income');
  await f.store.setV8Condition('fixture-condition',{amount:40});assert.equal(f.commands[2].operation.conditionId,'fixture-condition');
  await f.store.saveV8Scenario({changes:[]});assert.equal(f.commands[3].operation.action,'save_scenario');assert.equal(f.writes,0);
  assert.equal((await f.store.addV8CashCondition({type:'unexpected',amount:1})).ok,false);
});
test('account export contains only own envelope and does not substitute legacy backup on failure',()=>{
  const f=fixture();assert.equal(typeof f.store.exportText,'function');
  const backup=JSON.parse(f.store.exportText());assert.equal(backup.schemaVersion,9);assert.equal(backup.cash.balance,9000);assert.equal(f.reads,0);
  f.app.accountSyncStatus=()=>({state:{schemaVersion:99}});assert.equal(f.store.exportText(),null);assert.equal(f.reads,0);
});
test('logout while confirmation is in flight does not acknowledge a local-mode success',async()=>{
  const f=fixture();f.app.confirmAccountOperation=async()=>{f.setPhase('signed_out');return {phase:'signed_out',state:null};};
  assert.equal((await f.store.recordCash({balance:1,reserve:0,daily:1})).ok,false);assert.equal(f.reads,0);
});
test('same-account relogin invalidates in-flight page confirmation acknowledgement',async()=>{
  const f=fixture();let generation=1;
  f.app.accountStatus=()=>({phase:'signed_in',accountId:'fixture-a',viewGeneration:generation});
  f.app.confirmAccountOperation=async()=>{generation+=2;return {phase:'synced',pendingCount:0};};
  assert.equal((await f.store.recordCash({balance:1,reserve:0,daily:1})).ok,false);assert.equal(f.reads,0);
});

test('account restore requires the exact preview, payload and current login generation',async()=>{
  const f=fixture();let generation=1,calls=0;
  f.app.accountStatus=()=>({phase:'signed_in',accountId:'fixture-a',viewGeneration:generation});
  f.app.previewAccountMigration=backup=>({payload:backup,summary:{balance:backup.cash.balance}});
  f.app.confirmAccountMigration=async()=>{calls++;return {phase:'synced',pendingCount:0};};
  const value=JSON.parse(f.store.exportText());
  const preview=f.store.previewRestore(value);assert.equal(preview.ok,true);
  assert.equal((await f.store.restoreState(value,{confirmed:true,accountConfirmed:true,preview:{...preview}})).ok,false);
  assert.equal((await f.store.restoreState({...value,cash:{...value.cash,balance:1}},{confirmed:true,accountConfirmed:true,preview})).ok,false);
  assert.equal(calls,0);
  assert.equal((await f.store.restoreState(value,{confirmed:true,accountConfirmed:true,preview})).ok,true);assert.equal(calls,1);
  const stale=f.store.previewRestore(value);generation++;
  assert.equal((await f.store.restoreState(value,{confirmed:true,accountConfirmed:true,preview:stale})).ok,false);assert.equal(calls,1);assert.equal(f.writes,0);
});

test('account deletion reports completion only after a server acknowledgement',async()=>{
  const f=fixture();let calls=0;
  f.app.deleteAccountData=async()=>{calls++;return {phase:'offline',pendingCount:1,state:null};};
  assert.equal((await f.store.clear({confirmed:true})).ok,false);assert.equal(calls,0);
  const pending=await f.store.clear({confirmed:true,accountConfirmed:true});
  assert.equal(pending.ok,true);assert.equal(pending.completed,false);assert.equal(pending.pendingCount,1);
  f.app.deleteAccountData=async()=>({phase:'synced',pendingCount:0,state:null});
  assert.equal((await f.store.clear({confirmed:true,accountConfirmed:true})).completed,true);
  f.app.deleteAccountData=async()=>({phase:'conflict',pendingCount:0,state:{}});
  assert.equal((await f.store.clear({confirmed:true,accountConfirmed:true})).completed,false);assert.equal(f.writes,0);
});

test('restore and deletion errors or session changes never acknowledge completion',async()=>{
  const f=fixture();f.app.previewAccountMigration=()=>{throw Error('private');};
  assert.equal(f.store.previewRestore({}).ok,false);
  f.app.deleteAccountData=async()=>{throw Error('private');};
  assert.equal((await f.store.clear({confirmed:true,accountConfirmed:true})).ok,false);
  f.app.deleteAccountData=async()=>{f.setPhase('signed_out');return {phase:'synced',pendingCount:0,state:null};};
  assert.equal((await f.store.clear({confirmed:true,accountConfirmed:true})).ok,false);assert.equal(f.reads,0);
});
