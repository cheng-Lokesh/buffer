import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../server/postgres-login-guard.js').catch(()=>null);
const events=[];
const pool={connect:async()=>({query:async(sql,params)=>{events.push({sql,params});return {rows:sql.includes('RETURNING')?[{allowed:true}]:[]};},release:()=>events.push({release:true})})};
const options={pool,scope:'test-login',hashSecret:'fixture-secret-not-real'.repeat(2),maxPerMinute:5,maxDailyRequests:100};
const create=()=>{assert.ok(module,'durable login guard is missing');return module.createPostgresLoginGuard(options);};
test('no default storage, budget or weak hashing secret is accepted',()=>{
  assert.ok(module,'durable login guard is missing');
  for(const bad of [{}, {...options,pool:null}, {...options,maxDailyRequests:0}, {...options,maxPerMinute:0}, {...options,hashSecret:'short'}, {...options,scope:'bad space'}]) assert.throws(()=>module.createPostgresLoginGuard(bad),/login_guard_config_invalid/);
});
test('trusted network identity is required; forwarded client headers are not read',async()=>{
  const guard=create();events.length=0;
  for(const context of [null,{}, {remoteAddress:'spoofed'}, {headers:{'x-forwarded-for':'127.0.0.1'}}]) assert.equal(await guard.admit(context),false);
  assert.equal(events.length,0);
});
test('budgets use a transaction and global lock; raw IP never reaches storage',async()=>{
  const guard=create();events.length=0;
  assert.equal(await guard.admit({remoteAddress:'127.0.0.1'}),true);
  assert.equal(events[0].sql,'BEGIN');
  assert.ok(events.some(e=>e.sql?.includes('pg_advisory_xact_lock')));
  assert.ok(events.some(e=>e.sql?.includes('max_daily')));
  assert.ok(events.some(e=>e.sql?.includes('max_minute')));
  assert.ok(!JSON.stringify(events).includes('127.0.0.1'));
  assert.equal(events.at(-2).sql,'COMMIT');assert.equal(events.at(-1).release,true);
});
test('database denials return false and failures rollback/release without leaking details',async()=>{
  const guard=create();events.length=0;
  const old=pool.connect;
  pool.connect=async()=>({query:async sql=>{events.push({sql});if(sql.includes('RETURNING')) return {rows:[]};return {rows:[]};},release:()=>events.push({release:true})});
  assert.equal(await guard.admit({remoteAddress:'::1'}),false);
  pool.connect=async()=>({query:async sql=>{events.push({sql});if(sql.includes('pg_advisory'))throw new Error('private-db-secret');return {rows:[]};},release:()=>events.push({release:true})});
  await assert.rejects(guard.admit({remoteAddress:'::1'}),/login_guard_unavailable/);
  assert.ok(events.some(e=>e.sql==='ROLLBACK'));assert.equal(events.at(-1).release,true);
  pool.connect=old;
});
test('replay protection is an atomic persistent insert, never a process-local map',async()=>{
  const guard=create();events.length=0;
  const digest='a'.repeat(64);
  assert.equal(await guard.consumeCode(digest),true);
  assert.ok(events.some(e=>e.sql?.includes('ON CONFLICT DO NOTHING')));
  assert.ok(events.some(e=>e.params?.includes(digest)));
  await assert.rejects(guard.consumeCode('raw-wechat-code'),/login_code_hash_invalid/);
  const old=pool.connect;
  pool.connect=async()=>({query:async()=>({rows:[]}),release:()=>{}});
  assert.equal(await guard.consumeCode(digest),false);
  pool.connect=old;
});
