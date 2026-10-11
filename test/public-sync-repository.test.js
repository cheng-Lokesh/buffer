import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountSyncService} from '../server/account-sync-service.js';
const module=await import('../server/rpc-account-repository.js').catch(()=>null);
const envId='fixture-env',serviceUserId='fixture-service',backendKey='a'.repeat(64);
const token=(sub='fixture-user',extra={})=>`e30.${Buffer.from(JSON.stringify({sub,aud:envId,role:'authenticated',exp:Date.now()/1000+120,...extra})).toString('base64url')}.fixture`;
const principal={accountId:'fixture-user',accessToken:token()};
const create=extra=>{assert.ok(module,'durable repository adapter missing');return module.createRpcAccountRepository({envId,serviceUserId,backendKey,...extra});};
const empty=()=>({revision:0,deletionGeneration:0,state:null});
function fixture(){let row=empty();const receipts=new Map();let race=false;const calls=[];
  return {calls,get row(){return row;},race(){race=true;},async fetchImpl(url,init){
    calls.push({url,init});const name=url.split('/').at(-1),p=JSON.parse(init.body);
    assert.equal(p.p_key,backendKey);assert.equal(Object.hasOwn(p,'accountId'),false);
    if(name==='buffer_sync_read')return Response.json(row);
    if(name==='buffer_sync_receipt')return Response.json(p.p_revision!==row.revision?{stale:true}:{stale:false,receipt:receipts.get(p.p_operation_id)||null});
    assert.equal(name,'buffer_sync_commit');
    if(race){race=false;row={revision:1,deletionGeneration:0,state:{count:8}};return Response.json(false);}
    if(p.p_revision!==row.revision)return Response.json(false);
    row=p.p_next;receipts.set(p.p_operation_id,{digest:p.p_digest,result:p.p_result});return Response.json(true);
  }};
}
const command=()=>({protocolVersion:1,schemaVersion:9,operationId:'fixture-operation-0001',baseRevision:0,deletionGeneration:0,confirmed:true,operation:{type:'confirm_reality',value:1}});
const req=()=>new Request('https://fixture.invalid/',{method:'POST',body:JSON.stringify(command())});
test('explicit server-only config and verified principal are mandatory',async()=>{
  for(const extra of [{envId:''},{serviceUserId:''},{backendKey:''},{fetchImpl:null}])assert.throws(()=>create(extra),/sync_repository_config_invalid/);
  const repository=create({fetchImpl:async()=>{throw Error('must not reach network');}});
  for(const p of [null,{...principal,accountId:'other'}, {...principal,accessToken:token(serviceUserId)}, {...principal,accessToken:token('fixture-user',{aud:'wrong'})},{...principal,accessToken:token('fixture-user',{role:'service_role'})},{...principal,accessToken:token('fixture-user',{exp:0})}])
    await assert.rejects(repository.transaction(principal.accountId,async()=>null,p),/sync_repository_unavailable/);
});
test('service supplies verified principal; snapshot and receipt commit together through own bearer',async()=>{
  const f=fixture(),repository=create(f);
  const service=createAccountSyncService({authenticate:async()=>principal,repository,applyConfirmedOperation:async({state,operation})=>({state:{count:(state?.count||0)+operation.value}})});
  const first=await service(req());assert.equal(first.status,200);const value=await first.json();assert.equal(value.state.count,1);
  assert.deepEqual(await (await service(req())).json(),value);assert.equal(f.row.revision,1);
  for(const {url,init} of f.calls){assert.ok(url.startsWith(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/buffer_sync_`));
    assert.equal(init.headers.authorization,`Bearer ${principal.accessToken}`);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);}
});
test('CAS race reruns pure domain callback against durable version, returning conflict not false success',async()=>{
  const f=fixture();f.race();const service=createAccountSyncService({authenticate:async()=>principal,repository:create(f),applyConfirmedOperation:async()=>({state:{count:1}})});
  const result=await service(req());assert.equal(result.status,409);assert.equal((await result.json()).current.state.count,8);
});
test('stale receipt read retries and bounded CAS failure refuses acknowledgement',async()=>{
  let calls=0;const repository=create({fetchImpl:async url=>{calls++;return Response.json(url.endsWith('_read')?empty():{stale:true});}});
  await assert.rejects(repository.transaction(principal.accountId,async tx=>{await tx.read();await tx.getReceipt(0,'fixture-operation-0001');},principal),/sync_repository_unavailable/);
  assert.equal(calls,6);
  const failed=create({fetchImpl:async url=>Response.json(url.endsWith('_read')?empty():false)});
  await assert.rejects(failed.transaction(principal.accountId,async tx=>{await tx.write({revision:1,deletionGeneration:0,state:{count:1}});await tx.putReceipt(0,'fixture-operation-0001',{digest:'c'.repeat(64),result:{protocolVersion:1,schemaVersion:9,revision:1,deletionGeneration:0,state:{count:1}}});return 'must not acknowledge';},principal),/sync_repository_unavailable/);
});
test('read-only callback has no writes; failed callback and unmatched receipt cannot commit',async()=>{
  const f=fixture(),repository=create(f);
  assert.deepEqual(await repository.transaction(principal.accountId,tx=>tx.read(),principal),empty());assert.equal(f.calls.length,1);
  await assert.rejects(repository.transaction(principal.accountId,async()=>{throw Error('private');},principal),/^Error: sync_repository_unavailable$/);
  await assert.rejects(repository.transaction(principal.accountId,tx=>tx.write({revision:1,deletionGeneration:0,state:{count:1}}),principal),/sync_repository_unavailable/);
  assert.equal(f.row.revision,0);
});
test('provider failure and malformed or oversized payloads are sanitized',async()=>{
  for(const fetchImpl of [async()=>{throw Error('private key');},async()=>new Response('private',{status:403}),async()=>new Response('bad-json'),async()=>Response.json([]),async()=>Response.json({revision:-1,deletionGeneration:0,state:null}),async()=>new Response('x'.repeat(2200000)),async()=>new Response(null)])
    await assert.rejects(create({fetchImpl}).transaction(principal.accountId,tx=>tx.read(),principal),/^Error: sync_repository_unavailable$/);
});
