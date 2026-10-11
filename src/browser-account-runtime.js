import {createBrowserAccountSession} from './browser-account-session.js';
import {createAccountSyncClient} from './account-sync-client.js';
import {createAccountSyncTransport} from './account-sync-transport.js';
import {createAccountController} from './account-controller.js';
import {createAccountSyncLoop} from './account-sync-loop.js';
const envId='buffer-d4gz06df3a59dea88';
export const ACCOUNT_SERVER='https://buffer-d4gz06df3a59dea88-1373773247.ap-shanghai.app.tcloudbase.com';

export function createBrowserAccountRuntime({storage,getLoginTicket,request,onChange,now=Date.now,schedule=setTimeout,cancel=clearTimeout,enabled=()=>true}={}){
  if(typeof onChange!=='function'||typeof enabled!=='function')throw Error('browser_account_config_invalid');
  const session=createBrowserAccountSession({envId,getLoginTicket,request,now});
  const transport=createAccountSyncTransport({envId,syncUrl:ACCOUNT_SERVER+'/api/account/sync',session,request});
  const syncClient=createAccountSyncClient({storage,transport,createOperationId:()=>`web-${crypto.randomUUID()}`});
  let generation=0;
  const status=()=>({auth:session.status(),sync:controller.status(),generation});
  const controller=createAccountController({session,syncClient,now,onChange:()=>onChange(status())});
  const loop=createAccountSyncLoop({enabled:()=>enabled()&&session.status().phase==='signed_in',status:controller.status,refresh:controller.refresh,schedule,cancel});
  const scope=()=>({accountId:session.status().accountId,generation});
  function check(options){const current=scope();if(session.status().phase!=='signed_in'||options?.scope?.accountId!==current.accountId||options.scope.generation!==current.generation)throw Error('account_scope_changed');}
  async function login(){generation++;loop.stop();try{const value=await controller.login();loop.start();return value;}catch(error){onChange(status());throw error;}}
  function logout(){generation++;loop.stop();controller.logout();}
  return {
    status,scope,login,logout,
    async confirm(action,fields,options){check(options);return controller.confirm({type:'confirm_reality',action,...fields,confirmedAt:new Date(now()).toISOString()},options);},
    refresh:()=>controller.refresh(),
    previewMigration(backup,options){check(options);return controller.previewMigration(backup);},
    confirmMigration(preview,options){check(options);return controller.confirmMigration(preview,options);},
    deleteData(options){check(options);return controller.deleteData(options);},
    acceptCloudVersion(options){check(options);const result=controller.acceptCloudVersion(options);loop.start();return result;},
    show(){loop.start();},hide(){loop.stop();},
  };
}
