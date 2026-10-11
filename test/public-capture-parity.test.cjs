const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const mini=require('../miniprogram/core/v12-reality-capture');
const stateCore=require('../miniprogram/core/state');
const engine=require('../miniprogram/core/v8-cash-reality');
const json=value=>JSON.parse(JSON.stringify(value));
const asOf='2026-10-11',confirmedAt='2026-10-11T02:00:00.000Z';
const options={asOf,confirmedAt,provenance:'precise_edit',makeId:(kind,index)=>`fixture-${kind}-${index}`};
function state(){const s=stateCore.normalizeState({cash:{balance:5000,reserve:1200,daily:30},confirmedAt,changes:[]});
  s.cashReality=engine.normalizeCashReality({...s.cashReality,conditions:[...s.cashReality.conditions,
    {id:'rent',name:'房租',type:'recurring_expense',amount:1500,frequency:'monthly',nextOccurrence:'2026-09-11',startDate:'2026-09-11',status:'confirmed',source:'user_confirmed'},
    {id:'salary',name:'工资',type:'recurring_income',amount:3000,frequency:'monthly',nextOccurrence:'2026-10-11',status:'confirmed',source:'user_confirmed'}]});return s;}
test('native and web commit all fourteen candidate types by one authoritative rule',async()=>{
  const web=await import('../src/v12-reality-capture.js'),s=state(),ctx=web.buildRealityCaptureContext(s.cashReality,{asOf});
  const occurrenceId=ctx.dueOccurrences.find(item=>item.conditionId==='salary').id;
  const candidates=[
    {type:'balance_confirmation',amount:4321.09,occurredAt:asOf},
    {type:'one_off_income',name:'退款',amount:321.11,occurredAt:asOf},
    {type:'one_off_expense',name:'食品',amount:22.12,occurredAt:asOf},
    {type:'known_future_income',name:'退款',amount:600,occurredAt:'2026-10-15'},
    {type:'known_future_expense',name:'搬家',amount:800,occurredAt:'2026-10-15'},
    {type:'recurring_income',name:'兼职',amount:500,frequency:'weekly',startDate:asOf},
    {type:'recurring_expense',name:'通勤',amount:30,frequency:'daily',startDate:asOf},
    {type:'existing_occurrence_confirmation',occurrenceId},
    {type:'existing_occurrence_amount_change',occurrenceId,amount:2800},
    {type:'existing_occurrence_date_change',occurrenceId,actualDate:'2026-10-10'},
    {type:'existing_occurrence_not_occurred',occurrenceId},
    {type:'condition_update',conditionId:'rent',amount:1600},
    {type:'condition_pause',conditionId:'rent'},
    {type:'condition_end',conditionId:'rent'}
  ];
  for(const candidate of candidates){const expected=web.commitRealityCapture(s.cashReality,[candidate],options);
    const actual=mini.applyMiniRealityCapture(s,[candidate],options);assert.equal(actual.ok,true,candidate.type);
    assert.deepEqual(json(actual.state.cashReality),json(expected.reality),candidate.type);}
  assert.deepEqual(state(),s,'source is never mutated');
});
test('native due items enumerate all due occurrences and cannot miss repeat cycles',async()=>{
  const web=await import('../src/v12-reality-capture.js'),s=state();
  const expected=web.buildRealityCaptureContext(s.cashReality,{asOf}).dueOccurrences;
  const actual=mini.buildMiniDueOccurrences(s,asOf);assert.equal(actual.length,expected.length);
  assert.deepEqual(actual.map(item=>item.id),expected.map(item=>item.id));
});
test('shared parser understands existing facts, unknown amounts and uncertainty without writing facts',async()=>{
  const web=await import('../src/v12-reality-capture.js'),s=state(),before=JSON.stringify(s);
  for(const text of ['房租1500，押金退了1300，现在4680','工资到账了','以后每月房租1500','如果下个月工资12000','不一定收到3000','工资3000','']){
    const ctx=web.buildRealityCaptureContext(s.cashReality,{asOf});const expected=await web.parseRealityMessage(text,ctx);
    const actual=mini.parseMiniRealityMessage(text,{asOf,state:s});
    assert.equal(actual.status,expected.status,text);assert.deepEqual(json(actual.candidates),json(expected.candidates),text);
  }
  assert.equal(JSON.stringify(s),before);
});
test('native rejects invalid batch/date and repeated occurrence exactly as shared confirmation',()=>{
  const s=state();for(const candidates of [
    [{type:'balance_confirmation',amount:200},{type:'balance_confirmation',amount:300}],
    [{type:'one_off_expense',amount:12,occurredAt:'2026-02-30'}],
    [{type:'existing_occurrence_confirmation',occurrenceId:'unknown'}],
    [{type:'recurring_income',name:'无效',amount:12,frequency:'unknown',startDate:asOf}],
  ])assert.equal(mini.applyMiniRealityCapture(s,candidates,options).ok,false);
  assert.equal(mini.applyMiniRealityCapture(s,[{type:'balance_confirmation',amount:2}],{...options,provenance:'model'}).ok,false);
});
test('confirmation defaults to Shanghai day across UTC midnight instead of device day',()=>{
  const s=state();const result=mini.applyMiniRealityCapture(s,[{type:'one_off_income',amount:20}],{confirmedAt:'2026-10-10T17:00:00.000Z',provenance:'precise_edit'});
  assert.equal(result.ok,true);assert.equal(result.state.cashReality.events[0].occurredAt,'2026-10-11');
});
test('shared capture and condition modules are generated and run without structuredClone',async()=>{
  const cache={};function load(name){if(cache[name])return cache[name];
    const file=path.resolve('miniprogram/core',`${name}.js`);assert.ok(fs.existsSync(file),'shared capture module missing');
    const text=fs.readFileSync(file,'utf8');assert.match(text,/^\/\/ Generated by scripts\/build-mini-shared.mjs/);
    const context={module:{exports:{}},structuredClone:undefined,require:id=>load(id.replace('./',''))};
    vm.runInNewContext(text,context,{filename:file});return cache[name]=context.module.exports;}
  const native=load('v12-reality-capture-shared'),web=await import('../src/v12-reality-capture.js');
  assert.deepEqual(Object.keys(native).sort(),Object.keys(web).sort());
  const s=state(),ctx=native.buildRealityCaptureContext(s.cashReality,{asOf});
  assert.equal((await native.parseRealityMessage('现在4000',ctx)).status,'candidates');
  const candidates=[{type:'balance_confirmation',amount:4000}];
  assert.deepEqual(json(native.commitRealityCapture(s.cashReality,candidates,options)),json(web.commitRealityCapture(s.cashReality,candidates,options)));
  assert.equal(native.previewRealityCapture(s.cashReality,candidates,options).preview,true);
});
