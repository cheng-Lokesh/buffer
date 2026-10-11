import {createCloudBaseUserAuth} from './cloudbase-user-auth.js';
import {createRpcAccountRepository} from './rpc-account-repository.js';
import {createAccountSyncService} from './account-sync-service.js';
import {applyConfirmedAccountOperation} from '../src/account-confirmation.js';

/** Server-only composition. The host supplies secrets and enforces HTTPS/origin
 * policy. No administrator token, service-user financial access, mock persistence
 * or default secret. Constructing this factory does not publish an endpoint. */
export function createAccountSyncRuntime({envId,serviceUserId,backendKey,fetchImpl=fetch}={}) {
  const authenticate=createCloudBaseUserAuth({envId,serviceUserId,fetchImpl});
  const repository=createRpcAccountRepository({envId,serviceUserId,backendKey,fetchImpl});
  return createAccountSyncService({authenticate,repository,applyConfirmedOperation:applyConfirmedAccountOperation});
}
