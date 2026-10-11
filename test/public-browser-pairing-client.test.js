import test from 'node:test';
import assert from 'node:assert/strict';
async function factory(){const m=await import('../src/browser-pairing-client.js').catch(()=>null);assert.equal(typeof m?.createBrowserPairingClient,'function','browser polling login client missing');return m.createBrowserPairingClient;}
test('browser proof stays in memory, challenge is shown without it and consumed grant reaches verified session',async()=>{
  const create=await factory(),calls=[],visible=[];let consumed=0,time=0;
  const client=create({baseUrl:'https://fixture.test',randomBytes:()=>new Uint8Array(32).fill(1),now:()=>time,wait:async ms=>time+=ms,onChallenge:value=>visible.push(value),request:async input=>{
    calls.push(input);return input.url.endsWith('/create')?{status:200,body:{code:'ABCDEFGH',challenge:'A'.repeat(43),expiresIn:120}}:++consumed<2?{status:202,body:{pending:true}}:{status:200,body:{accountId:'fixture-owner',ticket:'fixture-ticket'}};}});
  assert.deepEqual(await client.getLoginTicket(),{accountId:'fixture-owner',ticket:'fixture-ticket'});assert.equal(calls.length,3);
  assert.deepEqual(Object.keys(visible[0]).sort(),['code','expiresAt']);assert.ok(!JSON.stringify(visible).includes('browserSecret'));
  assert.equal(calls[0].body.browserSecret,calls[1].body.browserSecret);assert.equal(calls[1].body.challenge,'A'.repeat(43));
});
test('browser cancellation, expiry and provider failure cannot return a ticket',async()=>{
  const create=await factory();let release;
  const client=create({baseUrl:'https://fixture.test',request:async()=>new Promise(resolve=>release=resolve),onChallenge:()=>{}});
  const pending=client.getLoginTicket();client.cancel();release({status:200,body:{code:'ABCDEFGH',challenge:'A'.repeat(43),expiresIn:120}});await assert.rejects(pending,/pair_cancelled/);
  let time=0;const expired=create({baseUrl:'https://fixture.test',now:()=>time,wait:async()=>time=120001,onChallenge:()=>{},request:async input=>input.url.endsWith('/create')?{status:200,body:{code:'ABCDEFGH',challenge:'A'.repeat(43),expiresIn:120}}:{status:202,body:{pending:true}}});
  await assert.rejects(expired.getLoginTicket(),/pair_expired/);
  const unavailable=create({baseUrl:'https://fixture.test',request:async()=>({status:404}),onChallenge:()=>{}});await assert.rejects(unavailable.getLoginTicket(),/pair_unavailable/);
  assert.throws(()=>create({baseUrl:'http://untrusted.test'}),/pair_client_config_invalid/);
});
