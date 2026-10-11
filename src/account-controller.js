import { applyConfirmedAccountOperation } from './account-confirmation.js';
import { preparePortableBackup } from './portable-backup.js';

// Shared orchestration, not a login bypass. Platform composition must supply the
// real verified session and account-scoped persistent sync client.
export function createAccountController({session,syncClient,onChange=()=>{},now=Date.now}={}) {
  if(['status','login','logout'].some(key=>typeof session?.[key]!=='function')
    ||['status','activateAccount','logout','refresh','flush','enqueueConfirmed','previewMigration','confirmMigration','acceptCloudVersion'].some(key=>typeof syncClient?.[key]!=='function')
    ||typeof onChange!=='function'||typeof now!=='function')throw Error('account_controller_config_invalid');
  let scope='',generation=0,loginTask=null,refreshTask=null;
  const active=()=>{const value=session.status();return scope&&value.phase==='signed_in'&&value.accountId===scope;};
  const status=()=>active()?{authPhase:session.status().phase,...syncClient.status()}:
    {authPhase:session.status().phase,phase:'signed_out',state:null,pendingCount:0,revision:0,deletionGeneration:0,conflict:null};
  const notify=()=>{const value=status();try{onChange(value);}catch{}return status();};
  const ensureActive=()=>{if(!active())throw Error('authentication_required');};
  function logout(){generation++;scope='';loginTask=null;refreshTask=null;syncClient.logout();session.logout();return notify();}
  async function login(){
    if(loginTask)return loginTask;
    const stamp=++generation;scope='';refreshTask=null;syncClient.logout();
    const task=(async()=>{
      await session.login();if(stamp!==generation)throw Error('account_action_cancelled');
      const value=session.status();
      if(value.phase!=='signed_in'||typeof value.accountId!=='string'||!value.accountId)throw Error('authentication_required');
      scope=value.accountId;await syncClient.activateAccount(scope);
      if(stamp!==generation)throw Error('account_action_cancelled');
      // Resume only this account's previously user-confirmed queue. This never
      // reads or migrates legacy device storage, and conflict state stays blocked.
      if(syncClient.status().phase==='pending'&&syncClient.status().pendingCount)await refresh();
      if(stamp!==generation)throw Error('account_action_cancelled');
      return notify();
    })();
    loginTask=task;try{return await task;}finally{if(loginTask===task)loginTask=null;}
  }
  async function refresh(){
    ensureActive();if(refreshTask)return refreshTask;
    const stamp=generation;
    const task=(async()=>{
      if(syncClient.status().pendingCount)await syncClient.flush();else await syncClient.refresh();
      // A confirmation can arrive while the read (including flush's final read)
      // is pending. Drain that trailing work without retrying offline failures
      // or allowing an old account's task to operate on a new account.
      while(stamp===generation&&active()&&syncClient.status().phase==='pending'&&syncClient.status().pendingCount){
        await syncClient.flush();
      }
      return stamp===generation?notify():status();
    })();
    refreshTask=task;try{return await task;}finally{if(refreshTask===task)refreshTask=null;}
  }
  async function confirm(operation,options){
    ensureActive();
    syncClient.enqueueConfirmed(operation,operationId=>applyConfirmedAccountOperation({
      state:syncClient.status().state,operation,operationId},{now}).state,options);
    notify();return refresh();
  }
  function previewMigration(backup){
    ensureActive();const prepared=preparePortableBackup(backup);
    if(!prepared.ok)throw Error('migration_backup_invalid');
    return syncClient.previewMigration(prepared.payload);
  }
  async function confirmMigration(preview,options){ensureActive();syncClient.confirmMigration(preview,options);notify();return refresh();}
  async function deleteData(options){ensureActive();syncClient.enqueueConfirmed({type:'delete_all'},null,options);notify();return refresh();}
  function acceptCloudVersion(options){ensureActive();syncClient.acceptCloudVersion(options);return notify();}
  return {status,login,logout,refresh,confirm,previewMigration,confirmMigration,deleteData,acceptCloudVersion};
}
