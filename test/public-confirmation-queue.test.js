import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAccountSyncService} from '../server/account-sync-service.js';
import {applyConfirmedAccountOperation} from '../src/account-confirmation.js';
const require=createRequire(import.meta.url);
for (const platform of ['web','mini']) test(`${platform}: optimistic state and server replay share IDs across dependent queued confirmations`,async()=>{
  const {createAccountSyncClient}=platform==='web'?await import('../src/account-sync-client.js'):require('../miniprogram/core/account-sync-client.js');
  let row=null,index=0,offline=false;const receipts=new Map(),storage=new Map();
  const confirmedAt='2026-10-11T02:00:00.000Z',options={now:()=>Date.parse(confirmedAt)};
  const apply=input=>applyConfirmedAccountOperation(input,options);
  const service=createAccountSyncService({authenticate:async()=>({accountId:'fixture'}),applyConfirmedOperation:apply,repository:{transaction:async(_,fn)=>fn({read:async()=>row,getReceipt:async(_,id)=>receipts.get(id),write:async value=>{row=value;},putReceipt:async(_,id,value)=>{receipts.set(id,value);}})}});
  const transport=async(method,command)=>{
    if(offline)throw Error('offline');
    const response=await service(new Request('https://fixture.invalid',{method,...(command?{body:JSON.stringify(command)}:{})}));
    return {status:response.status,body:await response.json()};
  };
  const client=createAccountSyncClient({storage:{getItem:key=>storage.get(key),setItem:(key,text)=>storage.set(key,text)},transport:{read:()=>transport('GET'),write:command=>transport('POST',command)},createOperationId:()=>`fixture-confirmation-queue-${++index}`});
  await client.activateAccount('fixture');offline=true;
  const enqueue=operation=>client.enqueueConfirmed(operation,operationId=>apply({state:client.status().state,operation,operationId}).state,{confirmed:true});
  enqueue({type:'confirm_reality',action:'confirm_basics',confirmedAt,cash:{balance:5000,reserve:500,daily:20}});
  enqueue({type:'confirm_reality',action:'capture',confirmedAt,provenance:'precise_edit',candidates:[{type:'recurring_income',name:'工资',amount:3000,frequency:'monthly',startDate:'2026-10-15'}]});
  const conditionId=client.status().state.cashReality.conditions.find(item=>item.type==='recurring_income').id;
  enqueue({type:'confirm_reality',action:'edit_condition',confirmedAt,conditionId,patch:{amount:3200}});
  const optimistic=client.status().state;await client.flush();assert.equal(client.status().pendingCount,3);
  offline=false;await client.flush();assert.equal(client.status().phase,'synced');assert.equal(client.status().revision,3);assert.deepEqual(row.state,optimistic);
  const before=client.status();assert.throws(()=>client.enqueueConfirmed({type:'confirm_reality'},()=>{throw Error('invalid fixture');},{confirmed:true}),/invalid fixture/);assert.deepEqual(client.status(),before);
});
