import {createWechatLoginService,createWechatCodeExchange} from './wechat-login-service.js';
import {createCloudBaseTicketSigner} from './cloudbase-ticket-signer.js';
import {createPostgresLoginGuard} from './postgres-login-guard.js';

/** Server-only composition. Credentials supplied by the host secret store, never
 * a request or app bundle. No endpoint is automatically exposed by this factory.
 * The host must enforce HTTPS/origin policy and pass its verified network address.
 * The PG pool must use a dedicated server role and a bounded connection timeout. */
export async function createWechatLoginRuntime({appId,envId,appSecret,credentials,pool,hashSecret,maxPerMinute,maxDailyRequests,fetchImpl,keyPolicy}={}) {
  const exchangeCode=createWechatCodeExchange({appId,appSecret,fetchImpl});
  const guard=createPostgresLoginGuard({pool,scope:appId,hashSecret,maxPerMinute,maxDailyRequests});
  const createTicket=await createCloudBaseTicketSigner({envId,credentials,keyPolicy});
  return createWechatLoginService({appId,...guard,exchangeCode,createTicket});
}
