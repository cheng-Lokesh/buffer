import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isCurrentAccountDialog, confirmAccountDialog} from '../src/account-dialog-lifetime.js';

test('closed or changed-account dialogs cannot confirm; failed persistence keeps the window open',async()=>{
  let current={accountId:'owner-a',generation:1},writes=0,closed=0;
  const layer={isConnected:true,accountScope:{...current},remove(){closed++;this.isConnected=false;}};
  assert.equal(isCurrentAccountDialog(layer,()=>current),true);
  current={accountId:'owner-b',generation:2};
  await assert.rejects(confirmAccountDialog(layer,()=>current,async()=>{writes++;}),/account_scope_changed/);
  assert.equal(writes,0);
  current={...layer.accountScope};
  await assert.rejects(confirmAccountDialog(layer,()=>current,async()=>{throw Error('storage_failed');}),/storage_failed/);
  assert.equal(closed,0);
  await confirmAccountDialog(layer,()=>current,async()=>{writes++;return true;});
  assert.equal(writes,1);assert.equal(closed,1);
  assert.equal(isCurrentAccountDialog(layer,()=>current),false);
});

test('in-flight save prevents duplicate clicks and does not close a replacement account window',async()=>{
  let release;let writes=0;
  const scope={accountId:'owner-a',generation:1};
  const layer={isConnected:true,accountScope:{...scope},remove(){this.isConnected=false;}};
  const first=confirmAccountDialog(layer,()=>scope,async()=>{writes++;await new Promise(resolve=>{release=resolve;});return true;});
  await assert.rejects(confirmAccountDialog(layer,()=>scope,async()=>{writes++;}),/confirmation_in_progress/);
  scope.generation=2;release();await first;
  assert.equal(writes,1);assert.equal(layer.isConnected,true);
});

test('actual capture entry guards delayed results and awaits scoped confirmation before closing',()=>{
  const source=readFileSync(new URL('../site/app-entry.js',import.meta.url),'utf8');
  assert.match(source,/await parser\.parse\(text, context\);\s*if \(!isCurrentAccountDialog\(layer, accountEntry\.scope\)\) return;/);
  assert.match(source,/confirmAccountDialog\(layer, accountEntry\.scope, \(\) => commitCandidates\(pending, 'natural_language', layer\)\)/);
});
