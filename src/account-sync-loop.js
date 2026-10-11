/** Foreground-only scheduler. It transports no facts or identity itself. */
export function createAccountSyncLoop({enabled,status,refresh,schedule=setTimeout,cancel=clearTimeout}={}){
  if([enabled,status,refresh,schedule,cancel].some(fn=>typeof fn!=='function'))throw Error('sync_loop_adapters_required');
  let active=false,running=false,timer=null,generation=0,failures=0;
  const allowed=()=>enabled()&&!['signed_out','session_expired','conflict','storage_error'].includes(status().phase);
  function plan(){
    if(!active||running||timer!==null||!allowed())return;
    const stamp=generation,delay=Math.min(60000,3000*2**Math.min(failures,5));
    timer=schedule(async()=>{
      if(stamp!==generation)return;
      timer=null;if(!active||!allowed())return;
      running=true;
      try{
        await refresh();
        if(stamp===generation)failures=['offline','unavailable'].includes(status().phase)?failures+1:0;
      }catch{if(stamp===generation)failures++;}
      finally{running=false;plan();}
    },delay);
  }
  function start(){if(!active){active=true;generation++;failures=0;}plan();}
  function stop(){active=false;generation++;failures=0;if(timer!==null)cancel(timer);timer=null;}
  return {start,stop};
}
