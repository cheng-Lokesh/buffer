import test from 'node:test';
import assert from 'node:assert/strict';
async function factory(){const m=await import('../server/rpc-browser-pairing-store.js').catch(()=>null);assert.equal(typeof m?.createRpcBrowserPairingStore,'function','server encrypted pairing adapter missing');return m.createRpcBrowserPairingStore;}
const envId='fixture-env',serviceUserId='fixture-service';
const token=role=>`a.${Buffer.from(JSON.stringify({sub:serviceUserId,role,aud:envId,exp:Date.now()/1000+3600})).toString('base64url')}.b`;
async function fixture(){
  const create=await factory();const calls=[];let approved=null,identity='authenticated',malformed=false;
  const store=create({envId,serviceUserId,backendKey:'a'.repeat(64),encryptionKey:'b'.repeat(64),hashSecret:'c'.repeat(64),getAccessToken:async()=>token(identity),
    fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});
      if(url.endsWith('_approve'))approved={accountId:body.p_owner,sealedGrant:body.p_sealed};
      const result=malformed?{}:url.endsWith('_consume')?approved:true;
      return new Response(JSON.stringify(result));}});
  return {store,calls,setRole:r=>identity=r,setMalformed:()=>malformed=true,setApproved:v=>approved=v,get approved(){return approved;}};
}
const input={challenge:'D'.repeat(43),code:'ABCDEFGH',browserSecret:'E'.repeat(43)};
test('server pairing adapter hashes browser proof and codes, encrypts grants and recovers once-consumed results',async()=>{
  const f=await fixture();assert.equal(await f.store.create(input),true);
  const params=f.calls[0].body;assert.match(params.p_challenge,/^[a-f0-9]{64}$/);assert.match(params.p_code,/^[a-f0-9]{64}$/);assert.match(params.p_browser,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(params).includes(input.browserSecret));assert.ok(!JSON.stringify(params).includes(input.code));
  assert.equal(await f.store.approve({code:input.code,accountId:'fixture-owner',ticket:'private-fixture-ticket'}),true);
  assert.ok(!f.approved.sealedGrant.includes('private-fixture-ticket'));
  assert.deepEqual(await f.store.consume(input),{accountId:'fixture-owner',ticket:'private-fixture-ticket'});
  assert.equal(f.calls[0].options.redirect,'error');assert.equal(f.calls[0].options.cache,'no-store');
});
test('pairing adapter rejects service credentials, malformed responses, tampered or substituted grants',async()=>{
  const f=await fixture();f.setRole('service_role');await assert.rejects(f.store.create(input),/pair_store_unavailable/);assert.equal(f.calls.length,0);
  f.setRole('authenticated');f.setMalformed();await assert.rejects(f.store.create(input),/pair_store_unavailable/);
  const g=await fixture();await g.store.approve({code:input.code,accountId:'fixture-owner',ticket:'ticket'});
  g.setApproved({...g.approved,accountId:'other-owner'});await assert.rejects(g.store.consume(input),/pair_store_unavailable/);
  g.setApproved({accountId:'fixture-owner',sealedGrant:'bad'});await assert.rejects(g.store.consume(input),/pair_store_unavailable/);
  g.setApproved(null);assert.equal(await g.store.consume(input),null);
});
test('pairing adapter rejects invalid inputs before network calls and requires all private configuration',async()=>{
  const create=await factory();assert.throws(()=>create({}),/pair_store_config_invalid/);
  const f=await fixture();await assert.rejects(f.store.create({...input,code:'bad'}),/pair_input_invalid/);
  await assert.rejects(f.store.consume({...input,browserSecret:'bad'}),/pair_input_invalid/);
  await assert.rejects(f.store.approve({code:input.code,accountId:'bad owner',ticket:'ticket'}),/pair_input_invalid/);
  await assert.rejects(f.store.approve({code:input.code,accountId:'fixture-owner',ticket:'x'.repeat(16385)}),/pair_input_invalid/);
  assert.equal(f.calls.length,0);
});
