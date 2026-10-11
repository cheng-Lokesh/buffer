import {randomBytes,randomInt} from 'node:crypto';
const proof=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const code=v=>typeof v==='string'&&/^[A-HJ-NP-Z2-9]{8}$/.test(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function read(request){
  const reader=request.body?.getReader();if(!reader)throw Error('input');const chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048)throw Error('size');chunks.push(Buffer.from(value));}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!object(result))throw Error('input');return result;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
const exact=(body,keys)=>Object.keys(body).length===keys.length&&keys.every(k=>Object.hasOwn(body,k));
export function createBrowserPairingHandler({allowedOrigin,admit,store,verifyGrant}={}){
  try {const origin=new URL(allowedOrigin);if(origin.protocol!=='https:'||origin.origin!==allowedOrigin
    ||[admit,verifyGrant,store?.create,store?.approve,store?.consume].some(fn=>typeof fn!=='function'))throw Error();}
  catch{throw Error('pair_http_config_invalid');}
  return async function handle(request,context){
    try {
      const url=new URL(request.url),action=url.pathname.split('/').at(-1),origin=request.headers.get('origin');
      if(!['create','approve','consume'].includes(action)||url.pathname!==`/api/auth/browser/${action}`)return reply(404,{code:'not_found'});
      if(url.search)return reply(400,{code:'query_not_allowed'});
      if(request.method!=='POST')return reply(405,{code:'method_not_allowed'});
      if((origin!==null&&origin!==allowedOrigin)||(action!=='approve'&&origin!==allowedOrigin))return reply(403,{code:'origin_denied'});
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return reply(415,{code:'json_required'});
      if(action==='approve'&&!/^Bearer \S+$/.test(request.headers.get('authorization')||''))return reply(401,{code:'authentication_required'});
      let body;try{body=await read(request);}catch(error){return reply(error.message==='size'?413:400,{code:'invalid_pair_request'});}
      const valid=action==='create'?exact(body,['browserSecret'])&&proof(body.browserSecret):action==='consume'?
        exact(body,['challenge','browserSecret'])&&proof(body.challenge)&&proof(body.browserSecret):
        exact(body,['code','wechatCode'])&&code(body.code)&&typeof body.wechatCode==='string'&&/^[A-Za-z0-9_-]{8,256}$/.test(body.wechatCode);
      if(!valid)return reply(400,{code:'invalid_pair_request'});
      if(await admit(context,action)!==true)return reply(429,{code:'pair_rate_limited'});
      if(action==='create'){
        const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for(let attempt=0;attempt<3;attempt++){
          const challenge=randomBytes(32).toString('base64url');let humanCode='';
          for(let i=0;i<8;i++)humanCode+=alphabet[randomInt(alphabet.length)];
          if(await store.create({challenge,code:humanCode,browserSecret:body.browserSecret})===true)
            return reply(200,{challenge,code:humanCode,expiresIn:120});
        }
        throw Error('capacity');
      }
      if(action==='approve'){
        const grant=await verifyGrant({request,code:body.wechatCode});
        if(await store.approve({code:body.code,...grant})!==true)return reply(409,{code:'pair_not_available'});
        return reply(200,{approved:true});
      }
      const grant=await store.consume(body);return grant===null?reply(202,{pending:true}):reply(200,grant);
    }catch(error){return reply(error.message==='pair_identity_rejected'?401:503,{code:error.message==='pair_identity_rejected'?'pair_identity_rejected':'pair_unavailable'});}
  };
}
