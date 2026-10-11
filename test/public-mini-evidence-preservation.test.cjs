const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../miniprogram/core/state');
const engine=require('../miniprogram/core/v8-cash-reality');

test('cash reconfirmation preserves occurrence resolutions and both historical snapshot collections',()=>{
  const initial=core.applyCashChange(core.emptyState(),{balance:5000,reserve:1000,daily:30},'2026-10-10T10:00:00Z','first').state;
  const income={id:'income',type:'recurring_income',amount:100,frequency:'once',nextOccurrence:'2026-10-10',status:'confirmed',source:'user_confirmed'};
  const reality=engine.normalizeCashReality({...initial.cashReality,conditions:[...initial.cashReality.conditions,income]});
  const reconciled=engine.reconcileExpectedOccurrence(reality,'occurrence:income:2026-10-10',{result:'as_expected'},
    {asOf:'2026-10-10',id:'fixture-resolution',eventId:'fixture-event',resolvedAt:'2026-10-10T11:00:00Z'});
  const remembered=engine.captureTemporalMemory(reconciled.reality,{asOf:'2026-10-10',capturedAt:'2026-10-10T11:00:00Z',realitySnapshotId:'fixture-reality',forecastSnapshotId:'fixture-forecast'});
  const state=core.normalizeState({...initial,cashReality:remembered.reality});
  const before=structuredClone(state);
  const result=core.applyCashChange(state,{balance:6000,reserve:1200,daily:40},'2026-10-11T10:00:00Z','next');
  assert.equal(result.ok,true);assert.equal(result.state.cash.balance,6000);
  for(const key of ['occurrenceResolutions','realitySnapshots','forecastSnapshots','events','scenarioDrafts'])
    assert.deepEqual(result.state.cashReality[key],before.cashReality[key],`reconfirmation lost ${key}`);
  assert.deepEqual(state,before,'confirmation mutated original evidence');
});
