const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const file=path.resolve('miniprogram/pages/future/index.js');
function page() {
  let definition; const nativeRequire=createRequire(file);
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:nativeRequire,Page(value){definition=value;},wx:{},Date,console});
  const instance={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(patch,callback){Object.assign(this.data,patch);if(callback)callback();}};
  instance.data.projection={valid:true,points:[
    {date:'2026-10-08',openingBalanceCents:400000,closingBalanceCents:397000},
    {date:'2026-10-09',openingBalanceCents:397000,closingBalanceCents:250000},
    {date:'2026-11-01',openingBalanceCents:250000,closingBalanceCents:100000}
  ]};
  instance.data.selectedDate='2026-10-08';instance.refreshPoint=()=>{};
  return instance;
}
test('mini users can select exact month/day or threshold with a persistent answer and no Reality writes',()=>{
  const p=page(); const original=JSON.stringify(p.data.projection);
  assert.equal(typeof p.refreshLookup,'function'); p.refreshLookup();
  assert.match(p.data.lookupResult,/4000|4,000/);
  p.changeLookupMonth({detail:{value:'1'}});assert.equal(p.data.selectedDate,'2026-11-01');
  p.changeLookupMonth({detail:{value:'0'}});p.changeLookupDay({detail:{value:'1'}});
  assert.equal(p.data.selectedDate,'2026-10-09');assert.match(p.data.lookupResult,/2500|2,500/);
  p.setLookupAmount({detail:{value:'2501'}});p.lookupBalance();assert.equal(p.data.selectedDate,'2026-10-09');
  p.setLookupAmount({detail:{value:'0'}});p.lookupBalance();assert.match(p.data.lookupResult,/未达到/);assert.equal(p.data.selectedDate,'2026-10-09');
  p.setLookupAmount({detail:{value:'1.001'}});p.lookupBalance();assert.match(p.data.lookupResult,/两位小数/);
  assert.equal(JSON.stringify(p.data.projection),original);
});
test('mini lookup is reachable next to chart and uses named native month/day pickers',()=>{
  const markup=fs.readFileSync('miniprogram/pages/future/index.wxml','utf8');
  for(const marker of ['查某天余额','查余额日期','bindchange="changeLookupMonth"','bindchange="changeLookupDay"','{{lookupResult}}','bindtap="openLookup"'])assert.ok(markup.includes(marker),marker);
});
