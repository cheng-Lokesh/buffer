/** End-user bearer verification. Decoded claims are only an early privilege
 * guard, never proof of signature. The official HTTPS profile must validate
 * every request. No password/service-session fallback or profile persistence. */
export function createCloudBaseUserAuth({envId,serviceUserId,fetchImpl=fetch,now=Date.now}={}) {
  const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
  if(typeof envId!=='string'||!/^[a-z0-9-]{1,64}$/.test(envId)||!id(serviceUserId)
    ||typeof fetchImpl!=='function'||typeof now!=='function')throw Error('user_auth_config_invalid');
  const url=`https://${envId}.api.tcloudbasegateway.com/auth/v1/user/me`;
  return async function authenticate(request) {
    try {
      const header=request.headers.get('authorization');
      if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header))return null;
      const accessToken=header.slice(7);
      if(accessToken.length>4096)return null;
      const claims=JSON.parse(Buffer.from(accessToken.split('.')[1],'base64url').toString('utf8'));
      if(claims?.aud!==envId||claims.role!=='authenticated'||!id(claims.sub)||claims.sub===serviceUserId
        ||!Number.isFinite(claims.exp)||claims.exp*1000<=now()
        ||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>now())))return null;
      const response=await fetchImpl(url,{method:'GET',headers:{authorization:header},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok||!response.body)return null;
      const reader=response.body.getReader();const chunks=[];let size=0;
      try {
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>16384)return null;chunks.push(Buffer.from(value));}
      } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      const profile=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(profile?.sub!==claims.sub||profile.username==='buffer-login-service'
        ||(profile.status!==undefined&&profile.status!=='ACTIVE')||claims.exp*1000<=now())return null;
      return {accountId:claims.sub,accessToken};
    } catch {return null;}
  };
}
