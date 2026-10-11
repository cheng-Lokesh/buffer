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
  const calls=[];const server=await create({fetchImpl:async(input)=>{const url=String(input);calls.push(url);if(url.endsWith('/signin'))return Response.json({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,sub:config.serviceUserId});if(url.endsWith('/user/me'))return Response.json({sub:config.serviceUserId,username:'buffer-login-service'});if(url.includes('/rpc/'))return Response.json(true);return Response.json({openid:'fixture-openid'});}});
  assert.equal(server.listening,false);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/wechat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'fixture-wechat-code'})});assert.equal(r.status,200);const body=await r.json();assert.deepEqual(Object.keys(body),['ticket']);assert.ok(!body.ticket.includes(config.password));assert.equal(calls.length,5);}finally{await new Promise(r=>server.close(r));}
});
test('platform denial never produces a listening server or leaks provider error',async()=>{
  await assert.rejects(create({fetchImpl:async()=>{throw Error('private-provider-secret');}}),/^Error: cloud_login_startup_failed$/);
});
test('financial runtime is explicitly configured and uses end-user bearer, never the login-service session',async()=>{
  await assert.rejects(create({config:{...config,sync:{enabled:true,backendKey:'bad'}},fetchImpl:async()=>Response.json({})}),/cloud_login_startup_failed/);
  const userToken=`e30.${Buffer.from(JSON.stringify({role:'authenticated',sub:'fixture-user',aud:config.envId,exp:Date.now()/1000+300})).toString('base64url')}.fixture`;
  let financialCalls=0;
  const server=await create({config:{...config,sync:{enabled:true,backendKey:'a'.repeat(64)}},fetchImpl:async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/signin'))return Response.json({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,sub:config.serviceUserId});
    if(url.endsWith('/user/me'))return Response.json(init.headers.authorization===`Bearer ${userToken}`?{sub:'fixture-user',status:'ACTIVE'}:{sub:config.serviceUserId,username:'buffer-login-service'});
    if(url.endsWith('/buffer_sync_read')){financialCalls++;assert.equal(init.headers.authorization,`Bearer ${userToken}`);return Response.json({revision:0,deletionGeneration:0,state:null});}
    throw Error('unexpected provider fixture');
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    const missing=await fetch(base+'/api/account/sync');assert.equal(missing.status,401);
    const own=await fetch(base+'/api/account/sync',{headers:{authorization:`Bearer ${userToken}`}});assert.equal(own.status,200);assert.equal((await own.json()).state,null);
    assert.equal(financialCalls,1);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('browser runtime is opt-in and composes encrypted RPC storage with a separate durable admission scope',async()=>{
  const calls=[];const pair={enabled:true,backendKey:'a'.repeat(64),encryptionKey:'b'.repeat(64)};
  const server=await create({config:{...config,pair},fetchImpl:async(input,init)=>{
    const url=String(input);calls.push({url,init});
    if(url.endsWith('/signin'))return Response.json({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,sub:config.serviceUserId});
    if(url.endsWith('/user/me'))return Response.json({sub:config.serviceUserId,username:'buffer-login-service'});
    if(url.endsWith('/buffer_login_admit')){assert.equal(JSON.parse(init.body).p_scope,config.appId+'_pair');return Response.json(true);}
    if(url.endsWith('/buffer_pair_create')){const body=JSON.parse(init.body);assert.equal(body.p_key,pair.backendKey);assert.match(body.p_browser,/^[a-f0-9]{64}$/);return Response.json(true);}
    throw Error('unexpected provider fixture');
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {const response=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/browser/create`,{method:'POST',headers:{origin:config.allowedOrigin,'content-type':'application/json'},body:JSON.stringify({browserSecret:'A'.repeat(43)})});
    assert.equal(response.status,200);assert.equal((await response.json()).expiresIn,120);assert.equal(calls.length,4);
  }finally{await new Promise(resolve=>server.close(resolve));}
  for(const invalid of [{enabled:false},{...pair,encryptionKey:'bad'},{...pair,extra:true}])await assert.rejects(create({config:{...config,pair:invalid},fetchImpl:async()=>Response.json({})}),/cloud_login_startup_failed/);
});
test('composed HTTP approval verifies both profiles, consumes the shared code guard and encrypts the delivered ticket',async()=>{
  const userToken=`e30.${Buffer.from(JSON.stringify({role:'authenticated',sub:'fixture-user',aud:config.envId,exp:Date.now()/1000+300})).toString('base64url')}.fixture`;
  let grant=null,consumed=0,profiles=0;
  const server=await create({config:{...config,pair:{enabled:true,backendKey:'a'.repeat(64),encryptionKey:'b'.repeat(64)}},fetchImpl:async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/signin'))return Response.json({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,sub:config.serviceUserId});
    if(url.endsWith('/user/me')){if(init.headers.authorization===`Bearer ${userToken}`){profiles++;return Response.json({sub:'fixture-user',status:'ACTIVE'});}return Response.json({sub:config.serviceUserId,username:'buffer-login-service'});}
    if(url.endsWith('/buffer_login_admit'))return Response.json(true);
    if(url.endsWith('/buffer_login_consume')){consumed++;assert.equal(JSON.parse(init.body).p_scope,config.appId);return Response.json(true);}
    if(url.startsWith('https://api.weixin.qq.com/sns/jscode2session'))return Response.json({openid:'fixture-openid'});
    if(url.endsWith('/signin/custom')){await new Promise(resolve=>setTimeout(resolve,3));return Response.json({access_token:userToken});}
    if(url.endsWith('/buffer_pair_approve')){const body=JSON.parse(init.body);grant={accountId:body.p_owner,sealedGrant:body.p_sealed};return Response.json(true);}
    if(url.endsWith('/buffer_pair_consume')){const result=grant;grant=null;return Response.json(result);}
    throw Error('unexpected provider fixture');
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}/api/auth/browser/`;
    const approval=await fetch(base+'approve',{method:'POST',headers:{authorization:`Bearer ${userToken}`,'content-type':'application/json'},body:JSON.stringify({code:'ABCDEFGH',wechatCode:'fixture-fresh-code'})});
    assert.equal(approval.status,200);assert.deepEqual(await approval.json(),{approved:true});assert.equal(profiles,2);assert.equal(consumed,1);
    const sealed=grant.sealedGrant;
    const consume=()=>fetch(base+'consume',{method:'POST',headers:{origin:config.allowedOrigin,'content-type':'application/json'},body:JSON.stringify({challenge:'A'.repeat(43),browserSecret:'B'.repeat(43)})});
    const delivered=await (await consume()).json();assert.equal(delivered.accountId,'fixture-user');assert.ok(delivered.ticket.startsWith('fixture-key/@@/'));assert.ok(!sealed.includes(delivered.ticket));
    assert.equal((await consume()).status,202);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
