import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const module=await import('../server/rpc-login-guard.js').catch(()=>null);
const envId='fixture-env';
const serviceUserId='fixture-service-identity';
const token=(claims={})=>`e30.${Buffer.from(JSON.stringify({role:'authenticated',sub:serviceUserId,aud:envId,exp:Date.now()/1000+3600,...claims})).toString('base64url')}.fixture`;
const options={envId,serviceUserId,scope:'fixture-login',hashSecret:'fixture-hash-secret'.repeat(3),getAccessToken:async()=>token()};
const create=extra=>{assert.ok(module,'restricted RPC login guard is missing');return module.createRpcLoginGuard({...options,...extra});};
test('missing configuration and administrator identities cannot become a guard',()=>{
  assert.ok(module,'restricted RPC login guard is missing');
  for(const extra of [{envId:'https://elsewhere.test'},{serviceUserId:''},{scope:'bad scope'},{hashSecret:'short'},{getAccessToken:null}]) assert.throws(()=>create(extra),/login_guard_config_invalid/);
});
test('untrusted IP is denied without token or network access',async()=>{
  let calls=0;const guard=create({getAccessToken:async()=>{calls++;return token();},fetchImpl:async()=>{calls++;}});
  for(const context of [{},{remoteAddress:'spoofed'},{headers:{'x-forwarded-for':'127.0.0.1'}}]) assert.equal(await guard.admit(context),false);
  assert.equal(calls,0);
});
test('only two fixed RPCs receive hashed metadata, never raw IP or client budgets',async()=>{
  const calls=[];const guard=create({fetchImpl:async(url,init)=>{calls.push({url,init});return new Response('true');}});
  assert.equal(await guard.admit({remoteAddress:'127.0.0.1'}),true);
  assert.equal(await guard.consumeCode('a'.repeat(64)),true);
  assert.deepEqual(calls.map(x=>x.url),['https://fixture-env.api.tcloudbasegateway.com/v1/rdb/rest/rpc/buffer_login_admit','https://fixture-env.api.tcloudbasegateway.com/v1/rdb/rest/rpc/buffer_login_consume']);
  assert.deepEqual(JSON.parse(calls[0].init.body),{p_scope:'fixture-login',p_identity:createHmac('sha256',options.hashSecret).update('127.0.0.1').digest('hex')});
  assert.deepEqual(JSON.parse(calls[1].init.body),{p_scope:'fixture-login',p_digest:'a'.repeat(64)});
  assert.ok(!JSON.stringify(calls).includes('127.0.0.1'));
  assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.cache,'no-store');assert.ok(calls[0].init.signal instanceof AbortSignal);
});
test('wrong identity, wrong environment, expired or privileged tokens never leave server',async()=>{
  let calls=0;
  for(const access of ['', 'not-a-jwt',token({role:'service_role'}),token({sub:'another-user'}),token({aud:'another-env'}),token({exp:0})]) {
    const guard=create({getAccessToken:async()=>access,fetchImpl:async()=>{calls++;return new Response('true');}});
    await assert.rejects(guard.admit({remoteAddress:'::1'}),/^Error: login_guard_unavailable$/);
  }
  assert.equal(calls,0);
});
test('explicit false is denial; ambiguous responses and failures fail closed and sanitized',async()=>{
  assert.equal(await create({fetchImpl:async()=>new Response('false')}).consumeCode('b'.repeat(64)),false);
  for(const fetchImpl of [async()=>new Response('{"allowed":true}'),async()=>new Response('private-error',{status:403}),async()=>{throw new Error('private-secret');},async()=>new Response('x'.repeat(4097))]) {
    await assert.rejects(create({fetchImpl}).consumeCode('b'.repeat(64)),/^Error: login_guard_unavailable$/);
  }
  await assert.rejects(create({getAccessToken:async()=>{throw new Error('private-secret');}}).consumeCode('b'.repeat(64)),/^Error: login_guard_unavailable$/);
});
test('raw authorization code cannot be passed to RPC',async()=>{
  let called=false;const guard=create({fetchImpl:async()=>{called=true;}});
  await assert.rejects(guard.consumeCode('raw-wechat-code'),/login_code_hash_invalid/);assert.equal(called,false);
});
