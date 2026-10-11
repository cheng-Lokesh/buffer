const {createAccountSyncTransport}=require('../core/account-sync-transport');

// Constructed only by an authenticated account controller; does not start sync,
// read storage, or migrate the existing device's data as a hidden side effect.
function createMiniAccountSyncTransport(platform,session) {
  if(typeof platform?.request!=='function')throw Error('native_sync_adapter_required');
  return createAccountSyncTransport({
    envId:'buffer-d4gz06df3a59dea88',
    syncUrl:'https://buffer-d4gz06df3a59dea88-1373773247.ap-shanghai.app.tcloudbase.com/api/account/sync',
    session,
    request:input=>new Promise((resolve,reject)=>platform.request({url:input.url,
      method:input.method,header:input.headers,data:input.body,timeout:10000,
      success:result=>resolve({status:result.statusCode,body:result.data}),
      fail:()=>reject(Error('native_sync_request_failed'))}))
  });
}
module.exports={createMiniAccountSyncTransport};
