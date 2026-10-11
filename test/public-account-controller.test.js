import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAccountSyncService} from '../server/account-sync-service.js';
import {applyConfirmedAccountOperation} from '../src/account-confirmation.js';
import {normalizeCashReality} from '../src/v8-cash-reality.js';
const require=createRequire(import.meta.url),stamp='2026-10-11T02:00:00.000Z';
for(const platform of ['web','mini']){
  const test=(name,body)=>nodeTest(`[${platform}] ${name}`,body);
  async function fixture(){
    const {createAccountController}=platform==='web'?await import('../src/account-controller.js'):require('../miniprogram/core/account-controller');
    const {createAccountSyncClient}=platform==='web'?await import('../src/account-sync-client.js'):require('../miniprogram/core/account-sync-client');
    const storage=new Map(),rows=new Map(),receipts=new Map(),notices=[];let auth='signed_out',owner='fixture-a',ids=0,sends=0,reads=0,offline=false;
    const service=createAccountSyncService({authenticate:async()=>({accountId:owner}),applyConfirmedOperation:input=>applyConfirmedAccountOperation(input,{now:()=>Date.parse(stamp)}),repository:{transaction:async(id,fn)=>fn({read:async()=>rows.get(id)||null,getReceipt:async(_,op)=>receipts.get(id+op),write:async row=>rows.set(id,row),putReceipt:async(_,op,value)=>receipts.set(id+op,value)})}});
    const transport=async(method,command)=>{if(offline)throw Error('offline');if(method==='POST')sends++;else reads++;const response=await service(new Request('https://fixture.invalid',{method,...(command?{body:JSON.stringify(command)}:{})}));return {status:response.status,body:await response.json()};};
    const session={status:()=>({phase:auth,accountId:auth==='signed_in'?owner:null}),login:async()=>{auth='signed_in';return session.status();},logout:()=>{auth='signed_out';}};
    const client=createAccountSyncClient({storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},transport:{read:()=>transport('GET'),write:command=>transport('POST',command)},createOperationId:()=>`fixture-controller-operation-${++ids}`});
    const controller=createAccountController({session,syncClient:client,onChange:value=>notices.push(value),now:()=>Date.parse(stamp)});
    return {controller,session,client,rows,storage,notices,setOffline:value=>{offline=value;},setOwner:value=>{owner=value;},get sends(){return sends;},get reads(){return reads;}};
  }
  const basics={type:'confirm_reality',action:'confirm_basics',cash:{balance:5000,reserve:500,daily:20},confirmedAt:stamp};
  test('login activates only own cache; confirmed facts automatically flush, while previews and invalid input do not write',async()=>{
    const f=await fixture();f.storage.set('buffer-zone.mini.state.v2','legacy-private-fixture');assert.equal(f.reads,0);assert.equal(f.sends,0);
    await f.controller.login();assert.equal(f.sends,0);assert.equal(f.controller.status().state,null);
    await assert.rejects(f.controller.confirm(basics),/explicit_confirmation_required/);
    await assert.rejects(f.controller.confirm({...basics,cash:{balance:-1,reserve:500,daily:20}},{confirmed:true}),/confirmed_operation_invalid/);
    assert.equal(f.sends,0);const result=await f.controller.confirm(basics,{confirmed:true});assert.equal(result.phase,'synced');assert.equal(result.revision,1);assert.equal(result.state.cash.balance,5000);assert.equal(f.sends,1);
    assert.equal(f.storage.get('buffer-zone.mini.state.v2'),'legacy-private-fixture');assert.ok(!JSON.stringify(f.notices).includes('fixture-a'));
  });
  test('offline confirmations stay queued and reconnect automatically retries the same confirmed operation',async()=>{
    const f=await fixture();await f.controller.login();f.setOffline(true);const result=await f.controller.confirm(basics,{confirmed:true});assert.equal(result.phase,'offline');assert.equal(result.pendingCount,1);
    const id=f.client.pendingOperations()[0].operationId;f.setOffline(false);await Promise.all([f.controller.refresh(),f.controller.refresh()]);assert.equal(f.controller.status().phase,'synced');assert.equal(f.controller.status().revision,1);assert.equal(f.sends,1);assert.ok(f.rows.get('fixture-a').state.cashReality.realitySnapshots[0].id.startsWith(id));
  });
  test('logout and account switch isolate financial view without deleting saved pending queue',async()=>{
    const f=await fixture();await f.controller.login();f.setOffline(true);await f.controller.confirm(basics,{confirmed:true});f.controller.logout();assert.equal(f.controller.status().state,null);
    await assert.rejects(f.controller.confirm(basics,{confirmed:true}),/authentication_required/);f.setOffline(false);f.setOwner('fixture-b');await f.controller.login();assert.equal(f.controller.status().state,null);assert.equal(f.controller.status().pendingCount,0);
    f.controller.logout();f.setOwner('fixture-a');await f.controller.login();assert.equal(f.controller.status().pendingCount,1);await f.controller.refresh();assert.equal(f.controller.status().state.cash.balance,5000);
  });
  test('migration requires validated preview and explicit confirmation; delete only reports cloud acknowledgement after flush',async()=>{
    const f=await fixture();await f.controller.login();const state={schemaVersion:9,cashReality:normalizeCashReality()};
    assert.throws(()=>f.controller.previewMigration({schemaVersion:99}),/migration_backup_invalid/);
    const preview=f.controller.previewMigration(state);assert.equal(f.sends,0);
    await assert.rejects(f.controller.confirmMigration(preview),/explicit_confirmation_required/);await f.controller.confirmMigration(preview,{confirmed:true});assert.equal(f.controller.status().revision,1);
    await assert.rejects(f.controller.deleteData(),/explicit_confirmation_required/);await f.controller.deleteData({confirmed:true});assert.equal(f.controller.status().phase,'synced');assert.equal(f.controller.status().deletionGeneration,1);assert.equal(f.controller.status().state,null);
  });
}
