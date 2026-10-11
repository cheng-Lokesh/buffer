const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('actual history record button awaits own account queue and prevents duplicate taps',async()=>{
  const filename=require('node:path').resolve('miniprogram/pages/history/index.js'),nativeRequire=require('node:module').createRequire(filename);
  let definition,writes=0,toasts=0,release;
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Page:value=>definition=value,require:id=>id==='../../utils/account-store'?{recordV8Event:()=>{writes++;return new Promise(resolve=>release=()=>resolve({ok:true}));}}:id==='../../utils/store'?{recordV8Event:()=>{throw Error('legacy writer');}}:nativeRequire(id),wx:{showToast:()=>toasts++}});
  const page={...definition,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);},refresh(){}};
  const pending=page.saveRecord();assert.equal(writes,1);assert.equal(toasts,0);await page.saveRecord();assert.equal(writes,1);release();await pending;assert.equal(toasts,1);
  page.data.draft.amount='private amount';page.onAccountChange();assert.equal(page.data.draft.amount,'');
});
test('account skin preferences preserve all six options without rewriting legacy financial data',()=>{
  const {createMiniAccountStore}=require('../miniprogram/utils/account-store'),{SKINS}=require('../miniprogram/core/skins'),{emptyState}=require('../miniprogram/core/state');
  const values=new Map();let owner='fixture-a',legacyWrites=0;
  const app={accountStatus:()=>({phase:'signed_in',accountId:owner}),accountSyncStatus:()=>({phase:'synced',state:null})};
  const store=createMiniAccountStore({getApp:()=>app,local:{load:()=>emptyState(),setSkin:()=>legacyWrites++},preferences:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}});
  assert.equal(typeof store.setSkin,'function');for(const skin of SKINS){assert.equal(store.setSkin(skin.id).ok,true);assert.equal(store.load().skinId,skin.id);}
  assert.equal(legacyWrites,0);assert.equal(store.setSkin('unknown').ok,false);
  owner='fixture-b';assert.notEqual(store.load().skinId,SKINS.at(-1).id);owner='fixture-a';assert.equal(store.load().skinId,SKINS.at(-1).id);
});

test('history restore previews cloud scope and does not claim offline completion',async()=>{
  const filename=require('node:path').resolve('miniprogram/pages/history/index.js'),nativeRequire=require('node:module').createRequire(filename);
  const {buildPortableBackup}=require('../miniprogram/core/portable-backup'),{emptyState}=require('../miniprogram/core/state');
  let definition,modal,options,previews=0;const toasts=[];
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Page:value=>definition=value,getApp:()=>({accountStatus:()=>({phase:'signed_in',accountId:'fixture-a',viewGeneration:1})}),require:id=>id==='../../utils/account-store'?{
    previewRestore:()=>{previews++;return {ok:true,summary:{conditions:3,events:2}};},restoreState:async(value,args)=>{options=args;return {ok:true,completed:false,syncPhase:'offline',pendingCount:1};}
  }:nativeRequire(id),wx:{getClipboardData:args=>args.success({data:JSON.stringify(buildPortableBackup(emptyState()))}),showModal:args=>{modal=args;},showToast:args=>toasts.push(args.title)}});
  const page={...definition,data:structuredClone(definition.data),setData(){},refresh(){}};
  const pending=page.importBackup();assert.equal(previews,1);assert.match(modal.content,/账号/);assert.match(modal.content,/本机/);
  await modal.success({confirm:true});await pending;assert.equal(options.accountConfirmed,true);assert.equal(options.preview.ok,true);assert.ok(!toasts.includes('已恢复'));
});

test('history cloud deletion scopes consent and blocks account changes while modal is open',async()=>{
  const filename=require('node:path').resolve('miniprogram/pages/history/index.js'),nativeRequire=require('node:module').createRequire(filename);
  let definition,modal,generation=1,calls=0;const toasts=[];
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Page:value=>definition=value,getApp:()=>({accountStatus:()=>({phase:'signed_in',accountId:'fixture-a',viewGeneration:generation})}),require:id=>id==='../../utils/account-store'?{
    clear:async args=>{calls++;assert.equal(args.accountConfirmed,true);return {ok:true,completed:false,message:'删除等待同步'};}
  }:nativeRequire(id),wx:{showModal:args=>{modal=args;},showToast:args=>toasts.push(args.title)}});
  const page={...definition,data:structuredClone(definition.data),setData(){},refresh(){}};
  let pending=page.clearData();assert.match(modal.title,/账号/);await modal.success({confirm:true});await pending;assert.equal(calls,1);assert.ok(!toasts.includes('已清空'));
  pending=page.clearData();generation++;await modal.success({confirm:true});await pending;assert.equal(calls,1);
});
