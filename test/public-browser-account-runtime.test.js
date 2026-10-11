import test from 'node:test';import assert from 'node:assert/strict';
import {applyConfirmedAccountOperation} from '../src/account-confirmation.js';
async function fixture(){const m=await import('../src/browser-account-runtime.js').catch(()=>null);assert.equal(typeof m?.createBrowserAccountRuntime,'function','browser account composition missing');
  const reads=[],writes=[],views=[],data=new Map();let pending=true,rev=0,state=null,offline=false;
  const runtime=m.createBrowserAccountRuntime({storage:{getItem:key=>{reads.push(key);return data.get(key)||null;},setItem:(key,value)=>{writes.push(key);data.set(key,value);}},
    getLoginTicket:async()=>({accountId:'fixture-owner',ticket:'fixture-ticket'}),request:async input=>{
      if(input.url.endsWith('/signin/custom'))return {status:200,body:{sub:'fixture-owner',access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:120}};
      if(input.url.endsWith('/user/me'))return {status:200,body:{sub:'fixture-owner'}};
      if(offline)throw Error('network');
      if(input.method==='POST'){const command=input.body;state=applyConfirmedAccountOperation({state,operation:command.operation,operationId:command.operationId}).state;rev++;}
      return {status:200,body:{protocolVersion:1,schemaVersion:9,revision:rev,deletionGeneration:0,state}};
    },onChange:view=>views.push(view),schedule:()=>1,cancel:()=>{},now:()=>Date.parse('2026-10-11T03:00:00.000Z')});
  return {runtime,reads,writes,views,setOffline:v=>offline=v};
}
test('actual browser composition loads only own account cache and confirms through shared protocol',async()=>{
  const f=await fixture();assert.equal(f.reads.length,0);await f.runtime.login();assert.equal(f.runtime.status().sync.state,null);
  const scope=f.runtime.scope();await f.runtime.confirm('confirm_basics',{cash:{balance:4000,reserve:1000,daily:30}},{confirmed:true,scope});
  assert.equal(f.runtime.status().sync.phase,'synced');assert.equal(f.runtime.status().sync.state.cash.balance,4000);
  assert.ok(f.reads.every(key=>key==='buffer-zone.account.sync.v1:fixture-owner'));assert.ok(f.writes.every(key=>key===f.reads[0]));
  f.runtime.logout();assert.equal(f.runtime.status().sync.state,null);await assert.rejects(f.runtime.confirm('confirm_basics',{cash:{}},{confirmed:true,scope}),/account_scope_changed/);
});
test('browser composition keeps explicitly confirmed offline work and never falls back to old local state',async()=>{
  const f=await fixture();await f.runtime.login();f.setOffline(true);await f.runtime.confirm('confirm_basics',{cash:{balance:3000,reserve:500,daily:20}},{confirmed:true,scope:f.runtime.scope()});
  assert.equal(f.runtime.status().sync.phase,'offline');assert.equal(f.runtime.status().sync.pendingCount,1);assert.equal(f.runtime.status().sync.state.cash.balance,3000);
  f.runtime.logout();assert.equal(f.runtime.status().sync.state,null);assert.ok(f.reads.every(key=>key.startsWith('buffer-zone.account.sync.v1:')));
});
