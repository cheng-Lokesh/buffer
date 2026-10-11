// Browser only: proof and challenge live in this closure, never device storage,
// the URL, analytics or rendered markup. The returned ticket still must pass the
// official provider signin/profile verification in browser-account-session.
export function createBrowserPairingClient({baseUrl,request,onChallenge,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),randomBytes=()=>crypto.getRandomValues(new Uint8Array(32))}={}){
  try {const url=new URL(baseUrl);if(url.protocol!=='https:'||url.origin!==baseUrl||[request,onChallenge,now,wait,randomBytes].some(fn=>typeof fn!=='function'))throw Error();}
  catch{throw Error('pair_client_config_invalid');}
  let generation=0,pending=null;
  const check=stamp=>{if(stamp!==generation)throw Error('pair_cancelled');};
  function cancel(){generation++;pending=null;}
  async function acquire(stamp){
    try {
      const bytes=randomBytes();if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw Error('random');
      const browserSecret=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      async function send(action,body){check(stamp);const response=await request({url:baseUrl+'/api/auth/browser/'+action,method:'POST',headers:{'content-type':'application/json'},body});check(stamp);return response;}
      const issued=await send('create',{browserSecret});
      if(issued?.status!==200||typeof issued.body?.code!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(issued.body.code)
        ||typeof issued.body?.challenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(issued.body.challenge)||issued.body.expiresIn!==120)throw Error('provider');
      const expiresAt=now()+120000;
      onChallenge({code:issued.body.code,expiresAt});
      while(now()<expiresAt){
        const consumed=await send('consume',{challenge:issued.body.challenge,browserSecret});
        if(now()>=expiresAt)throw Error('pair_expired');
        if(consumed?.status===200){
          if(typeof consumed.body?.accountId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(consumed.body.accountId)
            ||typeof consumed.body?.ticket!=='string'||!consumed.body.ticket||consumed.body.ticket.length>16384)throw Error('provider');
          return {accountId:consumed.body.accountId,ticket:consumed.body.ticket};
        }
        if(consumed?.status!==202||consumed.body?.pending!==true)throw Error('provider');
        await wait(Math.min(2000,expiresAt-now()));check(stamp);
      }
      throw Error('pair_expired');
    }catch(error){check(stamp);if(error.message==='pair_expired')throw error;throw Error('pair_unavailable');}
  }
  async function getLoginTicket(){
    if(pending)return pending;const task=acquire(++generation);pending=task;
    try{return await task;}finally{if(pending===task)pending=null;}
  }
  return {getLoginTicket,cancel};
}
