const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nativeRequire=require('node:module').createRequire(require('node:path').resolve('miniprogram/pages/reality/index.js'));
function fixture(){let page,release;const captures=[];const empty=nativeRequire('../../core/state').emptyState();
  const bridge={load:()=>empty,captureReality:(candidates,options)=>{captures.push({candidates,options});return new Promise(resolve=>release=()=>resolve({ok:true,summary:{balance:123}}));}};
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/reality/index.js','utf8'),{Page:value=>page=value,require:name=>name==='../../utils/account-store'?bridge:name==='../../utils/store'?{captureReality:()=>{throw Error('old local writer');}}:nativeRequire(name)});
  const instance={...page,data:JSON.parse(JSON.stringify(page.data)),setData(value){Object.assign(this.data,value);},refresh(){}};
  return {page:instance,captures,release:()=>release()};}
test('real balance button awaits account store and repeated taps do not duplicate confirmation',async()=>{
  const f=fixture();f.page.data.captureBalance='123';const pending=f.page.confirmBalance();assert.equal(f.captures.length,1);assert.notEqual(f.page.data.captureMode,'complete');
  await f.page.confirmBalance();assert.equal(f.captures.length,1);f.release();await pending;assert.equal(f.page.data.captureMode,'complete');
});
test('empty balance is not coerced to zero; candidate and due buttons use same account bridge',async()=>{
  const f=fixture();f.page.data.captureBalance='';await f.page.confirmBalance();assert.equal(f.captures.length,0);
  f.page.data.candidateItems=[{type:'one_off_expense',amount:20,occurredAt:'2026-10-11',index:0,label:'支出'}];
  const pending=f.page.confirmCandidates();assert.equal(f.captures[0].options.provenance,'natural_language');f.release();await pending;
  const due=f.page.confirmDue({currentTarget:{dataset:{id:'fixture-occurrence'}}});assert.equal(f.captures[1].candidates[0].occurrenceId,'fixture-occurrence');f.release();await due;
});
