import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
const module=await import('../server/wechat-login-runtime.js').catch(()=>null);
const appId='wxc7f8da28fa006f64';
const envId='fixture-env';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const config={appId,envId,appSecret:'fixture-not-a-live-secret',credentials:{env_id:envId,private_key_id:'fixture-key',private_key:privateKey.export({type:'pkcs8',format:'pem'})},hashSecret:'fixture-guard-hash'.repeat(3),maxPerMinute:3,maxDailyRequests:100};
const pool={connect:async()=>({query:async sql=>({rows:sql.includes('RETURNING')?[{}]:[]}),release:()=>{}})};
const request=()=>new Request('https://example.test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'fixture_code_only'})});
test('real mini-program AppID replaces the tourist placeholder',()=>{
  const project=JSON.parse(readFileSync(new URL('../miniprogram/project.config.json',import.meta.url)));
  assert.equal(project.appid,appId);
});
test('runtime composes provider exchange, persistent guard and cryptographic signer',async()=>{
  assert.ok(module,'login runtime composition missing');
  let calls=0;
  const handle=await module.createWechatLoginRuntime({...config,pool,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({openid:'fixture_openid',session_key:'discard-this-fixture'}));}});
  const response=await handle(request(),{remoteAddress:'127.0.0.1'});
  assert.equal(response.status,200);assert.equal(calls,1);
  const body=await response.json();assert.deepEqual(Object.keys(body),['ticket']);
  const payload=JSON.parse(Buffer.from(body.ticket.split('/@@/')[1].split('.')[1],'base64url'));
  assert.match(payload.uid,/^wx_[a-f0-9]{29}$/);assert.equal(payload.env,envId);
  assert.ok(!JSON.stringify(body).includes('fixture_openid'));assert.ok(!JSON.stringify(body).includes('discard-this-fixture'));
});
test('missing secrets/database refuse startup, never create a demo session',async()=>{
  assert.ok(module,'login runtime composition missing');
  for(const bad of [{...config,pool:null}, {...config,pool,appSecret:''}, {...config,pool,credentials:null}]) await assert.rejects(module.createWechatLoginRuntime(bad));
});
test('untrusted network context never reaches the provider',async()=>{
  assert.ok(module,'login runtime composition missing');
  let called=false;
  const handle=await module.createWechatLoginRuntime({...config,pool,fetchImpl:async()=>{called=true;throw new Error('must not call');}});
  assert.equal((await handle(request(),{})).status,429);assert.equal(called,false);
});
test('runtime carries only an explicitly selected CloudBase RSA1024 policy to the signer',async()=>{
  const legacy=generateKeyPairSync('rsa',{modulusLength:1024});
  const options={...config,pool,credentials:{...config.credentials,private_key:legacy.privateKey.export({type:'pkcs1',format:'pem'})},fetchImpl:async()=>new Response(JSON.stringify({openid:'fixture_openid'}))};
  await assert.rejects(module.createWechatLoginRuntime(options),/cloudbase_signer_config_invalid/);
  const handle=await module.createWechatLoginRuntime({...options,keyPolicy:'cloudbase-rsa1024'});
  assert.equal((await handle(request(),{remoteAddress:'::1'})).status,200);
});
