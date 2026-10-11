import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserConflictActions} from '../src/browser-conflict-actions.js';

const setup=()=>{
  let scope={accountId:'user-a',generation:2},sync={phase:'conflict',pendingCount:1,revision:4,state:{cashReality:{conditions:[{}],events:[]}},conflict:{revision:5,deletionGeneration:0,state:{cashReality:{conditions:[{},{}],events:[{}]}}}};
  const calls=[];
  const actions=createBrowserConflictActions({getScope:()=>scope,getSync:()=>sync,downloadBackup:()=>calls.push('backup'),confirm:()=>{calls.push('confirm');return true;},accept:options=>calls.push(options)});
  return {actions,calls,scope:()=>scope,sync:()=>sync,setScope:value=>{scope=value;},setSync:value=>{sync=value;}};
};

test('cloud version cannot be adopted before the local pending backup is downloaded',async()=>{
  const {actions,calls}=setup();
  await assert.rejects(actions.adoptCloud(),/backup_required/);
  assert.deepEqual(calls,[]);
  actions.downloadLocalBackup();
  await actions.adoptCloud();
  assert.equal(calls[0],'backup');assert.equal(calls[1],'confirm');
  assert.deepEqual(calls[2],{confirmed:true,discardPending:true,scope:{accountId:'user-a',generation:2}});
});

test('changed account, conflict version, or a second click cannot discard pending work',async()=>{
  const {actions,calls,setScope,setSync}=setup();
  actions.downloadLocalBackup();setScope({accountId:'user-b',generation:3});
  await assert.rejects(actions.adoptCloud(),/scope_changed/);assert.deepEqual(calls,['backup']);
  setScope({accountId:'user-a',generation:2});actions.downloadLocalBackup();
  setSync({...setup().sync(),conflict:{revision:6,deletionGeneration:0,state:{cashReality:{conditions:[],events:[]}}}});
  await assert.rejects(actions.adoptCloud(),/conflict_changed/);assert.deepEqual(calls,['backup','backup']);
});

test('declining confirmation keeps the backup but does not discard cloud conflict data',async()=>{
  let accepted=0,downloaded=0;
  const actions=createBrowserConflictActions({getScope:()=>({accountId:'user-a',generation:1}),getSync:()=>({phase:'conflict',pendingCount:2,revision:3,conflict:{revision:4,deletionGeneration:0,state:{}}}),downloadBackup:()=>downloaded++,confirm:()=>false,accept:()=>accepted++});
  actions.downloadLocalBackup();await assert.equal(actions.adoptCloud(),false);assert.equal(downloaded,1);assert.equal(accepted,0);
});

test('site presents both conflict versions and requires the backup action',async()=>{
  const fs=await import('node:fs');const source=fs.readFileSync(new URL('../site/account-entry.js',import.meta.url),'utf8');
  assert.match(source,/核对本机与云端版本/);assert.match(source,/下载本机待同步备份/);assert.match(source,/使用云端版本/);
});
