const url='https://buffer-d4gz06df3a59dea88-1373773247.ap-shanghai.app.tcloudbase.com/api/auth/browser/approve';
async function approveMiniBrowserLogin(platform,app,code,options={}){
  const scope=options.scope;
  const unchanged=()=>{const now=app.accountStatus();return now.phase==='signed_in'&&now.accountId===scope?.accountId&&now.viewGeneration===scope?.viewGeneration;};
  try {
    if(options.confirmed!==true||scope?.phase!=='signed_in'||!scope.accountId||!unchanged()
      ||typeof code!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(code))throw Error();
    const wechatCode=await new Promise((resolve,reject)=>platform.login({timeout:10000,success:result=>resolve(result.code),fail:reject}));
    if(!unchanged()||typeof wechatCode!=='string'||!/^[A-Za-z0-9_-]{8,256}$/.test(wechatCode))throw Error();
    const token=await app.getAccountAccessToken();if(!unchanged())throw Error();
    const response=await new Promise((resolve,reject)=>platform.request({url,method:'POST',timeout:10000,
      header:{'content-type':'application/json',Authorization:`Bearer ${token}`},data:{code,wechatCode},success:resolve,fail:reject}));
    if(!unchanged()||response.statusCode!==200||response.data?.approved!==true)throw Error();
    return {approved:true};
  } catch {throw Error('browser_approval_rejected');}
}
module.exports={approveMiniBrowserLogin};
