// Server-only optimistic transaction adapter. The pure domain callback can be
// retried on CAS contention; it must not perform external side effects.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const counter=value=>Number.isSafeInteger(value)&&value>=0&&value<Number.MAX_SAFE_INTEGER;
const row=value=>object(value)&&counter(value.revision)&&counter(value.deletionGeneration)&&(value.state===null||object(value.state));
const copy=value=>structuredClone(value);
const view=value=>({protocolVersion:1,schemaVersion:9,...copy(value)});
const retry=Symbol('retry');

export function createRpcAccountRepository({envId,serviceUserId,backendKey,fetchImpl=fetch}={}) {
  if(typeof envId!=='string'||!/^[a-z0-9-]{1,64}$/.test(envId)
    ||typeof serviceUserId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(serviceUserId)
    ||typeof backendKey!=='string'||!/^[a-f0-9]{64}$/.test(backendKey)||typeof fetchImpl!=='function')throw Error('sync_repository_config_invalid');
  function guard(accountId,principal){
    const token=principal?.accessToken;
    if(principal?.accountId!==accountId||typeof token!=='string'||token.length>4096||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('identity');
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
    if(claims.sub!==accountId||claims.sub===serviceUserId||claims.role!=='authenticated'||claims.aud!==envId
      ||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)throw Error('identity');
    return token;
  }
  async function rpc(accountId,principal,name,params={}){
    const token=guard(accountId,principal);
    const response=await fetchImpl(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${name}`,{
      method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({p_key:backendKey,...params}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok||!response.body)throw Error('provider');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>2200000)throw Error('size');chunks.push(Buffer.from(value));}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  return {async transaction(accountId,callback,principal){
    try{
      guard(accountId,principal);
      for(let attempt=0;attempt<3;attempt++){
        try{
          const current=await rpc(accountId,principal,'buffer_sync_read');
          if(!row(current))throw Error('snapshot');
          let next=null,receipt=null;
          const tx={read:async()=>copy(current),
            write:async value=>{if(next||!row(value))throw Error('write');next=copy(value);},
            getReceipt:async(generation,id)=>{
              const result=await rpc(accountId,principal,'buffer_sync_receipt',{p_revision:current.revision,p_generation:current.deletionGeneration,p_receipt_generation:generation,p_operation_id:id});
              if(result?.stale===true)throw retry;
              if(result?.stale!==false||!Object.hasOwn(result,'receipt'))throw Error('receipt');
              if(result.receipt===null)return null;
              if(!row(result.receipt?.result)||typeof result.receipt.digest!=='string'||!/^[a-f0-9]{64}$/.test(result.receipt.digest))throw Error('receipt');
              return {digest:result.receipt.digest,result:view(result.receipt.result)};
            },
            putReceipt:async(generation,id,value)=>{if(receipt||generation!==current.deletionGeneration)throw Error('receipt');receipt={id,...copy(value)};}
          };
          const result=await callback(tx);
          if(!next&&!receipt)return result;
          if(!next||!receipt||JSON.stringify(receipt.result)!==JSON.stringify(view(next)))throw Error('transaction');
          const applied=await rpc(accountId,principal,'buffer_sync_commit',{p_revision:current.revision,p_generation:current.deletionGeneration,p_next:next,p_operation_id:receipt.id,p_digest:receipt.digest,p_result:next});
          if(applied===false)throw retry;
          if(applied!==true)throw Error('commit');
          return result;
        }catch(error){if(error!==retry)throw error;}
      }
      throw Error('contention');
    }catch{throw Error('sync_repository_unavailable');}
  }};
}
