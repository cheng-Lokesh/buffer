import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../server/account-sync-service.js');
// In-memory fixture ONLY. Production must provide durable account-scoped transactions.
function fixture() {
  const rows=new Map();const receipts=new Map();let accesses=0;let tail=Promise.resolve();
  return { rows, get accesses(){return accesses;}, async transaction(accountId,callback) {
    accesses++;const previous=tail;let release;tail=new Promise(resolve=>release=resolve);await previous;
    const row=structuredClone(rows.get(accountId)||null);const staged=new Map();let next=row;
    try {
      const result=await callback({read:async()=>row,write:async value=>{next=structuredClone(value);},getReceipt:async(generation,id)=>receipts.get(`${accountId}:${generation}:${id}`),putReceipt:async(generation,id,value)=>staged.set(`${accountId}:${generation}:${id}`,structuredClone(value))});
      if(next)rows.set(accountId,next);for(const [key,value] of staged)receipts.set(key,value);return result;
    } finally {release();}
  }};
}
const command=(overrides={})=>({protocolVersion:1,schemaVersion:9,operationId:'operation-test-0001',baseRevision:0,deletionGeneration:0,confirmed:true,operation:{type:'confirm_reality',value:1},...overrides});
const request=(body,account='a',method='POST')=>new Request('https://sync.test/api/account/state',{method,headers:{'content-type':'application/json','x-fixture-account':account},...(method==='POST'?{body:JSON.stringify(body)}:{})});
async function setup() {
  const {createAccountSyncService}=await load();const repository=fixture();
  const service=createAccountSyncService({repository,authenticate:async req=>{const account=req.headers.get('x-fixture-account');return account==='a'||account==='b'?{accountId:account}:null;},applyConfirmedOperation:async({state,operation})=>({state:{count:(state?.count||0)+operation.value}})});
  return {service,repository};
}
test('sync is unavailable without actual identity, transaction and domain validation adapters',async()=>{
  const {createAccountSyncService}=await load();assert.throws(()=>createAccountSyncService(),/adapters/);
});
test('unauthenticated requests never reach account storage',async()=>{
  const {service,repository}=await setup();const response=await service(request(command(),'invalid'));assert.equal(response.status,401);assert.equal(repository.accesses,0);
});
test('server identity isolates data and rejects client owner and unconfirmed mutations',async()=>{
  const {service,repository}=await setup();assert.equal((await service(request(command()))).status,200);
  const b=await (await service(request(null,'b','GET'))).json();assert.equal(b.state,null);assert.equal(b.revision,0);
  for(const body of [command({owner:'b'}),command({confirmed:false}),command({schemaVersion:10}),command({baseRevision:-1})])assert.equal((await service(request(body))).status,400);
  assert.equal(repository.rows.get('a').state.count,1);assert.equal(repository.rows.has('b'),false);
});
test('network retries are idempotent and cannot reuse an operation ID for a different payload',async()=>{
  const {service,repository}=await setup();const first=await (await service(request(command()))).json();const retry=await (await service(request(command()))).json();
  assert.deepEqual(retry,first);assert.equal(repository.rows.get('a').revision,1);
  assert.equal((await service(request(command({operation:{type:'confirm_reality',value:9}})))).status,409);
});
test('concurrent writes based on one revision commit once and preserve the conflict',async()=>{
  const {service,repository}=await setup();const results=await Promise.all([service(request(command())),service(request(command({operationId:'operation-test-0002'})))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(repository.rows.get('a').state.count,1);
});
test('migration requires explicit approval and cannot silently replace existing server state',async()=>{
  const {service}=await setup();const op={type:'import_local',value:7};
  assert.equal((await service(request(command({operation:op})))).status,400);
  assert.equal((await service(request(command({migrationApproved:true,operation:op})))).status,200);
  assert.equal((await service(request(command({baseRevision:1,operationId:'operation-test-0002',migrationApproved:true,operation:op})))).status,409);
});
test('delete advances generation and old offline commands or receipts cannot resurrect data',async()=>{
  const {service,repository}=await setup();await service(request(command()));
  const deletion=command({baseRevision:1,operationId:'operation-test-delete',operation:{type:'delete_all'}});
  const deleted=await service(request(deletion));assert.equal(deleted.status,200);assert.equal(repository.rows.get('a').deletionGeneration,1);assert.equal(repository.rows.get('a').state,null);
  assert.deepEqual(await (await service(request(deletion))).json(),await deleted.json());
  assert.equal((await service(request(command()))).status,409);
  assert.equal((await service(request(command({baseRevision:2,operationId:'operation-test-0003'})))).status,409);
  assert.equal((await service(request(command({baseRevision:2,deletionGeneration:1,operationId:'operation-test-0003'})))).status,200);
});
test('exhausted revision counters reject writes without corrupting a readable account',async()=>{
  const {service,repository}=await setup();const maximum=Number.MAX_SAFE_INTEGER-1;
  repository.rows.set('a',{revision:maximum,deletionGeneration:0,state:{count:1}});
  const result=await service(request(command({baseRevision:maximum})));
  assert.equal(result.status,409);assert.equal(repository.rows.get('a').revision,maximum);
});
test('receipt failure rolls back the complete transaction and allows a safe retry',async()=>{
  const {createAccountSyncService}=await load();const repository=fixture();let fail=true;
  const failingRepository={transaction:(account,callback)=>repository.transaction(account,tx=>callback({...tx,putReceipt:async(...args)=>{if(fail)throw new Error('private database detail');return tx.putReceipt(...args);}}))};
  const service=createAccountSyncService({authenticate:async()=>({accountId:'a'}),repository:failingRepository,applyConfirmedOperation:async()=>({state:{count:1}})});
  assert.equal((await service(request(command()))).status,503);assert.equal(repository.rows.size,0);
  fail=false;assert.equal((await service(request(command()))).status,200);assert.equal(repository.rows.get('a').revision,1);
});
test('failed validation/transaction never acknowledge success or leak financial errors',async()=>{
  const {createAccountSyncService}=await load();const repository=fixture();
  const service=createAccountSyncService({authenticate:async()=>({accountId:'a'}),repository,applyConfirmedOperation:async()=>{throw new Error('private financial fixture');}});
  const response=await service(request(command()));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private'));assert.equal(repository.rows.size,0);
});
test('invalid methods and oversized malformed input fail closed',async()=>{
  const {service,repository}=await setup();assert.equal((await service(request(null,'a','PUT'))).status,405);
  for(const raw of ['{',JSON.stringify(command({operation:{type:'unknown'}})),' '.repeat(33000)]) {
    const response=await service(new Request('https://sync.test/',{method:'POST',headers:{'x-fixture-account':'a'},body:raw}));assert.ok([400,413].includes(response.status));
  }
  assert.equal(repository.rows.size,0);
});
