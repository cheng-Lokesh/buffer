import test from 'node:test';
import assert from 'node:assert/strict';
async function factory(){const m=await import('../server/rpc-browser-pairing-store.js').catch(()=>null);assert.equal(typeof m?.createRpcBrowserPairingStore,'function','server encrypted pairing adapter missing');return m.createRpcBrowserPairingStore;}
const envId='fixture-env',serviceUserId='fixture-service';
const token=role=>`a.${Buffer.from(JSON.stringify({sub:serviceUserId,role,aud:envId,exp:Date.now()/1000+3600})).toString('base64url')}.b`;
async function fixture(){
  const create=await factory();const calls=[];let approved=null,identity='authenticated',malformed=false;
  const store=create({envId,serviceUserId,backendKey:'a'.repeat(64),encryptionKey:'b'.repeat(64),hashSecret:'c'.repeat(64),getAccessToken:async()=>token(identity),
    fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});
      if(url.endsWith('_approve'))approved={accountId:body.p_owner,sealedGrant:body.p_sealed};
      const result=malformed?{}:url.endsWith('_consume')?approved:true;
      return new Response(JSON.stringify(result));}});
  return {store,calls,setRole:r=>identity=r,setMalformed:()=>malformed=true,setApproved:v=>approved=v,get approved(){return approved;}};
}
const input={challenge:'D'.repeat(43),code:'ABCDEFGH',browserSecret:'E'.repeat(43)};
test('server pairing adapter hashes browser proof and codes, encrypts grants and recovers once-consumed results',async()=>{
  const f=await fixture();assert.equal(await f.store.create(input),true);
  const params=f.calls[0].body;assert.match(params.p_challenge,/^[a-f0-9]{64}$/);assert.match(params.p_code,/^[a-f0-9]{64}$/);assert.match(params.p_browser,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(params).includes(input.browserSecret));assert.ok(!JSON.stringify(params).includes(input.code));
  assert.equal(await f.store.approve({code:input.code,accountId:'fixture-owner',ticket:'private-fixture-ticket'}),true);
  assert.ok(!f.approved.sealedGrant.includes('private-fixture-ticket'));
  assert.deepEqual(await f.store.consume(input),{accountId:'fixture-owner',ticket:'private-fixture-ticket'});
  assert.equal(f.calls[0].options.redirect,'error');assert.equal(f.calls[0].options.cache,'no-store');
});
test('pairing adapter rejects service credentials, malformed responses, tampered or substituted grants',async()=>{
  const f=await fixture();f.setRole('service_role');await assert.rejects(f.store.create(input),/pair_store_unavailable/);assert.equal(f.calls.length,0);
  f.setRole('authenticated');f.setMalformed();await assert.rejects(f.store.create(input),/pair_store_unavailable/);
  const g=await fixture();await g.store.approve({code:input.code,accountId:'fixture-owner',ticket:'ticket'});
  g.setApproved({...g.approved,accountId:'other-owner'});await assert.rejects(g.store.consume(input),/pair_store_unavailable/);
  g.setApproved({accountId:'fixture-owner',sealedGrant:'bad'});await assert.rejects(g.store.consume(input),/pair_store_unavailable/);
  g.setApproved(null);assert.equal(await g.store.consume(input),null);
});
test('pairing adapter rejects invalid inputs before network calls and requires all private configuration',async()=>{
  const create=await factory();assert.throws(()=>create({}),/pair_store_config_invalid/);
  const f=await fixture();await assert.rejects(f.store.create({...input,code:'bad'}),/pair_input_invalid/);
  await assert.rejects(f.store.consume({...input,browserSecret:'bad'}),/pair_input_invalid/);
  await assert.rejects(f.store.approve({code:input.code,accountId:'bad owner',ticket:'ticket'}),/pair_input_invalid/);
  await assert.rejects(f.store.approve({code:input.code,accountId:'fixture-owner',ticket:'x'.repeat(16385)}),/pair_input_invalid/);
  assert.equal(f.calls.length,0);
});

test('encrypted RPC adapter integrates with real SQL and never returns a grant twice',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');const {readFileSync}=await import('node:fs');
  const create=await factory(),db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;`);
    await db.exec(readFileSync(new URL('../server/sql/004-browser-pairing.sql',import.meta.url),'utf8'));
    await db.query('INSERT INTO buffer_pair_private.config VALUES(true,$1,$2)',['a'.repeat(64),serviceUserId]);
    const names={buffer_pair_create:['p_key','p_challenge','p_code','p_browser'],buffer_pair_approve:['p_key','p_code','p_owner','p_sealed'],buffer_pair_consume:['p_key','p_challenge','p_browser']};
    const store=create({envId,serviceUserId,backendKey:'a'.repeat(64),encryptionKey:'b'.repeat(64),hashSecret:'c'.repeat(64),getAccessToken:async()=>token('authenticated'),fetchImpl:async(url,options)=>{
      const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body),fields=names[name];assert.ok(fields);
      await db.exec('BEGIN');
      try {
        await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:serviceUserId,role:'authenticated'})]);await db.exec('SET LOCAL ROLE authenticated');
        const response=await db.query(`SELECT public.${name}(${fields.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,fields.map(field=>body[field]));
        await db.exec('COMMIT');return new Response(JSON.stringify(response.rows[0].result));
      } catch(error){await db.exec('ROLLBACK');throw error;}
    }});
    assert.equal(await store.create(input),true);assert.equal(await store.consume(input),null);
    assert.equal(await store.approve({code:input.code,accountId:'fixture-owner',ticket:'fixture-private-ticket'}),true);
    const saved=(await db.query('SELECT * FROM buffer_pair_private.challenges')).rows[0];
    assert.ok(!JSON.stringify(saved).includes('fixture-private-ticket'));assert.ok(!JSON.stringify(saved).includes(input.browserSecret));
    assert.equal(await store.consume({...input,browserSecret:'F'.repeat(43)}),null);
    assert.deepEqual(await store.consume(input),{accountId:'fixture-owner',ticket:'fixture-private-ticket'});
    assert.equal(await store.consume(input),null);
  } finally {await db.close();}
});
