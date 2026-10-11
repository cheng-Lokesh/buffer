const localStore=require('./store');
const {emptyState,normalizeState}=require('../core/state');
const {portableToMini,buildPortableBackup,preparePortableBackup}=require('../core/portable-backup');
const {SKINS}=require('../core/skins');

// Account mode never falls back to another storage scope when a cloud read fails.
// Existing device data stays accessible in explicit signed-out/local mode.
function createMiniAccountStore({local=localStore,getApp:appProvider,now=Date.now,preferences={getItem:key=>typeof wx==='undefined'?undefined:wx.getStorageSync(key),setItem:(key,value)=>wx.setStorageSync(key,value)}}={}){
  const app=()=>typeof appProvider==='function'?appProvider():null;
  const localMode=()=>!app()||['signed_out','login_failed'].includes(app().accountStatus().phase);
  const failure=message=>({ok:false,message,errors:{storage:message}});
  const blocked=()=>failure('请先重新登录；原数据未改动');
  const restorePreviews=new WeakMap();
  const currentScope=()=>{const status=app().accountStatus();return JSON.stringify([status.phase,status.accountId,status.viewGeneration]);};
  const skinKey=()=>{const owner=app()?.accountStatus().accountId;return typeof owner==='string'&&owner.length?`buffer-zone.account.skin.v1:${encodeURIComponent(owner)}`:null;};
  function preferredSkin(){try{const key=skinKey(),id=key?preferences.getItem(key):null;return SKINS.some(item=>item.id===id)?id:null;}catch{return null;}}
  function load(){
    if(localMode())return local.load();
    if(app().accountStatus().phase!=='signed_in')return {...emptyState(),storageError:true,storageMessage:'请重新登录查看账号数据'};
    const state=app().accountSyncStatus().state;
    try{const view=state?normalizeState(portableToMini(state)):emptyState();return {...view,skinId:preferredSkin()||view.skinId};}
    catch{return {...emptyState(),storageError:true,storageMessage:'账号数据无法读取，原数据未改动'};}
  }
  const number=value=>{if(value===''||value==null||(typeof value!=='number'&&typeof value!=='string'))throw Error();const result=Number(value);if(!Number.isFinite(result)||result<0||Math.round(result*100)/100!==result)throw Error();return result;};
  async function commit(action){
    if(app().accountStatus().phase!=='signed_in')return blocked();
    const owner=app().accountStatus().accountId;
    const viewGeneration=app().accountStatus().viewGeneration;
    try{
      const result=await app().confirmAccountOperation({type:'confirm_reality',confirmedAt:new Date(now()).toISOString(),...action},{confirmed:true});
      if(app().accountStatus().phase!=='signed_in'||app().accountStatus().accountId!==owner||app().accountStatus().viewGeneration!==viewGeneration||result.phase==='signed_out')return blocked();
      const state=load();if(state.storageError)return blocked();
      return {ok:true,state,summary:{balance:state.cash.balance},syncPhase:result.phase,pendingCount:result.pendingCount};
    }catch{return failure('这次确认未保存，请检查输入或重新登录后重试');}
  }
  async function recordCash(draft){
    if(localMode())return local.recordCash(draft);
    try{return await commit({action:'confirm_basics',cash:{balance:number(draft.balance),reserve:number(draft.reserve),daily:number(draft.daily)}});}
    catch{return failure('请填写完整的余额、保留金额和每日支出');}
  }
  async function captureReality(candidates,options){
    if(localMode())return local.captureReality(candidates,options);
    return commit({action:'capture',candidates,provenance:options?.provenance||'precise_edit'});
  }
  async function recordV8Event(draft){
    if(localMode())return local.recordV8Event(draft);
    try{
      if(!['income','expense','balance_confirmation'].includes(draft.type))throw Error();
      return await captureReality([{type:draft.type==='income'?'one_off_income':draft.type==='expense'?'one_off_expense':'balance_confirmation',amount:number(draft.amount),occurredAt:draft.occurredAt}],{provenance:'precise_edit'});
    }catch{return failure('请检查金额和日期');}
  }
  async function addV8CashCondition(input){
    if(localMode())return local.addV8CashCondition(input);
    try{
      let candidate;
      if(['recurring_income','recurring_expense'].includes(input.type)){
        candidate={type:input.type,name:input.name|| (input.type==='recurring_income'?'固定收入':'固定支出'),amount:number(input.amount),frequency:input.frequency,startDate:input.nextOccurrence,
          ...(input.type==='recurring_expense'?{includedInDailyFloor:input.includedInDailyFloor??false}:{})};
      }else if(input.type==='known_event'&&['income','expense'].includes(input.eventKind)){
        candidate={type:input.eventKind==='income'?'known_future_income':'known_future_expense',name:input.name|| (input.eventKind==='income'?'未来收入':'未来支出'),amount:number(input.amount),occurredAt:input.nextOccurrence};
      }else throw Error();
      return await captureReality([candidate],{provenance:'precise_edit'});
    }catch{return failure('请检查条件类型、金额和日期');}
  }
  async function setV8Condition(conditionId,patch){
    return localMode()?local.setV8Condition(conditionId,patch):commit({action:'edit_condition',conditionId,patch});
  }
  async function saveV8Scenario(patch){
    return localMode()?local.saveV8Scenario(patch):commit({action:'save_scenario',patch});
  }
  function exportText(){
    if(localMode())return local.exportText();
    if(app().accountStatus().phase!=='signed_in')return null;
    try{
      const state=app().accountSyncStatus().state;
      // An empty account has an honest empty backup, never the legacy device data.
      return JSON.stringify(buildPortableBackup(state||emptyState(),new Date(now()).toISOString()));
    }catch{return null;}
  }
  function setSkin(id){
    if(localMode())return local.setSkin(id);
    if(app().accountStatus().phase!=='signed_in'||!SKINS.some(item=>item.id===id))return failure('皮肤未能保存');
    try{const key=skinKey();if(!key)throw Error();preferences.setItem(key,id);return {ok:true,state:load()};}
    catch{return failure('皮肤未能保存，原数据未改动');}
  }
  function previewRestore(value){
    if(localMode()||app().accountStatus().phase!=='signed_in')return blocked();
    try{
      const prepared=preparePortableBackup(value.version===3?buildPortableBackup(value):value);
      if(!prepared.ok)return failure(prepared.message);
      const migration=app().previewAccountMigration(prepared.payload);
      const preview={ok:true,summary:prepared.summary};
      // Keep identity and the full payload private; the UI only receives counts.
      restorePreviews.set(preview,{scope:currentScope(),fingerprint:JSON.stringify(value),migration});
      return preview;
    }catch{return failure('备份无法预览，原数据未改动');}
  }
  async function restoreState(value,options){
    if(localMode())return local.restoreState(value,options);
    const preview=options?.preview,record=preview&&restorePreviews.get(preview);
    if(options?.confirmed!==true||options?.accountConfirmed!==true||!record)return failure('账号备份需要先预览并确认上传范围，原数据未改动');
    try{
      if(record.scope!==currentScope()||app().accountStatus().phase!=='signed_in'||record.fingerprint!==JSON.stringify(value))return blocked();
      restorePreviews.delete(preview);
      const result=await app().confirmAccountMigration(record.migration,{confirmed:true});
      if(record.scope!==currentScope()||result.phase==='signed_out')return blocked();
      return {ok:true,state:load(),syncPhase:result.phase,pendingCount:result.pendingCount,completed:result.phase==='synced'&&result.pendingCount===0};
    }catch{return failure('账号恢复未完成，请检查同步状态；原本机数据未改动');}
  }
  async function clear(options){
    if(localMode())return local.clear(options);
    if(options?.confirmed!==true||options?.accountConfirmed!==true)return failure('请使用账号数据删除确认，原数据未改动');
    if(app().accountStatus().phase!=='signed_in')return blocked();
    const scope=currentScope();
    try{
      const result=await app().deleteAccountData({confirmed:true});
      if(scope!==currentScope()||result.phase==='signed_out')return blocked();
      const completed=result.phase==='synced'&&result.pendingCount===0&&result.state===null;
      return {ok:true,completed,syncPhase:result.phase,pendingCount:result.pendingCount,message:completed?'账号数据已删除':'删除尚未完成，请检查同步状态'};
    }catch{return failure('删除未完成，请检查同步状态；原本机数据未改动');}
  }
  return {load,recordCash,captureReality,recordV8Event,addV8CashCondition,setV8Condition,saveV8Scenario,exportText,previewRestore,restoreState,clear,setSkin};
}
let pageStore;
const currentPageStore=()=>pageStore||(pageStore=createMiniAccountStore({getApp:()=>typeof getApp==='function'?getApp():null}));
module.exports={createMiniAccountStore,...Object.fromEntries(['load','recordCash','captureReality','recordV8Event','addV8CashCondition','setV8Condition','saveV8Scenario','exportText','previewRestore','restoreState','clear','setSkin'].map(name=>[name,(...args)=>currentPageStore()[name](...args)]))};
