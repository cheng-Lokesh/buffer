import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../server/account-sync-runtime.js').catch(()=>null);
const envId='fixture-env',serviceUserId='fixture-service',backendKey='a'.repeat(64);
test('sync runtime requires explicit production secrets and never substitutes a service identity',async()=>{
  assert.ok(module,'sync runtime missing');
  for (const input of [{},{envId,serviceUserId},{envId,serviceUserId,backendKey:'bad'}]) assert.throws(()=>module.createAccountSyncRuntime(input),/config/);
  let calls=0;const runtime=module.createAccountSyncRuntime({envId,serviceUserId,backendKey,fetchImpl:async()=>{calls++;throw Error('should not fetch');}});
  const response=await runtime(new Request('https://fixture.invalid'));
  assert.equal(response.status,401);assert.equal(calls,0);
});
test('runtime verifies ordinary JWT via provider then validates confirmation before durable account writes',async()=>{
  assert.ok(module,'sync runtime missing');let committed=null;const endpoints=[];
  const token=`e30.${Buffer.from(JSON.stringify({aud:envId,sub:'fixture-user',role:'authenticated',exp:Date.now()/1000+300})).toString('base64url')}.c2ln`;
  const runtime=module.createAccountSyncRuntime({envId,serviceUserId,backendKey,fetchImpl:async(url,input)=>{
    endpoints.push(new URL(url).pathname);
    assert.equal(input.headers.authorization,`Bearer ${token}`);
    if(url.endsWith('/user/me'))return Response.json({sub:'fixture-user',status:'ACTIVE'});
    const body=JSON.parse(input.body);assert.equal(body.p_key,backendKey);assert.equal(Object.hasOwn(body,'owner'),false);
    if(url.endsWith('/buffer_sync_read'))return Response.json(committed || {revision:0,deletionGeneration:0,state:null});
    if(url.endsWith('/buffer_sync_receipt'))return Response.json({stale:false,receipt:null});
    if(url.endsWith('/buffer_sync_commit')){committed=body.p_next;return Response.json(true);}
    throw Error('unexpected endpoint');
  }});
  const command={protocolVersion:1,schemaVersion:9,operationId:'fixture-runtime-operation',baseRevision:0,deletionGeneration:0,confirmed:true,operation:{type:'confirm_reality',action:'confirm_basics',confirmedAt:new Date().toISOString(),cash:{balance:1000,reserve:100,daily:10}}};
  const response=await runtime(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(command)}));
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.state.cash.balance,1000);assert.deepEqual(result.state,committed.state);
  assert.equal(endpoints[0],'/auth/v1/user/me');assert.equal(endpoints.at(-1),'/v1/rdb/rest/rpc/buffer_sync_commit');
});
