import test from 'node:test';
import assert from 'node:assert/strict';
async function factory(){const module=await import('../src/browser-account-session.js').catch(()=>null);assert.equal(typeof module?.createBrowserAccountSession,'function');return module.createBrowserAccountSession;}
async function fixture(){
  const create=await factory();let time=1000,tickets=0,profile='fixture-owner',release=null;const calls=[];
  const session=create({envId:'buffer-d4gz06df3a59dea88',getLoginTicket:async()=>{tickets++;if(release)await new Promise(resolve=>release=resolve);return {ticket:'fixture-ticket',accountId:'fixture-owner'};},now:()=>time,
    request:async input=>{calls.push(input);return {status:200,body:input.url.endsWith('/user/me')?{sub:profile}:{sub:'fixture-owner',access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:120}};}});
  return {session,calls,get tickets(){return tickets;},setProfile:value=>profile=value,setTime:value=>time=value,defer:()=>release=true,release:()=>{const fn=release;release=null;fn();}};
}
test('browser login consumes one approved ticket and verifies the official profile before exposing identity',async()=>{
  const f=await fixture();assert.equal(f.calls.length,0);assert.equal(f.session.status().phase,'signed_out');
  await Promise.all([f.session.login(),f.session.login()]);assert.equal(f.tickets,1);assert.equal(f.session.status().accountId,'fixture-owner');
  assert.equal(f.calls[0].body.ticket,'fixture-ticket');assert.ok(f.calls[1].url.endsWith('/user/me'));assert.equal(await f.session.getAccessToken(),'fixture-access');
  assert.ok(!JSON.stringify(f.session.status()).includes('fixture-ticket'));f.session.logout();assert.equal(f.session.status().accountId,null);
});
test('mismatched paired identity or refresh profile fails closed without leaking provider errors',async()=>{
  const f=await fixture();f.setProfile('different-owner');await assert.rejects(f.session.login(),/login_unavailable/);assert.equal(f.session.status().accountId,null);
  f.setProfile('fixture-owner');await f.session.login();f.setTime(100000);f.setProfile('different-owner');await assert.rejects(f.session.getAccessToken(),/session_expired/);assert.equal(f.session.status().accountId,null);
});
test('logout cancels pending browser ticket and cannot install an old session',async()=>{
  const f=await fixture();f.defer();const pending=f.session.login();f.session.logout();f.release();await assert.rejects(pending,/session_cancelled/);assert.equal(f.calls.length,0);assert.equal(f.session.status().phase,'signed_out');
});
test('browser session refuses missing trusted adapters and arbitrary endpoint environments',async()=>{
  const create=await factory();assert.throws(()=>create({}),/browser_session_config_invalid/);assert.throws(()=>create({envId:'https://other-site',getLoginTicket:async()=>{},request:async()=>{}}),/browser_session_config_invalid/);
});
