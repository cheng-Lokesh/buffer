const {createMiniWechatAccountSession}=require('./utils/account');
let account=null;
const currentAccount=()=>account||(account=createMiniWechatAccountSession(wx));
App({
  // Same development baseline as the web package; not a new release declaration.
  globalData: { productVersion: '0.35.0' },
  accountStatus(){return account?account.status():{phase:'signed_out',accountId:null};},
  loginWechat(){return currentAccount().login();},
  getAccountAccessToken(){return currentAccount().getAccessToken();},
  logoutAccount(){if(account)account.logout();}
});
