import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const envId='fixture-env', sub='fixture-account';
const load=async platform=>platform==='web'
  ? import('../src/wechat-account-session.js').catch(()=>null)
  : (()=>{try{return require('../miniprogram/core/wechat-account-session.js');}catch{return null;}})();
for(const platform of ['web','mini']) {
  async function fixture(overrides={}) {
    const module=await load(platform);assert.ok(module,'account session implementation missing');
    let clock=1700000000000;const calls=[];
    const options={envId,loginUrl:'https://fixture-env.ap-shanghai.app.tcloudbase.com/api/auth/wechat',
      now:()=>clock,getWechatCode:async()=> 'fixture-code',
      request:async input=>{
        calls.push(input);
        if(input.url.endsWith('/api/auth/wechat'))return {status:200,body:{ticket:'fixture-ticket'}};
        if(input.url.endsWith('/user/me'))return {status:200,body:{sub}};
        return {status:200,body:{sub,access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:120}};
      },...overrides};
    return {client:module.createWechatAccountSession(options),calls,options,advance:ms=>clock+=ms};
  }
  test(`[${platform}] explicit configuration and signed-out access fail closed`,async()=>{
    const f=await fixture();assert.deepEqual(f.client.status(),{phase:'signed_out',accountId:null});
    await assert.rejects(f.client.getAccessToken(),/authentication_required/);assert.equal(f.calls.length,0);
    const module=await load(platform);
    for(const extra of [{envId:''},{loginUrl:'http://fixture.invalid/api/auth/wechat'},{loginUrl:'https://evil.invalid/api/auth/wechat'},
      {loginUrl:f.options.loginUrl+'?secret=x'},{getWechatCode:null},{request:null},{now:null}])
      assert.throws(()=>module.createWechatAccountSession({...f.options,...extra}),/account_session_config_invalid/);
  });
  test(`[${platform}] real protocol stages verify profile and expose no credentials in status`,async()=>{
    let codeCalls=0;const f=await fixture({getWechatCode:async()=>{codeCalls++;return 'fixture-code';}});
    const results=await Promise.all([f.client.login(),f.client.login()]);
    assert.deepEqual(results[0],{phase:'signed_in',accountId:sub});assert.equal(codeCalls,1);assert.equal(f.calls.length,3);
    assert.deepEqual(f.calls[0].body,{code:'fixture-code'});
    assert.deepEqual(f.calls[1].body,{provider_id:'custom',ticket:'fixture-ticket'});
    assert.equal(f.calls[2].headers.Authorization,'Bearer fixture-access');
    assert.equal(await f.client.getAccessToken(),'fixture-access');
    assert.ok(!JSON.stringify(f.client.status()).includes('fixture-access'));
  });
  test(`[${platform}] refresh rotates session and never silently changes account`,async()=>{
    const f=await fixture();await f.client.login();f.advance(100000);
    await Promise.all([f.client.getAccessToken(),f.client.getAccessToken()]);
    assert.equal(f.calls.length,5);assert.deepEqual(f.calls[3].body,{grant_type:'refresh_token',refresh_token:'fixture-refresh'});
    const g=await fixture({request:async input=>input.url.endsWith('/token')
      ? {status:200,body:{sub:'other',access_token:'secret',refresh_token:'refresh',expires_in:120}}
      : input.url.endsWith('/user/me')?{status:200,body:{sub}}:input.url.endsWith('/api/auth/wechat')
      ?{status:200,body:{ticket:'ticket'}}:{status:200,body:{sub,access_token:'access',refresh_token:'refresh',expires_in:120}}});
    await g.client.login();g.advance(100000);await assert.rejects(g.client.getAccessToken(),/session_expired/);
    assert.deepEqual(g.client.status(),{phase:'session_expired',accountId:null});
    await assert.rejects(g.client.getAccessToken(),/authentication_required/);
  });
  test(`[${platform}] logout during login or refresh prevents late session resurrection`,async()=>{
    let release;const code=new Promise(resolve=>release=resolve);
    const f=await fixture({getWechatCode:()=>code});const task=f.client.login();f.client.logout();release('fixture-code');
    await assert.rejects(task,/session_cancelled/);assert.equal(f.calls.length,0);
    assert.deepEqual(f.client.status(),{phase:'signed_out',accountId:null});
    let done;const refresh=new Promise(resolve=>done=resolve);const g=await fixture({request:async input=>{
      if(input.url.endsWith('/token'))return refresh;
      return input.url.endsWith('/user/me')?{status:200,body:{sub}}:input.url.endsWith('/api/auth/wechat')
        ?{status:200,body:{ticket:'ticket'}}:{status:200,body:{sub,access_token:'access',refresh_token:'refresh',expires_in:120}};
    }});
    await g.client.login();g.advance(100000);const pending=g.client.getAccessToken();g.client.logout();
    done({status:200,body:{sub,access_token:'late-access',refresh_token:'late-refresh',expires_in:120}});
    await assert.rejects(pending,/session_cancelled/);assert.equal(g.client.status().phase,'signed_out');
  });
  test(`[${platform}] errors, malformed sessions and identity mismatch are sanitized`,async()=>{
    for(const request of [async()=>{throw Error('private ticket');},async()=>({status:429,body:{secret:'private'}}),
      async input=>input.url.endsWith('/api/auth/wechat')?{status:200,body:{ticket:'ticket'}}:{status:200,body:{}},
      async input=>input.url.endsWith('/api/auth/wechat')?{status:200,body:{ticket:'ticket'}}:input.url.endsWith('/user/me')
        ?{status:200,body:{sub:'wrong'}}:{status:200,body:{sub,access_token:'access',refresh_token:'refresh',expires_in:120}}]) {
      const f=await fixture({request});await assert.rejects(f.client.login(),/^Error: login_unavailable$/);
      assert.equal(f.client.status().accountId,null);
    }
    const f=await fixture({getWechatCode:async()=>({code:'not-a-string'})});
    await assert.rejects(f.client.login(),/login_unavailable/);assert.equal(f.calls.length,0);
  });
  test(`[${platform}] fresh explicit login recovers failure; logout retains no token and no storage adapter`,async()=>{
    let failed=true;const f=await fixture({getWechatCode:async()=>{if(failed)throw Error('private');return 'fixture-code';}});
    await assert.rejects(f.client.login(),/login_unavailable/);failed=false;await f.client.login();
    f.client.logout();await assert.rejects(f.client.getAccessToken(),/authentication_required/);
    assert.deepEqual(Object.keys(f.client).sort(),['getAccessToken','login','logout','status']);
  });
}
