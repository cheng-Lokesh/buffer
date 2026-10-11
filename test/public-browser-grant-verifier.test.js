import test from 'node:test';
import assert from 'node:assert/strict';
async function fixture(overrides={}){
  const m=await import('../server/wechat-browser-grant-verifier.js').catch(()=>null);assert.equal(typeof m?.createWechatBrowserGrantVerifier,'function','verified WeChat browser approval missing');
  let owner='fixture-owner',fresh='fixture-owner',allowed=true,issued=0;const calls=[];
  const verify=m.createWechatBrowserGrantVerifier({appId:'wx1234567890abcdef',envId:'fixture-env',
    authenticate:async request=>{calls.push('profile');return request.headers.get('authorization')==='Bearer initial'?owner&&{accountId:owner}:fresh&&{accountId:fresh};},
    consumeCode:async()=>{calls.push('consume');return allowed;},exchangeCode:async()=>{calls.push('exchange');return {openid:'fixture-openid'};},
    createTicket:async uid=>{calls.push(uid);return 'opaque-ticket-'+(++issued);},
    fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({access_token:'provider-access'}));},...overrides});
  return {verify,calls,create:m.createWechatBrowserGrantVerifier,setOwner:v=>owner=v,setFresh:v=>fresh=v,setAllowed:v=>allowed=v};
}
const input={request:new Request('https://fixture.test/',{headers:{authorization:'Bearer initial'}}),code:'fresh-code-1234'};
test('approval verifies fresh WeChat identity against authenticated canonical provider account before issuing a new ticket',async()=>{
  const f=await fixture();const result=await f.verify(input);assert.deepEqual(result,{accountId:'fixture-owner',ticket:'opaque-ticket-2'});
  const request=f.calls.find(c=>c?.url);assert.equal(request.url,'https://fixture-env.api.tcloudbasegateway.com/auth/v1/signin/custom');
  assert.equal(JSON.parse(request.options.body).ticket,'opaque-ticket-1');assert.equal(request.options.redirect,'error');
  assert.equal(f.calls.filter(c=>c==='profile').length,2);assert.equal(f.calls.filter(c=>typeof c==='string'&&c.startsWith('wx_')).length,2);
});
test('provider errors, malformed or oversized tokens, reused tickets and invalid inputs fail closed',async()=>{
  const f=await fixture();assert.throws(()=>f.create({}),/pair_verifier_config_invalid/);
  await assert.rejects(f.verify({...input,code:'bad'}),/pair_identity_rejected/);assert.equal(f.calls.length,0);
  for(const override of [
    {exchangeCode:async()=>({errcode:400,openid:'fixture'})},
    {createTicket:async()=>''},
    {createTicket:async()=> 'identical-ticket'},
    {fetchImpl:async()=>new Response('{}',{status:503})},
    {fetchImpl:async()=>new Response('x'.repeat(32769))},
    {fetchImpl:async()=>new Response(JSON.stringify({access_token:''}))},
    {fetchImpl:async()=>new Response(JSON.stringify({access_token:'x'.repeat(4097)}))},
  ]) {const current=await fixture(override);await assert.rejects(current.verify(input),/pair_identity_rejected/);}
});
test('approval rejects wrong account, missing authentication and replayed code without returning a browser ticket',async()=>{
  const mismatch=await fixture();mismatch.setFresh('other-owner');await assert.rejects(mismatch.verify(input),/pair_identity_rejected/);
  assert.equal(mismatch.calls.filter(c=>typeof c==='string'&&c.startsWith('wx_')).length,1);
  const signedOut=await fixture();signedOut.setOwner(null);await assert.rejects(signedOut.verify(input),/pair_identity_rejected/);assert.deepEqual(signedOut.calls,['profile']);
  const replay=await fixture();replay.setAllowed(false);await assert.rejects(replay.verify(input),/pair_identity_rejected/);assert.ok(!replay.calls.includes('exchange'));
});
