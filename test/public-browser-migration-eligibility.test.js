import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canMigrateBackupToAccount} from '../src/browser-migration-eligibility.js';

test('only a confirmed empty synced account may receive an explicit backup migration',()=>{
  assert.equal(canMigrateBackupToAccount({phase:'synced',pendingCount:0,state:null,conflict:null}),true);
  assert.equal(canMigrateBackupToAccount({phase:'remote_deleted',pendingCount:0,state:null,conflict:null}),true);
  for(const value of [
    {phase:'synced',pendingCount:1,state:null,conflict:null},
    {phase:'pending',pendingCount:0,state:null,conflict:null},
    {phase:'offline',pendingCount:0,state:null,conflict:null},
    {phase:'conflict',pendingCount:1,state:null,conflict:{revision:2}},
    {phase:'synced',pendingCount:0,state:{cashReality:{conditions:[{}]}},conflict:null},
    {phase:'session_expired',pendingCount:0,state:null,conflict:null},
  ]) assert.equal(canMigrateBackupToAccount(value),false);
});

test('backup import captures scope before reading and checks it again before preview',()=>{
  const source=readFileSync(new URL('../site/app-entry.js',import.meta.url),'utf8');
  assert.match(source,/const restoreScope=accountEntry\.scope\(\);[\s\S]{0,180}await file\.text\(\)/);
  assert.match(source,/账号已切换，恢复已取消/);
  assert.match(source,/当前账号已有数据或待同步内容，不能直接恢复备份覆盖/);
});
