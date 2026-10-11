const localStore=require('./store');
const {emptyState,normalizeState}=require('../core/state');
const {portableToMini}=require('../core/portable-backup');

// Account mode never falls back to another storage scope when a cloud read fails.
// Existing device data stays accessible in explicit signed-out/local mode.
function createMiniAccountStore({local=localStore,getApp:appProvider,now=Date.now}={}){
  const app=()=>typeof appProvider==='function'?appProvider():null;
  const localMode=()=>!app()||['signed_out','login_failed'].includes(app().accountStatus().phase);
  const failure=message=>({ok:false,message,errors:{storage:message}});
  const blocked=()=>failure('请先重新登录；原数据未改动');
  function load(){
    if(localMode())return local.load();
    if(app().accountStatus().phase!=='signed_in')return {...emptyState(),storageError:true,storageMessage:'请重新登录查看账号数据'};
    const state=app().accountSyncStatus().state;
    try{return state?normalizeState(portableToMini(state)):emptyState();}
    catch{return {...emptyState(),storageError:true,storageMessage:'账号数据无法读取，原数据未改动'};}
  }
  const number=value=>{if(value===''||value==null||(typeof value!=='number'&&typeof value!=='string'))throw Error();const result=Number(value);if(!Number.isFinite(result)||result<0||Math.round(result*100)/100!==result)throw Error();return result;};
  async function commit(action){
    if(app().accountStatus().phase!=='signed_in')return blocked();
    try{
      const result=await app().confirmAccountOperation({type:'confirm_reality',confirmedAt:new Date(now()).toISOString(),...action},{confirmed:true});
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
  // Old dialogs only mention local replacement/deletion; they are not consent
  // for account-wide changes. Dedicated cloud previews/prompts must call App APIs.
  async function restoreState(value,options){return localMode()?local.restoreState(value,options):failure('账号备份需要先预览并确认上传范围，原数据未改动');}
  async function clear(){return localMode()?local.clear():failure('请使用账号数据删除确认，原数据未改动');}
  return {load,recordCash,captureReality,recordV8Event,restoreState,clear};
}
module.exports={createMiniAccountStore};
