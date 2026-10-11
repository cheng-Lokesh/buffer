import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCashReality,createScenarioPatch} from '../src/v8-cash-reality.js';
import {createAccountSyncService} from '../server/account-sync-service.js';
const module=await import('../src/account-confirmation.js').catch(()=>null);
const confirmedAt='2026-10-11T02:00:00.000Z',operationId='fixture-confirmation-0001';
const options={now:()=>Date.parse(confirmedAt)};
const base=()=>({schemaVersion:9,cashReality:normalizeCashReality({conditions:[
  {id:'balance',type:'balance',amount:5000,status:'confirmed',source:'user_confirmed'},
  {id:'reserve',type:'reserve',amount:1200,status:'confirmed',source:'user_confirmed'},
  {id:'daily-floor',type:'daily_floor',amount:30,frequency:'daily',startDate:'2026-10-12',status:'confirmed',source:'user_confirmed'},
  {id:'rent',name:'房租',type:'recurring_expense',amount:1500,frequency:'monthly',nextOccurrence:'2026-10-15',status:'confirmed',source:'user_confirmed'}
]}),records:[{date:'2026-09-10',cashDelta:-30,note:'旧记录'}],legacyArchive:{version:1,payload:{projects:[{name:'旧备份'}]}}});
const apply=(state,operation,id=operationId)=>{assert.ok(module,'shared confirmation operation missing');return module.applyConfirmedAccountOperation({state,operation,operationId:id},options).state;};
const capture=(candidates)=>({type:'confirm_reality',action:'capture',confirmedAt,provenance:'precise_edit',candidates});
test('whole confirmed batch preserves history and anchors final balance, with deterministic retry identities',()=>{
  const source=base(),before=structuredClone(source),op=capture([{type:'one_off_income',amount:500},{type:'one_off_expense',amount:20},{type:'balance_confirmation',amount:5480}]);
  const a=apply(source,op),b=apply(source,op);assert.deepEqual(a,b);assert.deepEqual(source,before);
  assert.equal(a.cash.balance,5480);assert.equal(a.cashReality.events.length,3);
  assert.equal(a.cashReality.realitySnapshots.length,1);assert.equal(a.cashReality.forecastSnapshots.length,1);
  assert.deepEqual(a.records,source.records);assert.deepEqual(a.legacyArchive,source.legacyArchive);
  assert.ok(a.cashReality.events.every(event=>event.id.startsWith(operationId)));
});
test('base confirmation creates all required facts and retains other conditions and evidence on reconfirmation',()=>{
  const op={type:'confirm_reality',action:'confirm_basics',confirmedAt,cash:{balance:3000,reserve:500,daily:20}};
  const first=apply(null,op);assert.equal(first.cashReality.conditions.length,3);assert.equal(first.cash.balance,3000);
  const source=base(),next=apply(source,op);assert.equal(next.cashReality.conditions.find(c=>c.id==='rent').amount,1500);
  assert.equal(next.cashReality.conditions.find(c=>c.type==='reserve').amount,500);assert.deepEqual(next.records,source.records);
});
test('precise edits retain condition identity and confirmation provenance, with invalid edits rejected',()=>{
  const op={type:'confirm_reality',action:'edit_condition',confirmedAt,conditionId:'rent',patch:{name:'房租更新',amount:1600,frequency:'monthly',nextOccurrence:'2026-11-01'}};
  const next=apply(base(),op),rent=next.cashReality.conditions.find(c=>c.id==='rent');assert.equal(rent.name,'房租更新');assert.equal(rent.captureSource,'precise_edit');assert.equal(rent.amount,1600);
  for(const patch of [{amount:null},{amount:''},{amount:1.234},{amount:-1},{frequency:'yearly'},{nextOccurrence:'2026-02-30'},{status:'missing'},{source:'model'},{includedInDailyFloor:'true'}])assert.throws(()=>apply(base(),{...op,patch}),/confirmed_operation_invalid/);
  assert.throws(()=>apply(base(),{...op,conditionId:'foreign-id'}),/confirmed_operation_invalid/);
});
test('scenario save/delete keeps all confirmed facts and historical snapshots unchanged',()=>{
  const original=apply(base(),capture([{type:'balance_confirmation',amount:4800}]));
  const patch=createScenarioPatch({id:'fixture-draft',name:'假设',createdAt:confirmedAt,operations:[{type:'set_condition',conditionId:'daily-floor',field:'amount',value:20},{type:'add_one_off',name:'假设支出',cashflow:'expense',amount:100,occurredAt:'2026-10-15'}]});
  const saved=apply(original,{type:'confirm_reality',action:'save_scenario',confirmedAt,patch});
  for(const key of ['conditions','events','occurrenceResolutions','realitySnapshots','forecastSnapshots'])assert.deepEqual(saved.cashReality[key],original.cashReality[key]);
  assert.equal(saved.cashReality.scenarioDrafts.length,1);assert.equal(saved.cashReality.scenarioDrafts[0].neverApplyToReality,true);
  const deleted=apply(saved,{type:'confirm_reality',action:'delete_scenario',confirmedAt,draftId:'fixture-draft'});assert.equal(deleted.cashReality.scenarioDrafts.length,0);
  assert.deepEqual(deleted.cash,original.cash);
});
test('migration requires canonical schema and never silently discards malformed or unconfirmed facts',()=>{
  const source=base();assert.deepEqual(apply(null,{type:'import_local',state:source}),source);
  for(const state of [{...source,schemaVersion:10},{...source,access_token:'never store'},{...source,cashReality:{...source.cashReality,conditions:[{type:'balance',source:'model',amount:1}]}},{...source,cashReality:{...source.cashReality,conditions:[...source.cashReality.conditions,source.cashReality.conditions[0]]}},{...source,records:'bad'}])
    assert.throws(()=>apply(null,{type:'import_local',state}),/confirmed_operation_invalid/);
  assert.throws(()=>apply(source,{type:'import_local',state:source}),/confirmed_operation_invalid/);
});
test('unknown input, incomplete amounts, future stamps and invalid whole batches never return partial state',()=>{
  const source=base(),before=structuredClone(source);
  for(const operation of [capture([{type:'one_off_income',amount:null}]),capture([{type:'one_off_income',amount:''}]),capture([{type:'one_off_income',amount:1.234}]),capture([{type:'one_off_income',amount:200},{type:'unknown'}]),
    {...capture([{type:'balance_confirmation',amount:3000}]),owner:'another'}, {...capture([{type:'balance_confirmation',amount:3000}]),confirmedAt:'2026-10-12T02:00:00.000Z'},
    {type:'confirm_reality',action:'confirm_basics',confirmedAt,cash:{balance:1,reserve:0,daily:0}},
    {type:'confirm_reality',action:'unknown',confirmedAt},{type:'delete_all'},null])assert.throws(()=>apply(source,operation),/confirmed_operation_invalid/);
  assert.throws(()=>apply(source,capture([{type:'one_off_income',amount:1}]),'bad'),/confirmed_operation_invalid/);assert.deepEqual(source,before);
});
test('sync passes stable operation ID into domain validation and treats invalid confirmation as 400 without writes',async()=>{
  let passedId,writeCount=0;
  const repository={transaction:async(_,fn)=>fn({read:async()=>null,getReceipt:async()=>null,write:async()=>{writeCount++;},putReceipt:async()=>{}})};
  const service=createAccountSyncService({authenticate:async()=>({accountId:'fixture-user'}),repository,applyConfirmedOperation:async input=>{passedId=input.operationId;const error=Error('private fact');error.code='invalid_confirmed_operation';throw error;}});
  const command={protocolVersion:1,schemaVersion:9,operationId,baseRevision:0,deletionGeneration:0,confirmed:true,operation:capture([{type:'balance_confirmation',amount:1}])};
  const result=await service(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify(command)}));
  assert.equal(result.status,400);assert.deepEqual(await result.json(),{code:'invalid_confirmed_operation'});assert.equal(passedId,operationId);assert.equal(writeCount,0);
});
