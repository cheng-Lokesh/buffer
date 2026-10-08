import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../server/wechat-login-service.js').catch(() => null);
const create = options => { assert.ok(module, '微信登录服务尚未实现'); return module.createWechatLoginService(options); };
const request = (body = {code:'valid-code-123456'}, options = {}) => new Request('https://buffer.test/api/auth/wechat', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body), ...options});
function fixture(overrides = {}) {
  const calls = {exchange:0, sign:0, claims:[], ids:[]};
  const options = {
    appId:'wx0123456789abcdef',
    admit:async context => context?.trusted === true,
    consumeCode:async digest => { if (calls.claims.includes(digest)) return false; calls.claims.push(digest); return true; },
    exchangeCode:async () => { calls.exchange++; return {openid:'provider-verified-openid'}; },
    createTicket:async id => { calls.sign++; calls.ids.push(id); return 'test-only-ticket'; },
    ...overrides,
  };
  return {handle:create(options), calls};
}
const context = {trusted:true};

test('requires every security adapter and a real-format AppID', () => {
  const valid = fixture(); assert.ok(valid.handle);
  for (const key of ['admit','consumeCode','exchangeCode','createTicket']) assert.throws(() => create({...{appId:'wx0123456789abcdef',admit:()=>true,consumeCode:()=>true,exchangeCode:()=>({}),createTicket:()=>''},[key]:null}));
  assert.throws(() => create({appId:'touristappid'}));
});
test('only provider-verified identity gets a ticket; no raw identity is returned', async () => {
  const {handle,calls} = fixture(); const result = await handle(request(),context);
  assert.equal(result.status,200); assert.deepEqual(await result.json(),{ticket:'test-only-ticket'});
  assert.match(calls.ids[0], /^wx_[a-f0-9]{29}$/); assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'),null);
});
test('same OpenID is scoped by AppID and cannot become administrator', async () => {
  const a=fixture(); const b=fixture({appId:'wxabcdef0123456789'});
  await a.handle(request(),context); await b.handle(request(),context);
  assert.notEqual(a.calls.ids[0],b.calls.ids[0]); assert.notEqual(a.calls.ids[0],'administrator');
});
test('rejects client-provided identities and unexpected fields before provider call', async () => {
  const f=fixture();
  for(const body of [{code:'valid-code-123456',openid:'forged'}, {code:'valid-code-123456',accountId:'administrator'}, {}, null, [], {code:42}, {code:'bad code'}, {code:'x'.repeat(257)}]) assert.equal((await f.handle(request(body),context)).status,400);
  assert.equal(f.calls.exchange,0);
});
test('rejects unsupported methods and content types', async () => {
  const f=fixture(); assert.equal((await f.handle(new Request('https://buffer.test',{method:'GET'}),context)).status,405);
  assert.equal((await f.handle(request({}, {headers:{'content-type':'text/plain'}}),context)).status,415);
});
test('malformed, empty and oversized streamed bodies cannot reach provider', async () => {
  const f=fixture();
  for(const body of ['{','',JSON.stringify({code:'x'.repeat(3000)})]) {
    const r=await f.handle(new Request('https://buffer.test',{method:'POST',headers:{'content-type':'application/json'},body}),context);
    assert.equal(r.status,body.length>2048?413:400);
  }
  assert.equal((await f.handle(new Request('https://buffer.test',{method:'POST',headers:{'content-type':'application/json'}}),context)).status,400);
  assert.equal(f.calls.exchange,0);
});
test('admission denial prevents both code exchange and signing', async () => {
  const f=fixture(); assert.equal((await f.handle(request(),{})).status,429); assert.equal(f.calls.exchange,0);
});
test('atomic code consumption rejects replay without storing raw codes', async () => {
  const f=fixture(); const results=await Promise.all([f.handle(request(),context),f.handle(request(),context)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]); assert.equal(f.calls.exchange,1);
  assert.match(f.calls.claims[0],/^[a-f0-9]{64}$/); assert.ok(!f.calls.claims[0].includes('valid-code'));
});
test('provider denial never signs; error and session_key stay private', async () => {
  for(const data of [{errcode:40029,errmsg:'private-provider-error'}, {openid:'x',errcode:1,session_key:'private-key'}, {}, null, {openid:''}, {openid:42}, {openid:'x'.repeat(129)}]) {
    const f=fixture({exchangeCode:async()=>data}); const r=await f.handle(request(),context);
    assert.equal(r.status,401); assert.deepEqual(await r.json(),{code:'wechat_login_rejected'}); assert.equal(f.calls.sign,0);
  }
});
test('every adapter failure is generic; raw secrets never enter response', async () => {
  for(const key of ['admit','consumeCode','exchangeCode','createTicket']) {
    const f=fixture({[key]:async()=>{throw new Error('private-secret-value');}}); const r=await f.handle(request(),context);
    assert.equal(r.status,503); assert.deepEqual(await r.json(),{code:'login_unavailable'});
  }
  const f=fixture({createTicket:async()=>null}); assert.equal((await f.handle(request(),context)).status,503);
});

test('real WeChat adapter only calls the official endpoint using server credentials', async () => {
  assert.ok(module); const calls=[];
  const exchange=module.createWechatCodeExchange({appId:'wx0123456789abcdef',appSecret:'test-only-secret',fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return Response.json({openid:'verified',session_key:'private'});}});
  assert.deepEqual(await exchange('valid-code-123456'),{openid:'verified'});
  assert.equal(calls[0].url.origin,'https://api.weixin.qq.com'); assert.equal(calls[0].url.pathname,'/sns/jscode2session');
  assert.equal(calls[0].url.searchParams.get('appid'),'wx0123456789abcdef'); assert.equal(calls[0].url.searchParams.get('secret'),'test-only-secret');
  assert.ok(calls[0].options.signal); assert.equal(calls[0].options.redirect,'error');
});
test('WeChat adapter fails closed on config, network, HTTP and provider errors', async () => {
  assert.ok(module);
  assert.throws(()=>module.createWechatCodeExchange({}));
  for(const fetchImpl of [async()=>{throw new Error('secret');},async()=>new Response('',{status:502}),async()=>Response.json({errcode:40029,errmsg:'private'}),async()=>Response.json({session_key:'private'})]) {
    const exchange=module.createWechatCodeExchange({appId:'wx0123456789abcdef',appSecret:'test-only-secret',fetchImpl});
    await assert.rejects(exchange('valid-code-123456'),/wechat_exchange_failed/);
  }
});
