// Ticket acquisition must be a trusted, one-use server pairing adapter. This
// factory never accepts a nickname, client owner override, or existing local data.
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
export function createBrowserAccountSession({envId,getLoginTicket,request,now=Date.now}={}){
  if(!text(envId,64)||!/^[a-z0-9-]+$/.test(envId)||[getLoginTicket,request,now].some(fn=>typeof fn!=='function'))throw Error('browser_session_config_invalid');
  const base=`https://${envId}.api.tcloudbasegateway.com/auth/v1`;
  let generation=0,session=null,phase='signed_out',pendingLogin=null,pendingRefresh=null;
  const status=()=>({phase,accountId:session?.sub||null});
  const check=stamp=>{if(stamp!==generation)throw Error('session_cancelled');};
  async function send(stamp,path,body,access){
    check(stamp);
    const response=await request({url:base+path,method:body?'POST':'GET',headers:{'content-type':'application/json',...(access?{Authorization:`Bearer ${access}`}:{})},...(body?{body}:{})});
    check(stamp);
    if(response?.status!==200||!response.body||typeof response.body!=='object'||Array.isArray(response.body))throw Error('provider');
    return response.body;
  }
  async function validate(stamp,result,expectedSub){
    if(!text(expectedSub,128)||!text(result.sub,128)||result.sub!==expectedSub||!text(result.access_token,4096)||!text(result.refresh_token,8192)
      ||!Number.isFinite(result.expires_in)||result.expires_in<=30||result.expires_in>86400)throw Error('identity');
    const profile=await send(stamp,'/user/me',null,result.access_token);
    if(profile.sub!==expectedSub||profile.username==='buffer-login-service'||(profile.status!==undefined&&profile.status!=='ACTIVE'))throw Error('identity');
    check(stamp);session={sub:expectedSub,access:result.access_token,refresh:result.refresh_token,expiresAt:now()+result.expires_in*1000};phase='signed_in';
  }
  function logout(){generation++;session=null;phase='signed_out';pendingLogin=null;pendingRefresh=null;}
  async function establish(stamp){
    try{
      const approved=await getLoginTicket();check(stamp);
      if(!approved||!text(approved.ticket,16384)||!text(approved.accountId,128))throw Error('ticket');
      const result=await send(stamp,'/signin/custom',{provider_id:'custom',ticket:approved.ticket});
      await validate(stamp,result,approved.accountId);return status();
    }catch{check(stamp);session=null;phase='login_failed';throw Error('login_unavailable');}
  }
  async function login(){
    if(pendingLogin)return pendingLogin;if(session)return status();
    const stamp=++generation;phase='signing_in';const task=establish(stamp);pendingLogin=task;
    try{return await task;}finally{if(pendingLogin===task)pendingLogin=null;}
  }
  async function renew(stamp,old){
    try{const result=await send(stamp,'/token',{grant_type:'refresh_token',refresh_token:old.refresh});await validate(stamp,result,old.sub);return session.access;}
    catch{check(stamp);session=null;phase='session_expired';throw Error('session_expired');}
  }
  async function getAccessToken(){
    if(!session)throw Error('authentication_required');
    if(session.expiresAt>now()+30000)return session.access;
    if(pendingRefresh)return pendingRefresh;
    const task=renew(generation,session);pendingRefresh=task;
    try{return await task;}finally{if(pendingRefresh===task)pendingRefresh=null;}
  }
  return {status,login,logout,getAccessToken};
}
