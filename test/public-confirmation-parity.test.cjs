const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = name => {
  const filename = path.resolve(__dirname,`../miniprogram/core/${name}.js`);
  const sandbox = {module:{exports:{}},require:dependency=>load(dependency.replace('./','')),Date,JSON,Object,Array,Number,String,Set,Map,Error};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename});
  return sandbox.module.exports;
};
test('native and web confirmation use identical operation IDs, facts and evidence without structuredClone',async()=>{
  assert.ok(fs.existsSync(path.resolve(__dirname,'../miniprogram/core/account-confirmation.js')),'native confirmation module missing');
  const web = await import('../src/account-confirmation.js');
  const native = load('account-confirmation');
  const confirmedAt='2026-10-11T02:00:00.000Z',options={now:()=>Date.parse(confirmedAt)};
  let a=null,b=null,index=0;
  for (const operation of [
    {type:'confirm_reality',action:'confirm_basics',confirmedAt,cash:{balance:5000,reserve:500,daily:20}},
    {type:'confirm_reality',action:'capture',confirmedAt,provenance:'precise_edit',candidates:[{type:'recurring_income',name:'工资',amount:3000,frequency:'monthly',startDate:'2026-10-15'}]},
    {type:'confirm_reality',action:'capture',confirmedAt,provenance:'precise_edit',candidates:[{type:'one_off_expense',amount:100}]}
  ]) {
    const operationId=`fixture-parity-confirmation-${++index}`;
    a=web.applyConfirmedAccountOperation({state:a,operation,operationId},options).state;
    b=native.applyConfirmedAccountOperation({state:b,operation,operationId},options).state;
    assert.deepEqual(JSON.parse(JSON.stringify(b)),a);
  }
});
