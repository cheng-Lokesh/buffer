import test from 'node:test';
import assert from 'node:assert/strict';
import {createWechatLoginHttpServer} from '../server/wechat-login-http.js';
const origin='https://fixture.example';
async function run(options,fn){const server=createWechatLoginHttpServer({allowedOrigin:origin,handleLogin:async()=>Response.json({ticket:'fixture'}),...options});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}}
test('financial sync endpoint is absent unless explicitly configured, then requires bearer and allowed origin',async()=>{
  await run({},async base=>assert.equal((await fetch(base+'/api/account/sync')).status,404));
  let calls=0;
  await run({handleSync:async request=>{calls++;assert.equal(request.headers.get('authorization'),'Bearer fixture');return Response.json({fixture:true});}},async base=>{
    const missing=await fetch(base+'/api/account/sync');assert.equal(missing.status,401);
    const foreign=await fetch(base+'/api/account/sync',{headers:{origin:'https://evil.example',authorization:'Bearer fixture'}});assert.equal(foreign.status,403);
    const web=await fetch(base+'/api/account/sync',{headers:{origin,authorization:'Bearer fixture'}});assert.equal(web.status,200);assert.equal(web.headers.get('access-control-allow-origin'),origin);assert.equal(web.headers.get('cache-control'),'no-store');assert.match(web.headers.get('vary'),/Authorization/);
    const native=await fetch(base+'/api/account/sync',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:'{}'});assert.equal(native.status,200);assert.equal(native.headers.get('access-control-allow-origin'),null);
  });assert.equal(calls,2);
});
test('sync preflight permits only explicit bearer JSON GET/POST; hostile headers, cookies and invalid bodies do not reach adapter',async()=>{
  let calls=0;await run({handleSync:async request=>{calls++;return Response.json({body:await request.json()},{headers:{'set-cookie':'unintended=1','access-control-allow-origin':'*'}});}},async base=>{
    const preflight=await fetch(base+'/api/account/sync',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-headers'),'authorization, content-type');
    for(const headers of [{'access-control-request-headers':'x-owner'},{'access-control-request-method':'DELETE'},{origin:'https://evil.example'}])assert.equal((await fetch(base+'/api/account/sync',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization',...headers}})).status,403);
    for(const [path,init,status] of [['/api/account/sync?owner=other',{headers:{authorization:'Bearer fixture'}},400],['/api/account/sync',{method:'DELETE',headers:{authorization:'Bearer fixture'}},405],['/api/account/sync',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'text/plain'},body:'{}'},415],['/api/account/sync',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:'x'.repeat(32769)},413]])assert.equal((await fetch(base+path,init)).status,status);
    const response=await fetch(base+'/api/account/sync',{method:'POST',headers:{origin,authorization:'Bearer fixture','content-type':'application/json'},body:'{}'});assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('access-control-allow-origin'),origin);
  });assert.equal(calls,1);
});
test('HTTP gateway prefix stripping normalizes only the explicit sync and pairing paths',async()=>{
  await run({
    handleSync:async()=>Response.json({fixture:true}),
    handlePair:async()=>Response.json({pending:true},{status:202})
  },async base=>{
    assert.equal((await fetch(base+'/auth/wechat',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,200);
    assert.equal((await fetch(base+'/account/sync')).status,401);
    const syncPreflight=await fetch(base+'/account/sync',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'}});
    assert.equal(syncPreflight.status,204);
    assert.equal((await fetch(base+'/auth/browser/create')).status,405);
    const pairPreflight=await fetch(base+'/auth/browser/create',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'}});
    assert.equal(pairPreflight.status,204);
    assert.equal((await fetch(base+'/auth/browser/approve',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,202);
    assert.equal((await fetch(base+'/auth/browser/consume',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,202);
    assert.equal((await fetch(base+'/auth/browser/unknown')).status,404);
    assert.equal((await fetch(base+'/account/other')).status,404);
  });
});
test('sync host errors are sanitized without weakening existing login route',async()=>{
  await run({handleSync:async()=>{throw Error('private financial fact');}},async base=>{
    const failed=await fetch(base+'/api/account/sync',{headers:{authorization:'Bearer fixture'}});assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{code:'sync_unavailable'});
    const login=await fetch(base+'/api/auth/wechat',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(login.status,200);
  });
});
