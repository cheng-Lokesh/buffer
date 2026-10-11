// Shared browser/native transport. Credentials remain in the session adapter.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const utf8Size=text=>{let size=0;for(const char of text){const code=char.codePointAt(0);size+=code<128?1:code<2048?2:code<65536?3:4;}return size;};
const unauthorized=()=>({status:401,body:{code:'authentication_required'}});

export function createAccountSyncTransport({envId,syncUrl,session,request}={}) {
  if(typeof envId!=='string'||! /^[a-z0-9-]{1,64}$/.test(envId)
    ||typeof syncUrl!=='string'||!new RegExp(`^https://${envId}(?:-[0-9]+)?\\.ap-shanghai\\.app\\.tcloudbase\\.com/api/account/sync$`).test(syncUrl)
    ||typeof session?.status!=='function'||typeof session?.getAccessToken!=='function'||typeof request!=='function')throw Error('sync_transport_config_invalid');
  const identity=()=>{const value=session.status();return value?.phase==='signed_in'&&typeof value.accountId==='string'&&value.accountId.length>0?value.accountId:null;};
  async function send(method,body) {
    let command;
    if(method==='POST') {
      try {if(!object(body))throw Error();const text=JSON.stringify(body);if(utf8Size(text)>32768)throw Error();command=JSON.parse(text);}
      catch {throw Error('sync_command_invalid');}
    }
    const accountId=identity();if(!accountId)return unauthorized();
    let token;try {token=await session.getAccessToken();}catch {return unauthorized();}
    if(identity()!==accountId||typeof token!=='string'||! /^[A-Za-z0-9._-]{1,4096}$/.test(token))return unauthorized();
    let result;
    try {result=await request({url:syncUrl,method,headers:{Authorization:`Bearer ${token}`,...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:command}:{})});}
    catch {throw Error('sync_network_unavailable');}
    if(identity()!==accountId)return unauthorized();
    try {
      if(!Number.isInteger(result?.status)||result.status<100||result.status>599||!object(result.body))throw Error();
      const text=JSON.stringify(result.body);if(utf8Size(text)>2200000)throw Error();
      return {status:result.status,body:JSON.parse(text)};
    }catch {throw Error('sync_response_invalid');}
  }
  return {read:()=>send('GET'),write:command=>send('POST',command)};
}
