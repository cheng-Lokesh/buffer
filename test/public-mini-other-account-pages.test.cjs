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
  page.data.simulationResult={private:true};page.onAccountChange();assert.notDeepEqual(page.data.simulationResult,{private:true});
});
