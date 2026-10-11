import {createHash} from 'node:crypto';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const ticket=v=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v)<=16384;
// Composition requires official user-profile authentication, official WeChat
// exchange, durable replay protection and the server-only RSA ticket signer.
// No client owner, unionid, nickname or guessed custom-UID/sub mapping is used.
export function createWechatBrowserGrantVerifier({appId,envId,authenticate,consumeCode,exchangeCode,createTicket,fetchImpl=fetch}={}) {
  if(typeof appId!=='string'||!/^wx[a-f0-9]{16}$/.test(appId)||typeof envId!=='string'||!/^[a-z0-9-]{1,64}$/.test(envId)
    ||[authenticate,consumeCode,exchangeCode,createTicket,fetchImpl].some(fn=>typeof fn!=='function'))throw Error('pair_verifier_config_invalid');
  const hash=v=>createHash('sha256').update(v).digest('hex');
  return async function verify({request,code}={}){
    try {
      if(!(request instanceof Request)||typeof code!=='string'||!/^[A-Za-z0-9_-]{8,256}$/.test(code))throw Error('input');
      const current=await authenticate(request);if(!id(current?.accountId))throw Error('identity');
      if(await consumeCode(hash(`${appId}:${code}`))!==true)throw Error('replay');
      const fresh=await exchangeCode(code);if(!id(fresh?.openid)||fresh.errcode)throw Error('wechat');
      const uid=`wx_${hash(`${appId}:${fresh.openid}`).slice(0,29)}`,probe=await createTicket(uid);
      if(!ticket(probe))throw Error('ticket');
      const response=await fetchImpl(`https://${envId}.api.tcloudbasegateway.com/auth/v1/signin/custom`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider_id:'custom',ticket:probe}),
        redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok||!response.body)throw Error('provider');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>32768)throw Error('size');chunks.push(Buffer.from(value));}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(typeof result?.access_token!=='string'||!result.access_token||result.access_token.length>4096)throw Error('provider');
      const verified=await authenticate(new Request('https://buffer.invalid/identity',{headers:{authorization:`Bearer ${result.access_token}`}}));
      if(verified?.accountId!==current.accountId)throw Error('identity');
      const grant=await createTicket(uid);if(!ticket(grant)||grant===probe)throw Error('ticket');
      return {accountId:current.accountId,ticket:grant};
    } catch {throw Error('pair_identity_rejected');}
  };
}
