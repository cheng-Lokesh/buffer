import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../server/cloudbase-service-session.js').catch(()=>null);
const envId='fixture-env',serviceUserId='fixture-service';
let now=1700000000000;
const token=(extra={})=>`e30.${Buffer.from(JSON.stringify({role:'authenticated',sub:serviceUserId,aud:envId,exp:now/1000+120,...extra})).toString('base64url')}.fixture`;
const session=(extra={})=>({access_token:token(),refresh_token:'fixture-refresh',expires_in:120,sub:serviceUserId,...extra});
const options={envId,serviceUserId,username:'buffer-login-service',password:'fixture-password',now:()=>now};
const create=extra=>{assert.ok(module,'service session adapter missing');return module.createCloudBaseServiceSession({...options,...extra});};
test('configuration is explicit and restricted',()=>{
  for(const extra of [{envId:'https://elsewhere'},{serviceUserId:''},{username:'admin'},{password:''},{fetchImpl:null},{now:null}]) assert.throws(()=>create(extra),/service_session_config_invalid/);
});
test('single login serves concurrent requests; official profile validates identity; refresh rotates',async()=>{
  now=1700000000000;const calls=[];
  const provider=create({fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json(url.endsWith('/user/me')?{sub:serviceUserId,username:'buffer-login-service'}:session({refresh_token:`fixture-refresh-${calls.length}`}));}});
  const results=await Promise.all(Array.from({length:10},()=>provider.getAccessToken()));
  assert.equal(new Set(results).size,1);assert.equal(calls.length,2);
  assert.equal(await provider.getAccessToken(),results[0]);assert.equal(calls.length,2);
  now+=100000;await Promise.all([provider.getAccessToken(),provider.getAccessToken()]);
  assert.equal(calls.length,4);assert.ok(calls[2].url.endsWith('/token'));
  assert.deepEqual(JSON.parse(calls[2].init.body),{grant_type:'refresh_token',refresh_token:'fixture-refresh-1'});
  for(const {url,init} of calls){assert.ok(url.startsWith(`https://${envId}.api.tcloudbasegateway.com/auth/v1/`));assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);}
  assert.deepEqual(Object.keys(provider),['getAccessToken']);
});
test('malformed, privileged, wrong and expired sessions fail closed before profile',async()=>{
  for(const value of [session({access_token:'bad'}),session({access_token:token({role:'service_role'})}),session({access_token:token({aud:'wrong'})}),session({access_token:token({sub:'wrong'})}),session({access_token:token({exp:0})}),session({sub:'wrong'}),session({expires_in:0}),session({refresh_token:''}),session({access_token:'a'.repeat(4097)})]) {
    let count=0;const provider=create({fetchImpl:async()=>{count++;return Response.json(value);}});
    await assert.rejects(provider.getAccessToken(),/^Error: service_session_unavailable$/);assert.equal(count,1);
  }
});
test('profile mismatch, network failure, large and invalid response are sanitized',async()=>{
  for(const fetchImpl of [async()=>{throw Error('private password');},async()=>new Response('private',{status:403}),async()=>new Response('not json'),async()=>new Response('x'.repeat(16385)),async url=>Response.json(url.endsWith('/user/me')?{sub:'wrong',username:'buffer-login-service'}:session()),async url=>Response.json(url.endsWith('/user/me')?{sub:serviceUserId,username:'another-user'}:session())]) {
    const provider=create({fetchImpl});await assert.rejects(provider.getAccessToken(),/^Error: service_session_unavailable$/);
  }
});
test('failed refresh latches closed without password fallback or retry storm',async()=>{
  now=1700000000000;let calls=0;
  const provider=create({fetchImpl:async url=>{calls++;if(url.endsWith('/token'))throw Error('revoked refresh');return Response.json(url.endsWith('/user/me')?{sub:serviceUserId,username:'buffer-login-service'}:session());}});
  await provider.getAccessToken();now+=100000;
  await assert.rejects(provider.getAccessToken(),/service_session_unavailable/);
  await assert.rejects(provider.getAccessToken(),/service_session_unavailable/);assert.equal(calls,3);
});
