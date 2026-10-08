import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createWechatLoginRuntime} from '../server/wechat-login-runtime.js';
const module=await import('../server/wechat-login-http.js').catch(()=>null);
const origin='https://fixture.example';
const create=extra=>{assert.ok(module,'HTTP login host missing');return module.createWechatLoginHttpServer({allowedOrigin:origin,handleLogin:async()=>Response.json({ticket:'fixture-only-ticket'}),...extra});};
async function run(server,fn){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}}
test('explicit HTTPS origin and login adapter required',()=>{
  for(const extra of [{allowedOrigin:'*'},{allowedOrigin:'http://public.example'},{allowedOrigin:origin+'/path'},{handleLogin:null}])assert.throws(()=>create(extra),/login_http_config_invalid/);
});
test('actual HTTP request reaches handler using socket identity, never forwarded headers',async()=>{
  let calls=0;await run(create({handleLogin:async(request,context)=>{calls++;assert.equal(request.url,origin+'/api/auth/wechat');assert.equal(context.remoteAddress,'127.0.0.1');assert.deepEqual(await request.json(),{code:'fixture_code'});return Response.json({ticket:'fixture-only-ticket'});}}),async base=>{
    const response=await fetch(base+'/api/auth/wechat',{method:'POST',headers:{'content-type':'application/json',origin,'x-forwarded-for':'spoofed'},body:JSON.stringify({code:'fixture_code'})});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{ticket:'fixture-only-ticket'});assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  });assert.equal(calls,1);
});
test('route, method, origin and size rejection happen before provider',async()=>{
  let calls=0;await run(create({handleLogin:async()=>{calls++;return Response.json({ticket:'fixture'});}}),async base=>{
    for(const [path,init,status] of [['/other',{},404],['/api/auth/wechat?code=private',{},400],['/api/auth/wechat',{method:'GET'},405],['/api/auth/wechat',{method:'POST',headers:{origin:'https://evil.example'}},403],['/api/auth/wechat',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(2049)},413],['/api/auth/wechat',{method:'POST',headers:{'content-type':'text/plain'},body:'x'},415]]){
      const r=await fetch(base+path,init);assert.equal(r.status,status);assert.equal(r.headers.get('access-control-allow-origin'),null);
    }
  });assert.equal(calls,0);
});
test('preflight allowed only for explicit JSON POST; native client needs no Origin',async()=>{
  await run(create(),async base=>{
    const preflight=await fetch(base+'/api/auth/wechat',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});assert.equal(preflight.status,204);
    const bad=await fetch(base+'/api/auth/wechat',{method:'OPTIONS',headers:{origin,'access-control-request-method':'DELETE'}});assert.equal(bad.status,403);
    const native=await fetch(base+'/api/auth/wechat',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(native.status,200);assert.equal(native.headers.get('access-control-allow-origin'),null);
  });
});
test('provider exception and malformed response never expose details',async()=>{
  for(const handler of [async()=>{throw Error('private-secret');},async()=>null])await run(create({handleLogin:handler}),async base=>{
    const r=await fetch(base+'/api/auth/wechat',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'login_unavailable'});
  });
});
test('HTTP host composes full login runtime with cryptographic signing (provider fixtures)',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const token=`e30.${Buffer.from(JSON.stringify({role:'authenticated',sub:'fixture-service',aud:'fixture-env',exp:Date.now()/1000+3600})).toString('base64url')}.fixture`;
  const calls=[];
  const handleLogin=await createWechatLoginRuntime({appId:'wxc7f8da28fa006f64',envId:'fixture-env',appSecret:'fixture-secret',hashSecret:'fixture-hash'.repeat(4),credentials:{env_id:'fixture-env',private_key_id:'fixture-key',private_key:privateKey.export({type:'pkcs8',format:'pem'})},rpcGuard:{serviceUserId:'fixture-service',getAccessToken:async()=>token,fetchImpl:async(url)=>{calls.push(url);return Response.json(true);}},fetchImpl:async()=>{calls.push('fixture-wechat');return Response.json({openid:'fixture-only-openid'});}});
  await run(create({handleLogin}),async base=>{
    const response=await fetch(base+'/api/auth/wechat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'fixture-only-code'})});
    assert.equal(response.status,200);const body=await response.json();assert.deepEqual(Object.keys(body),['ticket']);assert.ok(!body.ticket.includes('fixture-only-openid'));assert.equal(calls.length,3);
  });
});
