import test from 'node:test';
import assert from 'node:assert/strict';

async function fixture(){
  const module=await import('../src/account-sync-loop.js').catch(()=>null);
  assert.equal(typeof module?.createAccountSyncLoop,'function');
  let enabled=true,phase='synced',calls=0,release=null;const timers=new Map();let next=0;
  const loop=module.createAccountSyncLoop({enabled:()=>enabled,status:()=>({phase}),refresh:async()=>{calls++;if(release)await new Promise(resolve=>release=resolve);},
    schedule:(fn,delay)=>{timers.set(++next,{fn,delay});return next;},cancel:id=>timers.delete(id)});
  return {loop,timers,get calls(){return calls;},setEnabled:value=>enabled=value,setPhase:value=>phase=value,
    defer:()=>{release=true;},release:()=>{const fn=release;release=null;fn();},async tick(){const [id,timer]=timers.entries().next().value;timers.delete(id);return timer.fn();}};
}
test('visible authenticated sync loop reads every three seconds without overlap and stops when disabled',async()=>{
  const f=await fixture();f.loop.start();f.loop.start();assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].delay,3000);
  await f.tick();assert.equal(f.calls,1);assert.equal(f.timers.size,1);
  f.defer();const pending=f.tick();f.loop.start();assert.equal(f.timers.size,0);f.loop.stop();f.release();await pending;assert.equal(f.timers.size,0);
  f.setEnabled(false);f.loop.start();assert.equal(f.timers.size,0);
});
test('unavailable reads back off to a one-minute ceiling and successful reads reset cadence',async()=>{
  const f=await fixture();f.setPhase('unavailable');f.loop.start();await f.tick();assert.equal([...f.timers.values()][0].delay,6000);
  for(let i=0;i<6;i++)await f.tick();assert.equal([...f.timers.values()][0].delay,60000);
  f.setPhase('synced');await f.tick();assert.equal([...f.timers.values()][0].delay,3000);f.loop.stop();
});
test('conflict and expired sessions halt polling until an explicit lifecycle restart',async()=>{
  const f=await fixture();f.loop.start();f.setPhase('conflict');await f.tick();assert.equal(f.calls,0);assert.equal(f.timers.size,0);
  f.setPhase('synced');f.loop.start();f.setPhase('session_expired');await f.tick();assert.equal(f.calls,0);assert.equal(f.timers.size,0);
});
