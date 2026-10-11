import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('browser pairing is private, expiring, browser-bound and atomically one-use',async()=>{
  const file=new URL('../server/sql/004-browser-pairing.sql',import.meta.url);
  assert.ok(existsSync(file),'durable browser pairing migration missing');
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;`);
    const sql=readFileSync(file,'utf8');await db.exec(sql);
    const key='a'.repeat(64),challenge='b'.repeat(64),secret='c'.repeat(64),code='d'.repeat(64);
    async function rpc(name,args,owner='fixture-service',role='authenticated') {
      await db.exec('BEGIN');
      try {
        await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,role})]);
        await db.exec(`SET LOCAL ROLE ${role}`);
        const result=await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args);
        await db.exec('COMMIT');return result.rows[0].result;
      } catch(error) {await db.exec('ROLLBACK');throw error;}
    }
    const create=[key,challenge,code,secret];
    await assert.rejects(rpc('buffer_pair_create',create),/pair_denied/);
    await db.query('INSERT INTO buffer_pair_private.config VALUES(true,$1,$2)',[key,'fixture-service']);
    await assert.rejects(rpc('buffer_pair_create',create,'other-user'),/pair_denied/);
    await assert.rejects(rpc('buffer_pair_create',create,'fixture-service','anon'),/permission denied/);
    await assert.rejects(rpc('buffer_pair_create',['x',challenge,code,secret]),/pair_denied/);
    assert.equal(await rpc('buffer_pair_create',create),true);
    assert.equal(await rpc('buffer_pair_create',create),false,'collision cannot overwrite');
    assert.equal(await rpc('buffer_pair_consume',[key,challenge,secret]),null,'pending has no grant');
    assert.equal(await rpc('buffer_pair_approve',[key,code,'fixture-user','sealed-ticket']),true);
    assert.equal(await rpc('buffer_pair_approve',[key,code,'attacker','other-ticket']),false);
    assert.equal(await rpc('buffer_pair_consume',[key,challenge,'e'.repeat(64)]),null);
    assert.deepEqual(await rpc('buffer_pair_consume',[key,challenge,secret]),{accountId:'fixture-user',sealedGrant:'sealed-ticket'});
    assert.equal(await rpc('buffer_pair_consume',[key,challenge,secret]),null,'grant consumed only once');
    const expired=['f'.repeat(64),'1'.repeat(64),'2'.repeat(64)];
    assert.equal(await rpc('buffer_pair_create',[key,...expired]),true);
    await db.query("UPDATE buffer_pair_private.challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE challenge_hash=$1",[expired[0]]);
    assert.equal(await rpc('buffer_pair_approve',[key,expired[1],'fixture-user','sealed-ticket']),false);
    assert.equal(await rpc('buffer_pair_consume',[key,expired[0],expired[2]]),null);
    assert.equal(await rpc('buffer_pair_create',[key,'3'.repeat(64),'4'.repeat(64),'5'.repeat(64)]),true);
    assert.equal(await rpc('buffer_pair_approve',[key,'4'.repeat(64),'fixture-user','sealed-ticket']),true);
    await db.exec("UPDATE buffer_pair_private.challenges SET expires_at=clock_timestamp()-interval '1 second'");
    assert.equal(await rpc('buffer_pair_consume',[key,'3'.repeat(64),'5'.repeat(64)]),null,'approved grants also expire');
    assert.equal(await rpc('buffer_pair_create',[key,'6'.repeat(64),'7'.repeat(64),'8'.repeat(64)]),true);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM buffer_pair_private.challenges')).rows[0].n,1,'creation removes expired encrypted grants');
    await db.exec(`INSERT INTO buffer_pair_private.challenges(challenge_hash,code_hash,browser_hash,expires_at)
      SELECT lpad(to_hex(n),64,'0'),lpad(to_hex(n+2000),64,'0'),'${secret}',clock_timestamp()+interval '2 minutes'
      FROM generate_series(1,999) n`);
    await assert.rejects(rpc('buffer_pair_create',[key,'9'.repeat(64),'a'.repeat(64),'b'.repeat(64)]),/pair_capacity/);
    await assert.rejects(rpc('buffer_pair_create',[key,'bad',code,secret]),/pair_invalid/);
    await assert.rejects(rpc('buffer_pair_approve',[key,code,'invalid owner','ticket']),/pair_invalid/);
    await assert.rejects(rpc('buffer_pair_approve',[key,code,'fixture-user','x'.repeat(24577)]),/pair_invalid/);
    await assert.rejects(db.exec('SET ROLE authenticated; SELECT * FROM buffer_pair_private.challenges'),/permission denied/);
    await db.exec('RESET ROLE');await assert.rejects(db.exec(sql),/browser_pairing_migration_conflict/);await db.exec('ROLLBACK');
    assert.equal(await rpc('buffer_pair_consume',[key,challenge,secret]),null,'reinstall cannot resurrect grants');
    assert.equal((await db.query("SELECT has_table_privilege('authenticated','buffer_pair_private.challenges','SELECT') AS allowed")).rows[0].allowed,false);
  } finally {await db.close();}
});

test('browser pairing SQL refuses pre-existing schemas and RPCs without replacing them',async()=>{
  const file=new URL('../server/sql/004-browser-pairing.sql',import.meta.url),sql=readFileSync(file,'utf8');
  for(const collision of [
    {name:'private schema',setup:`CREATE SCHEMA buffer_pair_private; CREATE TABLE buffer_pair_private.keep_me(id integer);`,check:async db=>{
      assert.equal((await db.query("SELECT to_regclass('buffer_pair_private.keep_me') IS NOT NULL AS present")).rows[0].present,true);
      assert.equal((await db.query("SELECT to_regclass('buffer_pair_private.challenges') IS NULL AS untouched")).rows[0].untouched,true);
    }},
    {name:'public RPC',setup:`CREATE FUNCTION public.buffer_pair_create(text,text,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`,check:async db=>{
      assert.equal((await db.query("SELECT public.buffer_pair_create('a','b','c','d') AS value")).rows[0].value,true);
    }}
  ]){
    const db=new PGlite();
    try{
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
        CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;`);
      await db.exec(collision.setup);
      await assert.rejects(db.exec(sql),/browser_pairing_migration_conflict/,collision.name);await db.exec('ROLLBACK');
      await collision.check(db);
    }finally{await db.close();}
  }
});
