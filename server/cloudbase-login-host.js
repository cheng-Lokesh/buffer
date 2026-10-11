import {createHmac} from 'node:crypto';
import {createCloudBaseServiceSession} from './cloudbase-service-session.js';
import {createWechatLoginRuntime} from './wechat-login-runtime.js';
import {createWechatLoginHttpServer} from './wechat-login-http.js';
import {createAccountSyncRuntime} from './account-sync-runtime.js';
import {createBrowserPairingRuntime} from './browser-pairing-runtime.js';

/** Private server configuration only. This factory does not read user data,
 * financial tables, ambient administrator keys or browser-selected identities. */
export async function createCloudBaseLoginServer({config,fetchImpl=fetch}={}) {
  try {
    const {envId,appId,appSecret,credentials,serviceUserId,password,allowedOrigin,keyPolicy}=config;
    if(config.sync!==undefined && (!config.sync || typeof config.sync!=='object' || Array.isArray(config.sync)
      ||config.sync.enabled!==true ||Object.keys(config.sync).some(key=>!['enabled','backendKey'].includes(key))))throw Error();
    if(config.pair!==undefined&&(!config.pair||typeof config.pair!=='object'||Array.isArray(config.pair)
      ||config.pair.enabled!==true||Object.keys(config.pair).some(key=>!['enabled','backendKey','encryptionKey'].includes(key))))throw Error();
    const handleSync=config.sync===undefined?undefined:createAccountSyncRuntime({envId,serviceUserId,backendKey:config.sync.backendKey,fetchImpl});
    const session=createCloudBaseServiceSession({envId,serviceUserId,username:'buffer-login-service',password,fetchImpl});
    if(typeof credentials?.private_key!=='string')throw Error();
    const hashSecret=createHmac('sha256',credentials.private_key).update(`buffer-login-ip-v1:${envId}`).digest('hex');
    const handleLogin=await createWechatLoginRuntime({envId,appId,appSecret,credentials,hashSecret,keyPolicy,
      rpcGuard:{serviceUserId,getAccessToken:session.getAccessToken,fetchImpl},fetchImpl});
    const handlePair=config.pair===undefined?undefined:await createBrowserPairingRuntime({envId,appId,appSecret,credentials,keyPolicy,
      serviceUserId,getAccessToken:session.getAccessToken,backendKey:config.pair.backendKey,encryptionKey:config.pair.encryptionKey,hashSecret,allowedOrigin,fetchImpl});
    const server=createWechatLoginHttpServer({allowedOrigin,handleLogin,handleSync,handlePair});
    await session.getAccessToken();
    return server;
  }catch{throw Error('cloud_login_startup_failed');}
}
