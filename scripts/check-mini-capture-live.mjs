// Actual native parser entry, synthetic input only. No confirm/save/login call.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const modulePath=process.env.BUFFER_AUTOMATOR_MODULE;
const endpoint=process.env.BUFFER_AUTOMATOR_ENDPOINT;
if(!modulePath||!/^ws:\/\/127\.0\.0\.1:\d+$/.test(endpoint||''))throw Error('explicit_local_automator_required');
const mini=await require(modulePath).connect({wsEndpoint:endpoint});
let stage='preconditions',page,saved;
async function bounded(task){let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native_timeout')),10000);})]);}finally{clearTimeout(timer);}}
async function fingerprint(){return bounded(mini.evaluate(()=>{
  const text=JSON.stringify(['buffer-zone.mini.state.v2','buffer-zone.mini.state.v1'].map(key=>wx.getStorageSync(key)));
  let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return hash>>>0;
}));}
try{
  page=await bounded(mini.currentPage());assert.equal(page.path,'pages/reality/index');
  assert.equal(await bounded(page.data('captureOpen')),false,'preserve active user capture');
  saved={};for(const key of ['captureText','captureMode','captureMessage','candidateItems'])saved[key]=await bounded(page.data(key));
  const before=await fingerprint();stage='actual_native_parse';
  await bounded(page.setData({captureText:'下个月15号开始，每个月工资12000'}));
  await bounded(page.callMethod('parseNatural'));
  const items=await bounded(page.data('candidateItems'));
  assert.equal(items.length,1);assert.equal(items[0].type,'recurring_income');assert.equal(items[0].amount,12000);assert.match(items[0].startDate,/^\d{4}-\d{2}-15$/);
  stage='storage_unchanged';assert.equal(await fingerprint(),before);
  console.log(JSON.stringify({pass:true,nativeParser:true,localDataUnchanged:true}));
}catch{console.log(JSON.stringify({pass:false,stage}));process.exitCode=1;}
finally{if(page&&saved){try{await bounded(page.setData(saved));}catch{process.exitCode=1;console.log(JSON.stringify({pass:false,stage:'restore_temporary_fields'}));}}mini.disconnect();}
