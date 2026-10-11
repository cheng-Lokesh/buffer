import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('current site mounts the account entry and routes all confirmed writes through the scoped account path',()=>{
  const source=readFileSync(new URL('../site/app-entry.js',import.meta.url),'utf8');
  assert.match(source,/mountSiteAccountEntry/,'actual site has no account entry');
  for(const action of ['confirm_basics','edit_condition','capture','save_scenario'])assert.ok(source.includes(`confirmAccount('${action}'`),`${action} not bound to account confirmation`);
  assert.match(source,/accountEntry\.previewMigration/);assert.match(source,/accountEntry\.confirmMigration/);
  assert.match(source,/accountEntry\.status\(\)\.auth\.phase/);
  const html=readFileSync(new URL('../site/index.src.html',import.meta.url),'utf8');assert.match(html,/data-account-entry/);
});
test('account entry cannot grow into a sidebar panel and has a compact mobile slot',()=>{
  const html=readFileSync(new URL('../site/index.src.html',import.meta.url),'utf8');
  assert.match(html,/\.site-account-button\s*\{[^}]*flex:0 0 auto/);
  assert.match(html,/\.site-account-button\s*\{[^}]*height:44px/);
  assert.match(html,/\.site-account-button\s*\{[^}]*margin:0;[^}]*width:84px/);
});
