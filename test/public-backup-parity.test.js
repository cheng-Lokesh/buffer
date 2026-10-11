import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {applyConfirmedAccountOperation} from '../src/account-confirmation.js';
import {prepareBackupPreview} from '../src/backup-restore.js';
const require=createRequire(import.meta.url);
const transfer=require('../miniprogram/core/transfer.js');
const native=require('../miniprogram/core/state.js');
const shared=await import('../src/portable-backup.js').catch(()=>null);
const stamp='2026-10-11T02:00:00.000Z';
function fixture() {
  const state=applyConfirmedAccountOperation({state:null,operationId:'fixture-backup-operation',operation:{type:'confirm_reality',action:'confirm_basics',confirmedAt:stamp,cash:{balance:5000,reserve:500,daily:20}}},{now:()=>Date.parse(stamp)}).state;
  return {...state,cash:{...state.cash,monthly:2000},records:[{id:'old-record',date:'2026-09-10',cashDelta:-20,note:'旧记录'}],legacyArchive:{version:1,payload:{projects:[{name:'旧备份'}]}},visualSkinId:'pixel-garden'};
}
test('web to native to web preserves facts, historical snapshots and non-rendered original data',()=>{
  assert.ok(shared,'portable backup adapter missing');
  const source=fixture(),before=structuredClone(source);
  const parsed=transfer.importBackup({...source,exportedAt:stamp});assert.equal(parsed.ok,true);
  const saved=native.normalizeState(parsed.state);
  assert.equal(saved.changes.length,1,'normalized legacy record must survive local save');
  const backup=transfer.createBackup(saved,stamp);
  const result=shared.preparePortableBackup(backup);assert.equal(result.ok,true);
  for(const key of ['cashReality','records','legacyArchive'])assert.deepEqual(result.payload[key],source[key]);
  assert.equal(result.payload.cash.monthly,2000);assert.equal(result.payload.visualSkinId,'pixel-garden');assert.deepEqual(source,before);
  const preview=prepareBackupPreview(backup);assert.equal(preview.ok,true);assert.deepEqual(preview.payload.cashReality,source.cashReality);
});
test('native edits update common facts while carrying original web history through re-export',()=>{
  assert.ok(shared);const source=fixture(),parsed=transfer.importBackup(source);
  const updated=native.applyCashChange(parsed.state,{balance:4000,reserve:500,daily:25,note:'已确认'},stamp,'fixture-native-change').state;
  const result=shared.preparePortableBackup(transfer.createBackup(updated,stamp));assert.equal(result.ok,true);
  assert.equal(result.payload.cash.balance,4000);assert.equal(result.payload.cash.daily,25);assert.deepEqual(result.payload.records,source.records);
  assert.deepEqual(result.payload.legacyArchive.payload.projects,source.legacyArchive.payload.projects);
  const roundtrip=transfer.importBackup(result.payload);assert.equal(roundtrip.ok,true);assert.deepEqual(roundtrip.state.changes,updated.changes);
});
test('old native backup is importable on web without inventing transactions or losing original change history',()=>{
  assert.ok(shared);const state=native.applyCashChange(native.emptyState(),{balance:2000,reserve:100,daily:20,note:'旧确认'},stamp,'fixture-old-change').state;
  const result=shared.preparePortableBackup({kind:'buffer-zone-mini-backup',schemaVersion:1,exportedAt:stamp,state});assert.equal(result.ok,true);
  assert.equal(result.payload.cash.balance,2000);assert.deepEqual(result.payload.legacyArchive.payload.miniHistory.changes,state.changes);
  assert.equal(result.payload.cashReality.events.length,0);
  const roundtrip=transfer.importBackup(result.payload);assert.deepEqual(roundtrip.state.changes,state.changes);
});
test('malformed, future, oversized and unconfirmed backups are rejected as a whole',()=>{
  assert.ok(shared);const source=fixture(),before=structuredClone(source);
  const invalids=[{...source,schemaVersion:10},{...source,records:'bad'},{...source,access_token:'forbidden'},
    {...source,cashReality:{...source.cashReality,events:[{id:'bad',type:'expense',amount:null,source:'model'}]}},
    {...source,cashReality:{...source.cashReality,conditions:[...source.cashReality.conditions,source.cashReality.conditions[0]]}},
    {kind:'buffer-zone-mini-backup',schemaVersion:1,state:{...native.emptyState(),version:99}},
    {kind:'buffer-zone-mini-backup',schemaVersion:1,state:{...native.emptyState(),changes:[{id:'broken'}]}}];
  for(const value of invalids){assert.equal(shared.preparePortableBackup(value).ok,false);assert.equal(transfer.importBackup(value).ok,false);}
  assert.equal(shared.preparePortableBackup(source,{fileSize:10*1024*1024+1}).ok,false);assert.deepEqual(source,before);
});
test('a current web backup with only confirmed Reality needs no obsolete cash mirror to import',()=>{
  assert.ok(shared);const source=fixture();delete source.cash;
  const result=transfer.importBackup(source);assert.equal(result.ok,true);assert.equal(result.state.cash.balance,5000);assert.equal(result.state.cash.daily,20);
  assert.equal(shared.preparePortableBackup(null).ok,false);
  assert.equal(shared.preparePortableBackup([]).ok,false);
});
test('object-shaped archived context remains portable without reviving old user interfaces',()=>{
  assert.ok(shared);const source={...fixture(),actionThreads:{version:1,threads:[]},phaseState:{phase:'old'},longitudinalEvidence:{usageDays:[],incidents:[]},v5Experience:{interactionMoments:[]}};
  const parsed=transfer.importBackup(source);assert.equal(parsed.ok,true);
  const result=shared.preparePortableBackup(transfer.createBackup(parsed.state,stamp));assert.equal(result.ok,true);
  for(const key of ['actionThreads','phaseState','longitudinalEvidence','v5Experience'])assert.deepEqual(result.payload[key],source[key]);
});
test('both shared adapters handle legacy cash, unknown values, multibyte text and strict format bounds',()=>{
  const miniShared=require('../miniprogram/core/portable-backup.js');
  for(const adapter of [shared,miniShared]) {
    const legacy={version:1,cash:{balance:'2000',reserve:'0',daily:'20'},confirmedAt:stamp,changes:[],skinId:'felt-islands'};
    const built=adapter.buildPortableBackup(legacy,stamp);
    assert.equal(built.cash.balance,2000);assert.equal(built.cashReality.conditions.length,3);assert.equal(built.exportedAt,stamp);
    const prepared=adapter.preparePortableBackup({kind:'buffer-zone-mini-backup',schemaVersion:1,state:legacy});assert.equal(prepared.ok,true);
    const nativeView=adapter.portableToMini(prepared.payload);assert.equal(nativeView.cash.daily,20);assert.equal(nativeView.skinId,'felt-islands');
    const empty=adapter.buildPortableBackup({version:2,cash:{balance:'',reserve:'',daily:''},changes:[]});assert.equal(empty.cashReality.conditions.length,0);
    const oldWeb=adapter.preparePortableBackup({schemaVersion:1,cash:{balance:100,reserve:0,daily:10},cashflowConfirmation:{confirmedAt:stamp},records:[]});assert.equal(oldWeb.ok,true);
    assert.equal(adapter.buildPortableBackup({...fixture(),candidates:[{type:'unknown'}]},stamp).schemaVersion,9);
    const textFixture={...fixture(),legacyArchive:{version:1,payload:{note:'é星🌌'}}};assert.equal(adapter.preparePortableBackup(textFixture).ok,true);
    const invalids=[{...fixture(),schemaVersion:0},{...fixture(),cash:null},{...fixture(),cashReality:{...fixture().cashReality,events:{bad:true}}},
      {kind:'buffer-zone-mini-backup',schemaVersion:2,state:legacy},{kind:'buffer-zone-mini-backup',schemaVersion:1,state:legacy,token:'no'},
      {kind:'buffer-zone-mini-backup',schemaVersion:1,state:{...legacy,confirmedAt:'bad'}},
      {kind:'buffer-zone-mini-backup',schemaVersion:1,state:{...legacy,cash:{balance:-1,reserve:0,daily:20}}},
      {kind:'buffer-zone-mini-backup',schemaVersion:1,state:{...legacy,changes:[{id:'bad',occurredAt:stamp}]}},
      {kind:'buffer-zone-mini-backup',schemaVersion:1,state:{...legacy,changes:[{id:'bad',occurredAt:'invalid',after:legacy.cash}]}},
      {kind:'buffer-zone-mini-backup',schemaVersion:1,state:{...legacy,cash:{balance:1.234,reserve:0,daily:20}}},
      {...fixture(),legacyArchive:{version:1,payload:{note:'星'.repeat(3500000)}}}];
    for(const [index,input] of invalids.entries())assert.equal(adapter.preparePortableBackup(input).ok,false,`invalid fixture ${index}`);
    const original=native.applyCashChange(native.emptyState(),{balance:2000,reserve:100,daily:20},stamp,'fixture-native-before').state;
    const roundtrip=adapter.portableToMini(adapter.preparePortableBackup({kind:'buffer-zone-mini-backup',schemaVersion:1,state:original}).payload);
    assert.deepEqual(roundtrip.changes,original.changes);
  }
});
