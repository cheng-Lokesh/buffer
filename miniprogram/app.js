const {createMiniWechatAccountSession}=require('./utils/account');
const {createMiniAccountController}=require('./utils/account-controller');
let account=null,controller=null,loginTask=null,viewGeneration=0;
const syncListeners=new Set();let lastSyncSignature='';
function notifyAccountSync(value){
  const signature=JSON.stringify([viewGeneration,value.phase,value.revision,value.deletionGeneration,value.pendingCount,value.conflict?.revision]);
  if(signature===lastSyncSignature)return;
  lastSyncSignature=signature;
  for(const listener of syncListeners){try{listener(value);}catch{}}
}
const currentAccount=()=>account||(account=createMiniWechatAccountSession(wx));
const currentController=()=>controller||(controller=createMiniAccountController(wx,currentAccount(),notifyAccountSync));
const refreshAccount=()=>controller&&account.status().phase==='signed_in'?controller.refresh().catch(()=>controller.status()):Promise.resolve(null);
App({
  // Same development baseline as the web package; not a new release declaration.
  globalData: { productVersion: '0.35.0' },
  onLaunch(){if(typeof wx.onNetworkStatusChange==='function')wx.onNetworkStatusChange(value=>value.isConnected?refreshAccount():Promise.resolve(null));},
  onShow(){return refreshAccount();},
  accountStatus(){return {...(account?account.status():{phase:'signed_out',accountId:null}),viewGeneration};},
  async loginWechat(){
    if(loginTask)return loginTask;
    viewGeneration++;
    const task=(async()=>{await currentController().login();return this.accountStatus();})();loginTask=task;
    try{return await task;}finally{if(loginTask===task)loginTask=null;}
  },
  accountSyncStatus(){return controller?controller.status():{authPhase:'signed_out',phase:'signed_out',state:null,pendingCount:0,revision:0,deletionGeneration:0,conflict:null};},
  subscribeAccountSync(listener){
    if(typeof listener!=='function')throw Error('sync_listener_required');
    syncListeners.add(listener);return ()=>syncListeners.delete(listener);
  },
  refreshAccount(){return refreshAccount();},
  confirmAccountOperation(operation,options){return currentController().confirm(operation,options);},
  previewAccountMigration(backup){return currentController().previewMigration(backup);},
  confirmAccountMigration(preview,options){return currentController().confirmMigration(preview,options);},
  deleteAccountData(options){return currentController().deleteData(options);},
  acceptCloudAccountVersion(options){return currentController().acceptCloudVersion(options);},
  getAccountAccessToken(){return currentAccount().getAccessToken();},
  logoutAccount(){viewGeneration++;loginTask=null;if(controller)controller.logout();else if(account)account.logout();}
});
