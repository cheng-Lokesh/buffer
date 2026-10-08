import {createHmac} from 'node:crypto';
import {createCloudBaseServiceSession} from './cloudbase-service-session.js';
import {createWechatLoginRuntime} from './wechat-login-runtime.js';
import {createWechatLoginHttpServer} from './wechat-login-http.js';

/** Private server configuration only. This factory does not read user data,
 * financial tables, ambient administrator keys or browser-selected identities. */
export async function createCloudBaseLoginServer({config,fetchImpl=fetch}={}) {
  try {
    const {envId,appId,appSecret,credentials,serviceUserId,password,allowedOrigin,keyPolicy}=config;
    const session=createCloudBaseServiceSession({envId,serviceUserId,username:'buffer-login-service',password,fetchImpl});
    if(typeof credentials?.private_key!=='string')throw Error();
    const hashSecret=createHmac('sha256',credentials.private_key).update(`buffer-login-ip-v1:${envId}`).digest('hex');
    const handleLogin=await createWechatLoginRuntime({envId,appId,appSecret,credentials,hashSecret,keyPolicy,
      rpcGuard:{serviceUserId,getAccessToken:session.getAccessToken,fetchImpl},fetchImpl});
    const server=createWechatLoginHttpServer({allowedOrigin,handleLogin});
    await session.getAccessToken();
    return server;
  }catch{throw Error('cloud_login_startup_failed');}
}
