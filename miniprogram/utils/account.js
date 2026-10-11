const {createWechatAccountSession}=require('../core/wechat-account-session');

// Public endpoint identifiers only. No AppSecret, private key or service password.
function createMiniWechatAccountSession(platform) {
  if(typeof platform?.login!=='function'||typeof platform?.request!=='function')throw Error('native_account_adapter_required');
  return createWechatAccountSession({
    envId:'buffer-d4gz06df3a59dea88',
    loginUrl:'https://buffer-d4gz06df3a59dea88-1373773247.ap-shanghai.app.tcloudbase.com/api/auth/wechat',
    getWechatCode:()=>new Promise((resolve,reject)=>platform.login({timeout:10000,
      success:result=>resolve(result.code),fail:()=>reject(Error('native_login_failed'))})),
    request:input=>new Promise((resolve,reject)=>platform.request({url:input.url,
      method:input.method,header:input.headers,data:input.body,timeout:10000,
      success:result=>resolve({status:result.statusCode,body:result.data}),
      fail:()=>reject(Error('native_request_failed'))}))
  });
}
module.exports={createMiniWechatAccountSession};
