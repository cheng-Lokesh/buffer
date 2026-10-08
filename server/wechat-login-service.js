import { createHash } from 'node:crypto';

const validApp = value => typeof value === 'string' && /^wx[a-f0-9]{16}$/.test(value);
const validCode = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const reply = (status, code) => new Response(JSON.stringify(typeof code === 'string' ? {code} : code), {
  status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'},
});

async function readCode(request) {
  const reader = request.body?.getReader();
  if (!reader) return {error:400};
  const chunks=[]; let bytes=0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if(done) break;
      bytes+=value.byteLength;
      if(bytes>2048) { await reader.cancel(); return {error:413}; }
      chunks.push(value);
    }
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!record(body) || Object.keys(body).length!==1 || !validCode(body.code)) return {error:400};
    return {code:body.code};
  } catch { return {error:400}; }
  finally { reader.releaseLock(); }
}

/** No default admission or replay cache: production requires a durable, atomic
 * policy shared by all instances. context must come from a trusted server adapter,
 * never from JSON or unverified forwarding headers. Identity linking is separate;
 * this endpoint cannot accept a target account or merge accounts. */
export function createWechatLoginService({appId,admit,consumeCode,exchangeCode,createTicket}={}) {
  if(!validApp(appId) || [admit,consumeCode,exchangeCode,createTicket].some(fn=>typeof fn!=='function')) throw new Error('wechat_login_adapters_required');
  return async function handle(request,context) {
    try {
      if(request.method!=='POST') return reply(405,'method_not_allowed');
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return reply(415,'json_required');
      if(await admit(context)!==true) return reply(429,'login_rate_limited');
      const input=await readCode(request);
      if(input.error) return reply(input.error,input.error===413?'request_too_large':'invalid_login_request');
      if(await consumeCode(hash(`${appId}:${input.code}`))!==true) return reply(409,'login_code_already_used');
      const identity=await exchangeCode(input.code);
      if(!record(identity) || identity.errcode || typeof identity.openid!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.openid)) return reply(401,'wechat_login_rejected');
      const uid=`wx_${hash(`${appId}:${identity.openid}`).slice(0,29)}`;
      const ticket=await createTicket(uid);
      if(typeof ticket!=='string' || !ticket || ticket.length>16384) throw new Error('ticket_invalid');
      return reply(200,{ticket});
    } catch { return reply(503,'login_unavailable'); }
  };
}

/** This is the actual provider exchange, not a fake OpenID/session generator.
 * Secrets are sent only to the official WeChat API; redirects are forbidden.
 * Do not log URLs: jscode2session requires the secret in its query string. */
export function createWechatCodeExchange({appId,appSecret,fetchImpl=fetch}={}) {
  if(!validApp(appId) || typeof appSecret!=='string' || !appSecret || typeof fetchImpl!=='function') throw new Error('wechat_config_required');
  return async code => {
    try {
      if(!validCode(code)) throw new Error('invalid_code');
      const url=new URL('https://api.weixin.qq.com/sns/jscode2session');
      url.search=new URLSearchParams({appid:appId,secret:appSecret,js_code:code,grant_type:'authorization_code'}).toString();
      const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok) throw new Error('http_error');
      const body=await response.json();
      if(!record(body) || body.errcode || typeof body.openid!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.openid)) throw new Error('provider_rejected');
      // session_key, unionid and provider messages are not needed or retained.
      return {openid:body.openid};
    } catch { throw new Error('wechat_exchange_failed'); }
  };
}
