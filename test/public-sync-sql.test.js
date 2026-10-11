import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=new URL('../server/sql/003-account-sync.sql',import.meta.url);
test('durable account RPCs enforce ownership, atomic CAS, receipts, tombstones and private permissions',async()=>{
  assert.ok(existsSync(migration),'financial sync SQL missing');
  const db=new PGlite();
  try{
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;`);
    const sql=readFileSync(migration,'utf8');await db.exec(sql);
    const key='a'.repeat(64),id='fixture-operation-0001';
    async function as(owner,statement,params=[],role='authenticated'){
      await db.exec('BEGIN');try{
        await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,role})]);
        await db.exec(`SET LOCAL ROLE ${role}`);const result=await db.query(statement,params);await db.exec('COMMIT');return result.rows[0]?.result;
      }catch(error){await db.exec('ROLLBACK');throw error;}
    }
    const read='SELECT public.buffer_sync_read($1) AS result';
    await assert.rejects(as('fixture-user',read,[key]),/sync_denied/);
    await db.query('INSERT INTO buffer_sync_private.config(singleton,backend_key,service_user_id) VALUES(true,$1,$2)',[key,'fixture-service']);
    await assert.rejects(as('fixture-service',read,[key]),/sync_denied/);
    await assert.rejects(as('fixture-user',read,['b'.repeat(64)]),/sync_denied/);
    await assert.rejects(as('fixture-user',read,[key],'anon'),/permission denied/);
    await assert.rejects(as('fixture-user','SELECT * FROM buffer_sync_private.accounts'),/permission denied/);
    assert.deepEqual(await as('fixture-user',read,[key]),{revision:0,deletionGeneration:0,state:null});
    const commit='SELECT public.buffer_sync_commit($1,$2,$3,$4,$5,$6,$7) AS result';
    const state={cashReality:{conditions:[]}},next={revision:1,deletionGeneration:0,state};
    assert.equal(await as('fixture-user',commit,[key,0,0,next,id,'c'.repeat(64),next]),true);
    assert.deepEqual(await as('fixture-user',read,[key]),next);
    assert.deepEqual(await as('other-user',read,[key]),{revision:0,deletionGeneration:0,state:null});
    const receipt='SELECT public.buffer_sync_receipt($1,$2,$3,$4,$5) AS result';
    assert.deepEqual(await as('fixture-user',receipt,[key,1,0,0,id]),{stale:false,receipt:{digest:'c'.repeat(64),result:next}});
    assert.deepEqual(await as('other-user',receipt,[key,0,0,0,id]),{stale:false,receipt:null});
    assert.deepEqual(await as('fixture-user',receipt,[key,0,0,0,id]),{stale:true});
    assert.equal(await as('fixture-user',commit,[key,0,0,next,id,'c'.repeat(64),next]),false);
    const invalid={revision:2,deletionGeneration:0,state:{broken:true}};
    await assert.rejects(as('fixture-user',commit,[key,1,0,invalid,id,'d'.repeat(64),invalid]),/duplicate key/);
    assert.deepEqual(await as('fixture-user',read,[key]),next,'failed receipt must roll back snapshot');
    const deleted={revision:2,deletionGeneration:1,state:null},deleteId='fixture-delete-0001';
    assert.equal(await as('fixture-user',commit,[key,1,0,deleted,deleteId,'e'.repeat(64),deleted]),true);
    assert.deepEqual(await as('fixture-user',read,[key]),deleted);
    assert.deepEqual(await as('fixture-user',receipt,[key,2,1,0,id]),{stale:false,receipt:null});
    assert.deepEqual(await as('fixture-user',receipt,[key,2,1,0,deleteId]),{stale:false,receipt:{digest:'e'.repeat(64),result:deleted}});
    assert.equal(await as('fixture-user',commit,[key,1,0,next,id,'c'.repeat(64),next]),false);
    await db.exec(sql);assert.deepEqual(await as('fixture-user',read,[key]),deleted,'reinstall must preserve tombstone');
    for(const bad of [{revision:3,deletionGeneration:3,state:null},{revision:3,deletionGeneration:1,state:[]},{revision:3,deletionGeneration:1,state:null}])
      await assert.rejects(as('fixture-user',commit,[key,2,1,bad,'fixture-invalid-0001','f'.repeat(64),bad]),/sync_invalid/);
  }finally{await db.close();}
});
