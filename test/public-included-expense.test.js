import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
for(const platform of ['web','mini'])test(`${platform}: confirmed recurring expense retains daily-floor inclusion without accepting invalid flags`,async()=>{
  const {applyConfirmedAccountOperation}=platform==='web'?await import('../src/account-confirmation.js'):require('../miniprogram/core/account-confirmation');
  const candidate={type:'recurring_expense',name:'日常餐费',amount:30,frequency:'daily',startDate:'2026-10-12',includedInDailyFloor:true};
  const run=candidates=>applyConfirmedAccountOperation({state:null,operationId:'fixture-included-expense-1',operation:{type:'confirm_reality',action:'capture',confirmedAt:'2026-10-11T02:00:00.000Z',candidates}},{now:()=>Date.parse('2026-10-11T02:00:00.000Z')});
  const result=run([candidate]);assert.equal(result.state.cashReality.conditions.find(item=>item.type==='recurring_expense').includedInDailyFloor,true);
  const outside=run([{...candidate,includedInDailyFloor:false}]);assert.equal(outside.state.cashReality.conditions.find(item=>item.type==='recurring_expense').includedInDailyFloor,false);
  assert.throws(()=>run([{...candidate,includedInDailyFloor:'true'}]),/confirmed_operation_invalid/);
  assert.throws(()=>run([{...candidate,type:'recurring_income'}]),/confirmed_operation_invalid/);
});
