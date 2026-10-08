import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const load=()=>import('../src/account-sync-client.js');
const view=(revision=0,state=null,generation=0)=>({protocolVersion:1,schemaVersion:9,revision,deletionGeneration:generation,state});
async function fixture() {
  const {createAccountSyncClient}=await load();const storage=new Map();let ids=0;let remote=view();let offline=false;let sends=0;
  const options={storage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},createOperationId:()=>`fixture-operation-${++ids}`,transport:{read:async()=>{if(offline)throw new Error('offline');return {status:200,body:remote};},write:async command=>{sends++;if(offline)throw new Error('offline');remote=view(command.baseRevision+1,{amount:command.operation.amount},command.deletionGeneration);return {status:200,body:remote};}}};
  const client=createAccountSyncClient(options);
  return {client,options,storage,setRemote:value=>{remote=value;},setOffline:value=>{offline=value;},get sends(){return sends;}};
}
test('login does not upload legacy local data, and logout/account switch isolates caches and queues',async()=>{
  const f=await fixture();f.storage.set('buffer-zone.product.state.v1','private-legacy-fixture');
  await f.client.activateAccount('account-a');assert.equal(f.sends,0);assert.equal(f.client.status().state,null);
  f.client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true});
  f.client.logout();assert.equal(f.client.status().state,null);assert.equal(f.client.status().pendingCount,0);
  await f.client.activateAccount('account-b');assert.equal(f.client.status().state,null);assert.equal(f.client.status().pendingCount,0);
  await f.client.activateAccount('account-a');assert.equal(f.client.status().pendingCount,1);assert.deepEqual(f.client.status().state,{amount:20});
  assert.equal(f.storage.get('buffer-zone.product.state.v1'),'private-legacy-fixture');
});
test('offline confirmed operations survive restart, retry with identical IDs and advance sequential revisions',async()=>{
  const f=await fixture();await f.client.activateAccount('a');f.setOffline(true);
  assert.throws(()=>f.client.enqueueConfirmed({type:'confirm_reality',amount:9},{amount:9}),/confirmation/);
  f.client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true});
  f.client.enqueueConfirmed({type:'confirm_reality',amount:30},{amount:30},{confirmed:true});
  const before=f.client.pendingOperations();await f.client.flush();assert.equal(f.client.status().pendingCount,2);
  const {createAccountSyncClient}=await load();const restarted=createAccountSyncClient(f.options);await restarted.activateAccount('a');
  assert.deepEqual(restarted.pendingOperations(),before);f.setOffline(false);await restarted.flush();
  assert.equal(restarted.status().pendingCount,0);assert.equal(restarted.status().revision,2);assert.deepEqual(restarted.status().state,{amount:30});
});
test('concurrent local flush calls never send one queued operation twice',async()=>{
  const f=await fixture();await f.client.activateAccount('a');f.client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true});
  await Promise.all([f.client.flush(),f.client.flush()]);assert.equal(f.sends,1);
});
test('late network response from logged-out account cannot populate next account',async()=>{
  const {createAccountSyncClient}=await load();let resolveRead;const map=new Map();
  const client=createAccountSyncClient({storage:{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)},createOperationId:()=> 'fixture-operation-1',transport:{write:async()=>{},read:()=>new Promise(resolve=>{resolveRead=resolve;})}});
  const request=client.activateAccount('old-account');client.logout();resolveRead({status:200,body:view(4,{privateFixture:1})});await request;
  assert.equal(client.status().state,null);assert.equal(client.status().revision,0);assert.equal(map.size,0);
});
test('revision conflict preserves local pending data and requires explicit discard before accepting cloud',async()=>{
  const f=await fixture();await f.client.activateAccount('a');f.client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true});
  f.setRemote(view(3,{amount:70}));await f.client.refresh();assert.equal(f.client.status().phase,'conflict');
  assert.deepEqual(f.client.status().state,{amount:20});assert.equal(f.client.status().pendingCount,1);
  assert.throws(()=>f.client.acceptCloudVersion(),/confirmation/);f.client.acceptCloudVersion({confirmed:true,discardPending:true});
  assert.deepEqual(f.client.status().state,{amount:70});assert.equal(f.client.status().pendingCount,0);
});
test('remote deletion clears active local copy and blocks old queued writes',async()=>{
  const f=await fixture();await f.client.activateAccount('a');f.client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true});
  f.setRemote(view(2,null,1));await f.client.refresh();assert.equal(f.client.status().state,null);assert.equal(f.client.status().pendingCount,0);await f.client.flush();assert.equal(f.sends,0);
});
test('migration is preview-only until explicit confirmation, and nonempty accounts refuse it',async()=>{
  const f=await fixture();await f.client.activateAccount('a');const preview=f.client.previewMigration({cashReality:{conditions:[],events:[]}});assert.equal(f.sends,0);
  assert.throws(()=>f.client.confirmMigration(preview),/confirmation/);
  f.client.confirmMigration(preview,{confirmed:true});assert.equal(f.client.pendingOperations()[0].migrationApproved,true);assert.equal(f.sends,0);
  assert.throws(()=>f.client.confirmMigration(preview,{confirmed:true}),/empty/);
});
test('failed cache writes do not acknowledge confirmation, and no tokens are persisted',async()=>{
  const {createAccountSyncClient}=await load();const f=await fixture();let fail=false;
  const client=createAccountSyncClient({...f.options,storage:{getItem:()=>null,setItem:()=>{if(fail)throw new Error('quota');}}});await client.activateAccount('a');fail=true;
  assert.throws(()=>client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true}),/quota/);assert.equal(client.status().pendingCount,0);
  assert.ok([...f.storage.values()].every(text=>!text.includes('token')));
});
test('missing adapters and corrupt cached data fail closed rather than resetting financial facts',async()=>{
  const {createAccountSyncClient}=await load();assert.throws(()=>createAccountSyncClient(),/adapters/);
  const f=await fixture();await f.client.activateAccount('a');const key=[...f.storage.keys()][0];f.storage.set(key,'broken');
  const client=createAccountSyncClient(f.options);await assert.rejects(()=>client.activateAccount('a'),/cache/);assert.equal(f.sends,0);
});
test('website and generated mini sync client share one implementation',async()=>{
  const web=await load();const mini=require('../miniprogram/core/account-sync-client.js');assert.equal(typeof mini.createAccountSyncClient,typeof web.createAccountSyncClient);
});
test('late acknowledgement cannot resurrect state after remote deletion cleared the queue',async()=>{
  const f=await fixture();let finish;
  f.options.transport.write=()=>new Promise(resolve=>{finish=resolve;});
  await f.client.activateAccount('a');f.client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true});
  const pending=f.client.flush();f.setRemote(view(2,null,1));await f.client.refresh();
  finish({status:200,body:view(1,{amount:20},0)});await pending;
  assert.equal(f.client.status().deletionGeneration,1);assert.equal(f.client.status().state,null);assert.equal(f.client.status().pendingCount,0);
});
test('late acknowledgement cannot overwrite explicitly adopted cloud conflict state',async()=>{
  const f=await fixture();let finish;f.options.transport.write=()=>new Promise(resolve=>{finish=resolve;});
  await f.client.activateAccount('a');f.client.enqueueConfirmed({type:'confirm_reality',amount:20},{amount:20},{confirmed:true});
  const pending=f.client.flush();f.setRemote(view(3,{amount:70}));await f.client.refresh();
  f.client.acceptCloudVersion({confirmed:true,discardPending:true});
  finish({status:200,body:view(1,{amount:20})});await pending;
  assert.equal(f.client.status().revision,3);assert.deepEqual(f.client.status().state,{amount:70});
});
