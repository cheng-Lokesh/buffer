const {createAccountController}=require('../core/account-controller');
const {createAccountSyncClient}=require('../core/account-sync-client');
const {createMiniAccountSyncTransport}=require('./account-sync');

function createMiniAccountController(platform,session){
  if(typeof platform?.getStorageSync!=='function'||typeof platform?.setStorageSync!=='function')throw Error('native_account_storage_required');
  let sequence=0;
  const syncClient=createAccountSyncClient({
    storage:{getItem:key=>platform.getStorageSync(key),setItem:(key,value)=>platform.setStorageSync(key,value)},
    transport:createMiniAccountSyncTransport(platform,session),
    // Idempotency identity only, never authentication. Persisted with the queue
    // before sending, and reused unchanged for every retry.
    createOperationId:()=>`mini-${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  });
  return createAccountController({session,syncClient});
}
module.exports={createMiniAccountController};
