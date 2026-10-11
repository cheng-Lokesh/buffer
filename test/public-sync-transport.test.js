import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const config={envId:'buffer-d4gz06df3a59dea88',syncUrl:'https://buffer-d4gz06df3a59dea88-1373773247.ap-shanghai.app.tcloudbase.com/api/account/sync'};
const require=createRequire(import.meta.url);
for(const platform of ['web','mini']){
const test=(name,body)=>nodeTest(`[${platform}] ${name}`,body);
const load=async()=>platform==='web'?import('../src/account-sync-transport.js'):require('../miniprogram/core/account-sync-transport');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(overrides={}){
  let identity={phase:'signed_in',accountId:'fixture-account'};
  const calls=[];
  const session={status:()=>identity,getAccessToken:async()=>'fixture-token'};
  return {...config,session,request:async input=>{calls.push(input);return {status:200,body:{protocolVersion:1,schemaVersion:9,revision:0,deletionGeneration:0,state:null}};},calls,setIdentity:value=>{identity=value;},...overrides};
}
test('sync sends only current-session authorization to the exact Shanghai endpoint',async()=>{
  const {createAccountSyncTransport}=await load();const f=fixture();const t=createAccountSyncTransport(f);
  assert.equal((await t.read()).status,200);
  const command={confirmed:true,operation:{type:'delete_all'}};await t.write(command);
  assert.equal(f.calls[0].url,config.syncUrl);assert.equal(f.calls[0].method,'GET');assert.equal(f.calls[0].headers.Authorization,'Bearer fixture-token');
  assert.equal(f.calls[1].method,'POST');assert.deepEqual(f.calls[1].body,command);assert.equal('owner' in f.calls[1],false);
});
test('unsigned sessions and token expiry return 401 without transmitting data',async()=>{
  const {createAccountSyncTransport}=await load();const f=fixture();const t=createAccountSyncTransport(f);
  f.setIdentity({phase:'signed_out',accountId:null});assert.equal((await t.read()).status,401);assert.equal(f.calls.length,0);
  const g=fixture({session:{status:()=>({phase:'signed_in',accountId:'fixture-account'}),getAccessToken:async()=>{throw Error('sensitive provider detail');}}});
  assert.deepEqual(await createAccountSyncTransport(g).read(),{status:401,body:{code:'authentication_required'}});
});
test('logout or account switch during token lookup prevents sending; stale response is never exposed',async()=>{
  const {createAccountSyncTransport}=await load();const token=deferred(),f=fixture();f.session.getAccessToken=()=>token.promise;
  const pending=createAccountSyncTransport(f).read();f.setIdentity({phase:'signed_in',accountId:'other-fixture'});token.resolve('fixture-token');
  assert.equal((await pending).status,401);assert.equal(f.calls.length,0);
  const reply=deferred(),g=fixture({request:()=>reply.promise});const read=createAccountSyncTransport(g).read();await Promise.resolve();await Promise.resolve();
  g.setIdentity({phase:'signed_out',accountId:null});reply.resolve({status:200,body:{state:{private:'must not escape'}}});assert.equal((await read).status,401);
});
test('invalid endpoints, adapters and header injection are rejected',async()=>{
  const {createAccountSyncTransport}=await load();for(const value of ['http://localhost/api/account/sync',config.syncUrl+'?owner=x',config.syncUrl.replace('ap-shanghai','ap-beijing')])assert.throws(()=>createAccountSyncTransport(fixture({syncUrl:value})),/sync_transport_config_invalid/);
  assert.throws(()=>createAccountSyncTransport(fixture({request:null})),/sync_transport_config_invalid/);
  const f=fixture();f.session.getAccessToken=async()=>'bad\r\nAuthorization: other';assert.equal((await createAccountSyncTransport(f).read()).status,401);assert.equal(f.calls.length,0);
});
test('oversized or unserializable commands are rejected before token lookup or network',async()=>{
  const {createAccountSyncTransport}=await load();const f=fixture(),t=createAccountSyncTransport(f);
  await assert.rejects(t.write({text:'汉'.repeat(11000)}),/sync_command_invalid/);
  const cyclic={};cyclic.self=cyclic;await assert.rejects(t.write(cyclic),/sync_command_invalid/);
  for(const value of [null,[],42])await assert.rejects(t.write(value),/sync_command_invalid/);assert.equal(f.calls.length,0);
});
test('network errors are sanitized, server status retained, malformed and excessive responses fail closed',async()=>{
  const {createAccountSyncTransport}=await load();await assert.rejects(createAccountSyncTransport(fixture({request:async()=>{throw Error('sensitive upstream');}})).read(),/^Error: sync_network_unavailable$/);
  for(const result of [null,{status:200,body:'not json'},{status:200,body:{text:'x'.repeat(2200000)}}])await assert.rejects(createAccountSyncTransport(fixture({request:async()=>result})).read(),/sync_response_invalid/);
  for(const status of [400,401,409,503])assert.deepEqual(await createAccountSyncTransport(fixture({request:async()=>({status,body:{code:'fixture'}})})).read(),{status,body:{code:'fixture'}});
});
}
