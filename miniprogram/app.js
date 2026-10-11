const {createMiniWechatAccountSession}=require('./utils/account');
const {createMiniAccountController}=require('./utils/account-controller');
let account=null,controller=null;
const currentAccount=()=>account||(account=createMiniWechatAccountSession(wx));
const currentController=()=>controller||(controller=createMiniAccountController(wx,currentAccount()));
const refreshAccount=()=>controller&&account.status().phase==='signed_in'?controller.refresh().catch(()=>controller.status()):Promise.resolve(null);
App({
  // Same development baseline as the web package; not a new release declaration.
  globalData: { productVersion: '0.35.0' },
  onLaunch(){if(typeof wx.onNetworkStatusChange==='function')wx.onNetworkStatusChange(value=>value.isConnected?refreshAccount():Promise.resolve(null));},
  onShow(){return refreshAccount();},
  accountStatus(){return account?account.status():{phase:'signed_out',accountId:null};},
  async loginWechat(){await currentController().login();return account.status();},
  accountSyncStatus(){return controller?controller.status():{authPhase:'signed_out',phase:'signed_out',state:null,pendingCount:0,revision:0,deletionGeneration:0,conflict:null};},
  refreshAccount(){return refreshAccount();},
  confirmAccountOperation(operation,options){return currentController().confirm(operation,options);},
  previewAccountMigration(backup){return currentController().previewMigration(backup);},
  confirmAccountMigration(preview,options){return currentController().confirmMigration(preview,options);},
  deleteAccountData(options){return currentController().deleteData(options);},
  acceptCloudAccountVersion(options){return currentController().acceptCloudVersion(options);},
  getAccountAccessToken(){return currentAccount().getAccessToken();},
  logoutAccount(){if(controller)controller.logout();else if(account)account.logout();}
});
