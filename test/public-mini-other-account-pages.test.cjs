const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
for(const [name,action,method] of [['conditions','saveBasics','recordCash'],['conditions','saveRecurring','addV8CashCondition'],['conditions','saveEvent','addV8CashCondition'],['future','saveSimulation','saveV8Scenario']])test(`${name}/${action}: actual button waits for account persistence and repeated taps do not duplicate it`,async()=>{
  const filename=require('node:path').resolve(`miniprogram/pages/${name}/index.js`),nativeRequire=createRequire(filename);
  let definition,release,writes=0,toasts=0;
  const bridge={[method]:()=>{writes++;return new Promise(resolve=>release=()=>resolve({ok:true}));}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Page:value=>definition=value,require:id=>id==='../../utils/account-store'?bridge:id==='../../utils/store'?{[method]:()=>{throw Error('legacy writer');}}:nativeRequire(id),wx:{showToast:()=>toasts++}});
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(value){Object.assign(this.data,value);},refresh(){}};
  if(name==='future')page.data.simulationResult={patch:{changes:[]}};
  const pending=page[action]();assert.equal(writes,1);assert.equal(toasts,0);await page[action]();assert.equal(writes,1);
  release();await pending;assert.equal(toasts,1);assert.equal(typeof page.onAccountChange,'function');
  if(name==='future'){page.data.simulationResult={private:true};page.onAccountChange();assert.equal(page.data.simulationResult,null);}
  else{page.data.basicsDraft.balance='private balance';page.onAccountChange();assert.equal(page.data.basicsDraft.balance,'');}
});

test('conditions live refresh preserves typed basics but updates untouched inputs',()=>{
  const filename=require('node:path').resolve('miniprogram/pages/conditions/index.js'),nativeRequire=createRequire(filename);
  const {emptyState}=nativeRequire('../../core/state');let definition,balance=100;
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Page:value=>definition=value,require:id=>id==='../../utils/account-store'?{load:()=>({...emptyState(),cash:{balance,reserve:0,daily:10}})}:id==='../../utils/view'?{applySkinChrome:()=>({id:'ink-contours'}),formatTime:()=>'',formatMoney:String}:nativeRequire(id)});
  const page={...definition,data:structuredClone(definition.data),setData(value){for(const [key,item] of Object.entries(value)){const parts=key.split('.');if(parts.length===2)this.data[parts[0]][parts[1]]=item;else this.data[key]=item;}}};
  page.refresh();assert.equal(page.data.basicsDraft.balance,'100');balance=200;page.refresh({preserveDrafts:true});assert.equal(page.data.basicsDraft.balance,'200');
  page.setBasic({currentTarget:{dataset:{field:'balance'}},detail:{value:'345'}});balance=500;page.refresh({preserveDrafts:true});assert.equal(page.data.basicsDraft.balance,'345');
  page.onAccountChange();assert.equal(page.data.basicsDraft.balance,'500');
});

test('future refresh recalculates the last explicit scenario against new reality without using unsubmitted input',()=>{
  const filename=require('node:path').resolve('miniprogram/pages/future/index.js'),nativeRequire=createRequire(filename);let definition,amount=100,patchSeen;
  const engine={buildCashRealityProjection:()=>({valid:false}),buildNowSummary:()=>({status:'unknown'}),runScenarioPatch:(state,patch)=>{patchSeen=patch;return {patch,delta:{supportDays:1,rangeEndBalanceCents:amount*100}};}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Page:value=>definition=value,require:id=>id==='../../utils/account-store'?{load:()=>({cashReality:{amount},skinId:'ink-contours'})}:id==='../../core/v8-cash-reality'?engine:id==='../../utils/view'?{applySkinChrome:()=>({id:'ink-contours'}),formatMoney:value=>String(value)}:nativeRequire(id)});
  const patch={changes:[{conditionId:'daily',field:'amount',value:20}]};
  const page={...definition,data:{...structuredClone(definition.data),simulationDaily:'99',simulationResult:{patch,delta:{}}},setData(value,callback){Object.assign(this.data,value);callback?.();},refreshPoint(){},refreshLookup(){},drawActiveChart(){}};
  amount=200;page.refresh({preserveDrafts:true});assert.deepEqual(patchSeen,patch);assert.equal(page.data.simulationDaily,'99');assert.equal(page.data.simulationBalanceLabel,'+200');
  engine.runScenarioPatch=()=>{throw Error('private technical message');};page.refresh({preserveDrafts:true});assert.equal(page.data.simulationResult,null);assert.ok(!page.data.simulationError.includes('private'));
});
