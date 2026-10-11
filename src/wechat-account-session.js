// Shared session lifecycle; credentials stay in memory, never in product backups.
const text = (value,max) => typeof value === 'string' && value.length > 0 && value.length <= max;
export function createWechatAccountSession({envId,loginUrl,getWechatCode,request,now=Date.now}={}) {
  if(!text(envId,64)||! /^[a-z0-9-]+$/.test(envId)
    || typeof loginUrl!=='string'
    || !new RegExp(`^https://${envId}(?:-[0-9]+)?\\.ap-shanghai\\.app\\.tcloudbase\\.com/api/auth/wechat$`).test(loginUrl)
    ||[getWechatCode,request,now].some(value=>typeof value!=='function')) throw Error('account_session_config_invalid');
  const base=`https://${envId}.api.tcloudbasegateway.com/auth/v1`;
  let generation=0,session=null,phase='signed_out',pendingLogin=null,pendingRefresh=null;
  const status=()=>({phase,accountId:session?.sub||null});
  const check=stamp=>{if(stamp!==generation)throw Error('session_cancelled');};
  async function send(stamp,url,body,access) {
    check(stamp);
    const result=await request({url,method:body?'POST':'GET',
      headers:{'content-type':'application/json',...(access?{Authorization:`Bearer ${access}`}:{})},
      ...(body?{body}:{})});
    check(stamp);
    if(result?.status!==200||!result.body||typeof result.body!=='object')throw Error('provider');
    return result.body;
  }
  async function validate(stamp,result,expectedSub) {
    if(!text(result.sub,128)||!text(result.access_token,4096)||!text(result.refresh_token,8192)
      ||!Number.isFinite(result.expires_in)||result.expires_in<=30||result.expires_in>86400
      ||(expectedSub&&result.sub!==expectedSub))throw Error('session');
    const profile=await send(stamp,base+'/user/me',null,result.access_token);
    if(profile.sub!==result.sub||profile.username==='buffer-login-service')throw Error('identity');
    check(stamp);
    session={sub:result.sub,access:result.access_token,refresh:result.refresh_token,expiresAt:now()+result.expires_in*1000};
    phase='signed_in';
  }
  function logout(){generation++;session=null;pendingLogin=null;pendingRefresh=null;phase='signed_out';}
  async function establish(stamp) {
    try {
      const code=await getWechatCode();check(stamp);
      if(!text(code,256)||! /^[A-Za-z0-9_-]{8,256}$/.test(code))throw Error('code');
      const ticket=await send(stamp,loginUrl,{code});
      if(!text(ticket.ticket,16384))throw Error('ticket');
      const result=await send(stamp,base+'/signin/custom',{provider_id:'custom',ticket:ticket.ticket});
      await validate(stamp,result);return status();
    } catch {
      check(stamp);session=null;phase='login_failed';throw Error('login_unavailable');
    }
  }
  async function login() {
    if(pendingLogin)return pendingLogin;
    if(session)return status();
    const stamp=++generation;phase='signing_in';
    const task=establish(stamp);pendingLogin=task;
    try{return await task;}finally{if(pendingLogin===task)pendingLogin=null;}
  }
  async function renew(stamp,old) {
    try {
      const result=await send(stamp,base+'/token',{grant_type:'refresh_token',refresh_token:old.refresh});
      await validate(stamp,result,old.sub);return session.access;
    }catch{check(stamp);session=null;phase='session_expired';throw Error('session_expired');}
  }
  async function getAccessToken() {
    if(!session)throw Error('authentication_required');
    if(session.expiresAt>now()+30000)return session.access;
    if(pendingRefresh)return pendingRefresh;
    const task=renew(generation,session);pendingRefresh=task;
    try{return await task;}finally{if(pendingRefresh===task)pendingRefresh=null;}
  }
  return {login,logout,status,getAccessToken};
}
