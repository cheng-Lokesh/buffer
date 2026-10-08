import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=new URL('../server/sql/002-login-rpc.sql',import.meta.url);
test('restricted RPC SQL executes in PostgreSQL and enforces identity, limits, replay and table isolation',async()=>{
  assert.ok(existsSync(migration),'restricted RPC migration is missing');
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated,anon;`);
    await db.exec(readFileSync(new URL('../server/sql/001-login-guard.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(migration,'utf8'));
    const claims={role:'authenticated',sub:'fixture-service'};
    async function as(role,claim,sql,params=[]) {
      await db.exec('BEGIN');
      try {await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(claim)]);await db.exec(`SET LOCAL ROLE ${role}`);return await db.query(sql,params);}
      finally {await db.exec('ROLLBACK');}
    }
    const admit="SELECT public.buffer_login_admit('fixture-login',$1) AS allowed";
    await assert.rejects(as('authenticated',claims,admit,['a'.repeat(64)]),/login_guard_denied/);
    await db.query('INSERT INTO buffer_auth_private.login_rpc_config(scope,service_user_id,max_per_minute,max_daily_requests) VALUES($1,$2,$3,$4)',['fixture-login','fixture-service',2,3]);
    await assert.rejects(as('anon',{role:'anon',sub:'fixture-service'},admit,['a'.repeat(64)]),/permission denied/);
    await assert.rejects(as('authenticated',{role:'authenticated',sub:'other'},admit,['a'.repeat(64)]),/login_guard_denied/);
    await assert.rejects(as('authenticated',claims,'SELECT * FROM buffer_auth_private.login_codes'),/permission denied/);
    await assert.rejects(as('authenticated',claims,admit,['raw-address']),/login_guard_denied/);
    // Commit these requests: the denied/rolled-back probes above must not count.
    async function committed(sql,params) {
      await db.exec('BEGIN');
      try {await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);await db.exec('SET LOCAL ROLE authenticated');const r=await db.query(sql,params);await db.exec('COMMIT');return r.rows[0].allowed;}
      catch(e){await db.exec('ROLLBACK');throw e;}
    }
    assert.equal(await committed(admit,['a'.repeat(64)]),true);
    assert.equal(await committed(admit,['a'.repeat(64)]),true);
    assert.equal(await committed(admit,['a'.repeat(64)]),false);
    assert.equal(await committed(admit,['b'.repeat(64)]),false);
    const consume="SELECT public.buffer_login_consume('fixture-login',$1) AS allowed";
    assert.equal(await committed(consume,['c'.repeat(64)]),true);
    assert.equal(await committed(consume,['c'.repeat(64)]),false);
    await assert.rejects(as('authenticated',claims,consume,['raw-code']),/login_guard_denied/);
    await assert.rejects(as('authenticated',claims,"UPDATE buffer_auth_private.login_rpc_config SET max_daily_requests=9999"),/permission denied/);
    // Reapplying migration must not reset counters or reopen permissions.
    await db.exec(readFileSync(migration,'utf8'));
    assert.equal(await committed(consume,['c'.repeat(64)]),false);
  } finally {await db.close();}
});
