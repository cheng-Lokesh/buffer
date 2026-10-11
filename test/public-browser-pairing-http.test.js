import test from 'node:test';
import assert from 'node:assert/strict';
async function fixture(){const m=await import('../server/browser-pairing-http.js').catch(()=>null);assert.equal(typeof m?.createBrowserPairingHandler,'function','pairing HTTP handler missing');
  const calls=[];let allow=true,consumed=null;
  const handle=m.createBrowserPairingHandler({allowedOrigin:'https://buffer.test',admit:async()=>allow,
    store:{create:async data=>{calls.push(['create',data]);return true;},approve:async data=>{calls.push(['approve',data]);return true;},consume:async data=>{calls.push(['consume',data]);return consumed;}},
    verifyGrant:async data=>{calls.push(['verify',data.code]);return {accountId:'fixture-owner',ticket:'private-ticket'};}});
  const send=(action,body,headers={origin:'https://buffer.test'})=>handle(new Request(`https://buffer.test/api/auth/browser/${action}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}),{remoteAddress:'127.0.0.1'});
  return {handle,send,calls,setAllow:v=>allow=v,setConsumed:v=>consumed=v};}
const proof='A'.repeat(43);
test('browser begins a challenge, mini approves a verified grant and only the initiating browser consumes it',async()=>{
  const f=await fixture();const response=await f.send('create',{browserSecret:proof});assert.equal(response.status,200);
  const issued=await response.json();assert.match(issued.challenge,/^[A-Za-z0-9_-]{43}$/);assert.match(issued.code,/^[A-HJ-NP-Z2-9]{8}$/);assert.equal(issued.expiresIn,120);
  const approval=await f.send('approve',{code:issued.code,wechatCode:'fresh-code-1234'},{authorization:'Bearer fixture'});assert.equal(approval.status,200);
  assert.deepEqual(f.calls.find(c=>c[0]==='approve')[1],{code:issued.code,accountId:'fixture-owner',ticket:'private-ticket'});
  assert.equal((await f.send('consume',{challenge:issued.challenge,browserSecret:proof})).status,202);
  f.setConsumed({accountId:'fixture-owner',ticket:'private-ticket'});
  assert.deepEqual(await (await f.send('consume',{challenge:issued.challenge,browserSecret:proof})).json(),{accountId:'fixture-owner',ticket:'private-ticket'});
});
test('HTTP rejects foreign origins, owner overrides, missing authorization, invalid proofs and exhausted admission',async()=>{
  const f=await fixture();assert.equal((await f.send('create',{browserSecret:proof},{origin:'https://attacker.test'})).status,403);
  assert.equal((await f.send('create',{browserSecret:proof},{})).status,403);
  assert.equal((await f.send('approve',{code:'ABCDEFGH',wechatCode:'fresh-code-1234',accountId:'attacker'},{authorization:'Bearer fixture'})).status,400);
  assert.equal((await f.send('approve',{code:'ABCDEFGH',wechatCode:'fresh-code-1234'})).status,401);
  assert.equal((await f.send('consume',{challenge:proof,browserSecret:'bad'})).status,400);assert.equal(f.calls.length,0);
  f.setAllow(false);assert.equal((await f.send('create',{browserSecret:proof})).status,429);
});
test('handler fails closed on collisions, identity errors, oversized bodies and unsupported requests',async()=>{
  const m=await import('../server/browser-pairing-http.js');assert.throws(()=>m.createBrowserPairingHandler({}),/pair_http_config_invalid/);
  const f=await fixture();
  assert.equal((await f.handle(new Request('https://buffer.test/api/auth/browser/unknown'))).status,404);
  assert.equal((await f.handle(new Request('https://buffer.test/api/auth/browser/create?a=1'))).status,400);
  assert.equal((await f.handle(new Request('https://buffer.test/api/auth/browser/create'))).status,405);
  assert.equal((await f.handle(new Request('https://buffer.test/api/auth/browser/create',{method:'POST',headers:{origin:'https://buffer.test'}}))).status,415);
  assert.equal((await f.send('create',{browserSecret:'A'.repeat(3000)})).status,413);
  const handler=m.createBrowserPairingHandler({allowedOrigin:'https://buffer.test',admit:async()=>true,
    store:{create:async()=>false,approve:async()=>false,consume:async()=>null},verifyGrant:async()=>{throw Error('pair_identity_rejected');}});
  const request=(action,body)=>new Request(`https://buffer.test/api/auth/browser/${action}`,{method:'POST',headers:{origin:'https://buffer.test','content-type':'application/json',authorization:'Bearer fixture'},body:JSON.stringify(body)});
  assert.equal((await handler(request('create',{browserSecret:proof}))).status,503);
  assert.equal((await handler(request('approve',{code:'ABCDEFGH',wechatCode:'fresh-code-1234'}))).status,401);
});
