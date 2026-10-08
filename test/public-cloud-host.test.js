import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
const module=await import('../server/cloudbase-login-host.js').catch(()=>null);
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const config={envId:'fixture-env',appId:'wxc7f8da28fa006f64',appSecret:'fixture-not-real',serviceUserId:'fixture-service',password:'fixture-not-real',allowedOrigin:'https://fixture.example',credentials:{env_id:'fixture-env',private_key_id:'fixture-key',private_key:privateKey.export({type:'pkcs8',format:'pem'})}};
const token=`e30.${Buffer.from(JSON.stringify({role:'authenticated',sub:config.serviceUserId,aud:config.envId,exp:Date.now()/1000+3600})).toString('base64url')}.fixture`;
const create=extra=>{assert.ok(module,'cloud host composition missing');return module.createCloudBaseLoginServer({config,...extra});};
test('missing or invalid private configuration fails startup',async()=>{
  for(const value of [null,{}, {...config,password:''},{...config,credentials:null},{...config,allowedOrigin:'*'},{...config,keyPolicy:'unknown'}])await assert.rejects(create({config:value}),/cloud_login_startup_failed/);
});
test('real HTTP host bootstraps validated ordinary session and entire login path (provider fixtures)',async()=>{
  const calls=[];const server=await create({fetchImpl:async(url)=>{calls.push(url);if(url.endsWith('/signin'))return Response.json({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,sub:config.serviceUserId});if(url.endsWith('/user/me'))return Response.json({sub:config.serviceUserId,username:'buffer-login-service'});if(url.includes('/rpc/'))return Response.json(true);return Response.json({openid:'fixture-openid'});}});
  assert.equal(server.listening,false);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/wechat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'fixture-wechat-code'})});assert.equal(r.status,200);const body=await r.json();assert.deepEqual(Object.keys(body),['ticket']);assert.ok(!body.ticket.includes(config.password));assert.equal(calls.length,5);}finally{await new Promise(r=>server.close(r));}
});
test('platform denial never produces a listening server or leaks provider error',async()=>{
  await assert.rejects(create({fetchImpl:async()=>{throw Error('private-provider-secret');}}),/^Error: cloud_login_startup_failed$/);
});
