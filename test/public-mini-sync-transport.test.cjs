const test=require('node:test');
const assert=require('node:assert/strict');
test('native sync adapter uses actual wx request contract and shared bearer transport',async()=>{
  const {createMiniAccountSyncTransport}=require('../miniprogram/utils/account-sync');
  const calls=[],session={status:()=>({phase:'signed_in',accountId:'fixture'}),getAccessToken:async()=>'fixture-token'};
  const platform={request:input=>{calls.push(input);input.success({statusCode:503,data:{code:'sync_unavailable'}});}};
  const transport=createMiniAccountSyncTransport(platform,session);
  assert.deepEqual(await transport.read(),{status:503,body:{code:'sync_unavailable'}});
  assert.equal(calls[0].timeout,10000);assert.equal(calls[0].header.Authorization,'Bearer fixture-token');
  await transport.write({confirmed:true,operation:{type:'delete_all'}});assert.equal(calls[1].method,'POST');assert.equal(calls[1].data.confirmed,true);
  assert.throws(()=>createMiniAccountSyncTransport({},session),/native_sync_adapter_required/);
  await assert.rejects(createMiniAccountSyncTransport({request:input=>input.fail({errMsg:'secret'})},session).read(),/^Error: sync_network_unavailable$/);
});
