import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
for(const platform of ['web','mini'])test(`${platform}: oversized confirmations and migration fail before cache writes`,async()=>{
  const {createAccountSyncClient}=platform==='web'?await import('../src/account-sync-client.js'):require('../miniprogram/core/account-sync-client.js');
  const writes=[];let count=0;
  const client=createAccountSyncClient({storage:{getItem:()=>null,setItem:(...args)=>writes.push(args)},transport:{read:async()=>({status:200,body:{protocolVersion:1,schemaVersion:9,revision:0,deletionGeneration:0,state:null}}),write:async()=>{throw Error('not expected');}},createOperationId:()=>`fixture-size-command-${++count}`});
  await client.activateAccount('fixture');const before=client.status(),writeCount=writes.length;
  assert.throws(()=>client.enqueueConfirmed({type:'confirm_reality',note:'汉'.repeat(11000)},{schemaVersion:9},{confirmed:true}),/sync_command_too_large/);
  assert.deepEqual(client.status(),before);assert.equal(writes.length,writeCount);assert.deepEqual(client.pendingOperations(),[]);
  const preview=client.previewMigration({schemaVersion:9,note:'😀'.repeat(8300)});
  assert.throws(()=>client.confirmMigration(preview,{confirmed:true}),/sync_command_too_large/);
  assert.deepEqual(client.status(),before);assert.equal(writes.length,writeCount);
  client.enqueueConfirmed({type:'confirm_reality',note:'汉'.repeat(100)},{schemaVersion:9},{confirmed:true});assert.equal(client.status().pendingCount,1);
});
