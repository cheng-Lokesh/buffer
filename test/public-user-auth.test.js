import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../server/cloudbase-user-auth.js').catch(() => null);
const envId='fixture-env',serviceUserId='fixture-service',accountId='fixture-user';
const now=1700000000000;
const token=(claims={})=>`e30.${Buffer.from(JSON.stringify({aud:envId,role:'authenticated',sub:accountId,exp:now/1000+120,...claims})).toString('base64url')}.fixture`;
const request=access=>new Request('https://fixture.invalid/api/account/sync',{headers:access?{authorization:`Bearer ${access}`}:{}});
const create=extra=>{assert.ok(module,'user authentication adapter missing');return module.createCloudBaseUserAuth({envId,serviceUserId,now:()=>now,...extra});};

test('explicit identity configuration; no administrator or login service fallback',()=>{
  for(const extra of [{envId:''},{envId:'wrong.example'},{serviceUserId:''},{fetchImpl:null},{now:null}])assert.throws(()=>create(extra),/user_auth_config_invalid/);
});
test('official profile verifies bearer; output contains only verified owner and memory token',async()=>{
  let calls=0;const access=token();
  const auth=create({fetchImpl:async(url,init)=>{
    calls++;assert.equal(url,`https://${envId}.api.tcloudbasegateway.com/auth/v1/user/me`);
    assert.equal(init.method,'GET');assert.equal(init.headers.authorization,`Bearer ${access}`);
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);
    return Response.json({sub:accountId,status:'ACTIVE',username:'fixture-person',email:'not-returned',providers:[{id:'custom'}]});
  }});
  assert.deepEqual(await auth(request(access)),{accountId,accessToken:access});
  await auth(request(access));assert.equal(calls,2,'authorization must not cache stale permissions');
});
test('missing, malformed, privileged, foreign, expired and service claims never reach provider',async()=>{
  let calls=0;const auth=create({fetchImpl:async()=>{calls++;throw Error('must not call');}});
  for(const access of [null,'bad','a'.repeat(4097),token({aud:'other'}),token({role:'service_role'}),token({sub:serviceUserId}),token({sub:''}),token({sub:{owner:'wrong'}}),token({exp:0}),token({exp:now/1000}),token({exp:'future'}),token({nbf:now/1000+20}),token({nbf:'bad'})])assert.equal(await auth(request(access)),null);
  assert.equal(await auth(new Request('https://fixture.invalid/?access_token=ignored',{headers:{cookie:'token=ignored'}})),null);
  assert.equal(await auth(new Request('https://fixture.invalid',{headers:{authorization:`Basic ${token()}`}})),null);
  assert.equal(calls,0);
});
test('profile mismatch, deleted or service identity and provider errors fail closed without leaking details',async()=>{
  for(const fetchImpl of [
    async()=>Response.json({sub:'other'}),async()=>Response.json({sub:accountId,username:'buffer-login-service'}),
    async()=>Response.json({sub:accountId,status:'DISABLED'}),async()=>Response.json({sub:accountId,status:'DELETED'}),
    async()=>Response.json(null),async()=>new Response('private details',{status:401}),
    async()=>new Response('not-json'),async()=>new Response('x'.repeat(16385)),
    async()=>{throw Error('private credentials');},async()=>new Response(null),
  ])assert.equal(await create({fetchImpl})(request(token())),null);
});
test('streaming cap cancels oversized profile without retaining personal data',async()=>{
  let cancelled=false;const auth=create({fetchImpl:async()=>new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(16385));},cancel(){cancelled=true;}
  }))});
  assert.equal(await auth(request(token())),null);assert.equal(cancelled,true);
});
test('failed stream cleanup and a token expiring during profile verification remain closed',async()=>{
  const auth=create({fetchImpl:async()=>new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(16385));},cancel(){throw Error('private cleanup error');}
  }))});
  assert.equal(await auth(request(token())),null);
  let clock=now;
  const expiring=create({now:()=>clock,fetchImpl:async()=>{clock+=121000;return Response.json({sub:accountId});}});
  assert.equal(await expiring(request(token())),null);
});
