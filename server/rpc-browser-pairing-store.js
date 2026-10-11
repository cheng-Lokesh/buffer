import {createHmac,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const proof=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const code=v=>typeof v==='string'&&/^[A-HJ-NP-Z2-9]{8}$/.test(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

// Server-only adapter. Approval receives an identity established by the HTTP
// service, never a browser's owner field. Official gateway verifies JWT signature;
// private SQL independently verifies the dedicated service ID and backend key.
export function createRpcBrowserPairingStore({envId,serviceUserId,backendKey,encryptionKey,hashSecret,getAccessToken,fetchImpl=fetch}={}) {
  if(typeof envId!=='string'||!/^[a-z0-9-]{1,64}$/.test(envId)||!id(serviceUserId)
    ||!hex(backendKey)||!hex(encryptionKey)||!hex(hashSecret)
    ||typeof getAccessToken!=='function'||typeof fetchImpl!=='function')throw Error('pair_store_config_invalid');
  const key=Buffer.from(encryptionKey,'hex');
  const hash=(kind,value)=>createHmac('sha256',hashSecret).update(`${envId}:${kind}:${value}`).digest('hex');
  function seal(accountId,ticket){
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(`${envId}:${accountId}`));
    const data=Buffer.concat([cipher.update(ticket,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
  }
  function open(accountId,value){
    if(typeof value!=='string'||value.length>24576||! /^[A-Za-z0-9_-]+$/.test(value))throw Error('grant');
    const packed=Buffer.from(value,'base64url');if(packed.length<29)throw Error('grant');
    const cipher=createDecipheriv('aes-256-gcm',key,packed.subarray(0,12));
    cipher.setAAD(Buffer.from(`${envId}:${accountId}`));cipher.setAuthTag(packed.subarray(12,28));
    const ticket=Buffer.concat([cipher.update(packed.subarray(28)),cipher.final()]).toString('utf8');
    if(!ticket||Buffer.byteLength(ticket)>16384)throw Error('grant');return ticket;
  }
  async function rpc(name,params){
    try {
      const token=await getAccessToken();
      if(typeof token!=='string'||token.length>4096||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('token');
      const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
      if(claims.sub!==serviceUserId||claims.role!=='authenticated'||claims.aud!==envId
        ||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)throw Error('token');
      const response=await fetchImpl(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${name}`,{
        method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify({p_key:backendKey,...params}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok||!response.body)throw Error('provider');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>32768)throw Error('size');chunks.push(Buffer.from(value));}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {throw Error('pair_store_unavailable');}
  }
  return {
    async create(input){
      if(!proof(input?.challenge)||!code(input?.code)||!proof(input?.browserSecret))throw Error('pair_input_invalid');
      const result=await rpc('buffer_pair_create',{p_challenge:hash('challenge',input.challenge),p_code:hash('code',input.code),p_browser:hash('browser',input.browserSecret)});
      if(typeof result!=='boolean')throw Error('pair_store_unavailable');return result;
    },
    async approve(input){
      if(!code(input?.code)||!id(input?.accountId)||typeof input?.ticket!=='string'||!input.ticket||Buffer.byteLength(input.ticket)>16384)throw Error('pair_input_invalid');
      const result=await rpc('buffer_pair_approve',{p_code:hash('code',input.code),p_owner:input.accountId,p_sealed:seal(input.accountId,input.ticket)});
      if(typeof result!=='boolean')throw Error('pair_store_unavailable');return result;
    },
    async consume(input){
      if(!proof(input?.challenge)||!proof(input?.browserSecret))throw Error('pair_input_invalid');
      const result=await rpc('buffer_pair_consume',{p_challenge:hash('challenge',input.challenge),p_browser:hash('browser',input.browserSecret)});
      if(result===null)return null;
      try {if(!object(result)||!id(result.accountId))throw Error('grant');
        return {accountId:result.accountId,ticket:open(result.accountId,result.sealedGrant)};
      } catch {throw Error('pair_store_unavailable');}
    },
  };
}
