/** Server-only ordinary service identity. No administrator credential, browser
 * bundle, token persistence or automatic password fallback after revocation.
 * HTTPS profile validation and gateway signature validation are authoritative;
 * decoding JWT claims here is only an additional accidental-privilege guard. */
export function createCloudBaseServiceSession({envId,serviceUserId,username,password,fetchImpl=fetch,now=Date.now}={}) {
  if(typeof envId!=='string'||!/^[a-z0-9-]{1,64}$/.test(envId)
    ||typeof serviceUserId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(serviceUserId)
    ||username!=='buffer-login-service'||typeof password!=='string'||!password.length
    ||typeof fetchImpl!=='function'||typeof now!=='function') throw Error('service_session_config_invalid');
  const base=`https://${envId}.api.tcloudbasegateway.com/auth/v1`;
  let cached=null,pending=null,failed=false;
  async function request(path,body,accessToken) {
    const headers={'content-type':'application/json'};
    if(accessToken) headers.authorization=`Bearer ${accessToken}`;
    const response=await fetchImpl(base+path,{method:body?'POST':'GET',headers,
      ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok) throw Error('provider');
    const reader=response.body.getReader();let size=0;const chunks=[];
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>16384)throw Error('body');chunks.push(Buffer.from(value));}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function obtain() {
    try {
      const result=await request(cached?'/token':'/signin',cached
        ?{grant_type:'refresh_token',refresh_token:cached.refreshToken}:{username,password});
      const access=result.access_token;
      if(typeof access!=='string'||access.length>4096||access.split('.').length!==3
        ||typeof result.refresh_token!=='string'||!result.refresh_token.length||result.refresh_token.length>8192
        ||result.sub!==serviceUserId||!Number.isFinite(result.expires_in)||result.expires_in<=30)throw Error('session');
      const claims=JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString('utf8'));
      if(claims.role!=='authenticated'||claims.sub!==serviceUserId||claims.aud!==envId
        ||!Number.isFinite(claims.exp)||claims.exp*1000<=now()+30000)throw Error('claims');
      const profile=await request('/user/me',null,access);
      if(profile.sub!==serviceUserId||profile.username!==username)throw Error('identity');
      cached={accessToken:access,refreshToken:result.refresh_token,
        expiresAt:Math.min(claims.exp*1000,now()+result.expires_in*1000)};
      return access;
    } catch {cached=null;failed=true;throw Error('service_session_unavailable');}
  }
  return {async getAccessToken(){
    if(failed)throw Error('service_session_unavailable');
    if(cached&&cached.expiresAt>now()+30000)return cached.accessToken;
    if(!pending)pending=obtain().finally(()=>{pending=null;});
    return pending;
  }};
}
