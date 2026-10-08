import {createWechatLoginService,createWechatCodeExchange} from './wechat-login-service.js';
import {createCloudBaseTicketSigner} from './cloudbase-ticket-signer.js';
import {createPostgresLoginGuard} from './postgres-login-guard.js';
import {createRpcLoginGuard} from './rpc-login-guard.js';

/** Server-only composition. Credentials supplied by the host secret store, never
 * a request or app bundle. No endpoint is automatically exposed by this factory.
 * The host must enforce HTTPS/origin policy and pass its verified network address.
 * A direct PG pool needs a dedicated role. Shared clusters can instead supply
 * rpcGuard: a dedicated authenticated session with restricted SQL functions.
 * These paths are mutually exclusive, and neither has a memory fallback. */
export async function createWechatLoginRuntime({appId,envId,appSecret,credentials,pool,rpcGuard,hashSecret,maxPerMinute,maxDailyRequests,fetchImpl,keyPolicy}={}) {
  if(pool && rpcGuard) throw new Error('login_runtime_config_invalid');
  const exchangeCode=createWechatCodeExchange({appId,appSecret,fetchImpl});
  const guard=rpcGuard
    ? createRpcLoginGuard({envId,scope:appId,hashSecret,serviceUserId:rpcGuard.serviceUserId,getAccessToken:rpcGuard.getAccessToken,fetchImpl:rpcGuard.fetchImpl})
    : createPostgresLoginGuard({pool,scope:appId,hashSecret,maxPerMinute,maxDailyRequests});
  const createTicket=await createCloudBaseTicketSigner({envId,credentials,keyPolicy});
  return createWechatLoginService({appId,...guard,exchangeCode,createTicket});
}
