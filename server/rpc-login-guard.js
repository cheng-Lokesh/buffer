import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';

/** Server-only. getAccessToken must obtain the dedicated service user's session.
 * Local token checks reject accidental admin credentials; the CloudBase gateway
 * MUST verify the signature, and SQL MUST independently enforce the configured
 * service identity. No service_role key, generic SQL or direct table API here. */
export function createRpcLoginGuard({envId,serviceUserId,scope,hashSecret,getAccessToken,fetchImpl=fetch}={}) {
  if(typeof envId!=='string' || !/^[a-z0-9-]{1,64}$/.test(envId)
    || typeof serviceUserId!=='string' || !/^[A-Za-z0-9_-]{1,64}$/.test(serviceUserId)
    || typeof scope!=='string' || !/^[a-z0-9_-]{1,64}$/.test(scope)
    || typeof hashSecret!=='string' || hashSecret.length<32
    || typeof getAccessToken!=='function' || typeof fetchImpl!=='function') throw new Error('login_guard_config_invalid');
  async function rpc(name,params) {
    try {
      const token=await getAccessToken();
      if(typeof token!=='string' || token.length>4096 || token.split('.').length!==3) throw new Error('token');
      const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
      if(claims.role!=='authenticated' || claims.sub!==serviceUserId || claims.aud!==envId
        || !Number.isFinite(claims.exp) || claims.exp<=Date.now()/1000) throw new Error('token');
      const response=await fetchImpl(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${name}`,{
        method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify(params),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(3000),
      });
      if(!response.ok) throw new Error('rpc');
      const body=await response.text();
      if(body.length>4096) throw new Error('body');
      const allowed=JSON.parse(body);
      if(typeof allowed!=='boolean') throw new Error('result');
      return allowed;
    } catch {throw new Error('login_guard_unavailable');}
  }
  return {
    async admit(context) {
      if(typeof context?.remoteAddress!=='string' || !isIP(context.remoteAddress)) return false;
      return rpc('buffer_login_admit',{p_scope:scope,p_identity:createHmac('sha256',hashSecret).update(context.remoteAddress).digest('hex')});
    },
    async consumeCode(digest) {
      if(typeof digest!=='string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('login_code_hash_invalid');
      return rpc('buffer_login_consume',{p_scope:scope,p_digest:digest});
    },
  };
}
