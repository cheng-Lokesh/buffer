import {createRpcBrowserPairingStore} from './rpc-browser-pairing-store.js';
import {createWechatBrowserGrantVerifier} from './wechat-browser-grant-verifier.js';
import {createBrowserPairingHandler} from './browser-pairing-http.js';
import {createRpcLoginGuard} from './rpc-login-guard.js';
import {createWechatCodeExchange} from './wechat-login-service.js';
import {createCloudBaseTicketSigner} from './cloudbase-ticket-signer.js';
import {createCloudBaseUserAuth} from './cloudbase-user-auth.js';

// Real provider composition, disabled unless the host explicitly supplies pair
// configuration. Operator must configure the separate appId+'_pair' admission
// scope and limits in SQL; an absent scope fails closed, not an in-memory fallback.
export async function createBrowserPairingRuntime({envId,appId,appSecret,credentials,keyPolicy,serviceUserId,getAccessToken,backendKey,encryptionKey,hashSecret,allowedOrigin,fetchImpl=fetch}={}) {
  const store=createRpcBrowserPairingStore({envId,serviceUserId,getAccessToken,backendKey,encryptionKey,hashSecret,fetchImpl});
  const admission=createRpcLoginGuard({envId,serviceUserId,getAccessToken,scope:appId+'_pair',hashSecret,fetchImpl});
  // Share replay namespace with ordinary mini login: a code cannot be consumed
  // once by login and again by browser approval.
  const replay=createRpcLoginGuard({envId,serviceUserId,getAccessToken,scope:appId,hashSecret,fetchImpl});
  const authenticate=createCloudBaseUserAuth({envId,serviceUserId,fetchImpl});
  const exchangeCode=createWechatCodeExchange({appId,appSecret,fetchImpl});
  const createTicket=await createCloudBaseTicketSigner({envId,credentials,keyPolicy});
  const verifyGrant=createWechatBrowserGrantVerifier({appId,envId,authenticate,exchangeCode,createTicket,consumeCode:replay.consumeCode,fetchImpl});
  return createBrowserPairingHandler({allowedOrigin,admit:admission.admit,store,verifyGrant});
}
