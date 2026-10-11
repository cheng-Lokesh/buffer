import {createServer} from 'node:http';

/** HTTP host only: the caller supplies the real login runtime and deliberately
 * starts listening. Default site server and public routes are not changed.
 * Do not interpret client forwarding headers as an authenticated network source.
 * A proxied cloud deployment must separately verify its source-IP contract. */
export function createWechatLoginHttpServer({allowedOrigin,handleLogin,handleSync}={}) {
  try {
    const url=new URL(allowedOrigin);
    if(url.protocol!=='https:'||url.origin!==allowedOrigin||typeof handleLogin!=='function'||(handleSync!==undefined && typeof handleSync!=='function'))throw Error();
  }catch{throw Error('login_http_config_invalid');}
  const error=(status,code)=>new Response(JSON.stringify({code}),{status,headers:{'content-type':'application/json; charset=utf-8'}});
  return createServer(async(nodeRequest,nodeResponse)=>{
    let response,originAllowed=false,isSync=false;
    try {
      const url=new URL(nodeRequest.url,allowedOrigin);
      const origin=nodeRequest.headers.origin;
      isSync=url.pathname==='/api/account/sync' && typeof handleSync==='function';
      if(url.origin!==allowedOrigin||(!isSync && url.pathname!=='/api/auth/wechat'))response=error(404,'not_found');
      else if(url.search)response=error(400,'query_not_allowed');
      else if(origin!==undefined&&origin!==allowedOrigin)response=error(403,'origin_denied');
      else if(isSync){
        if(nodeRequest.method==='OPTIONS') {
          const requested=(nodeRequest.headers['access-control-request-headers']||'').toLowerCase().split(',').map(item=>item.trim());
          if(origin!==allowedOrigin||!['GET','POST'].includes(nodeRequest.headers['access-control-request-method'])
            ||!requested.includes('authorization')||requested.some(item=>!['authorization','content-type'].includes(item))||new Set(requested).size!==requested.length)response=error(403,'origin_denied');
          else {originAllowed=true;response=new Response(null,{status:204});}
        } else if(!['GET','POST'].includes(nodeRequest.method))response=error(405,'method_not_allowed');
        else if(!/^Bearer \S+$/.test(nodeRequest.headers.authorization||''))response=error(401,'authentication_required');
        else if(nodeRequest.method==='POST' && !/^application\/json(?:\s*;|$)/i.test(nodeRequest.headers['content-type']||''))response=error(415,'json_required');
        else if(nodeRequest.headers['content-length']&&(!/^\d+$/.test(nodeRequest.headers['content-length'])||Number(nodeRequest.headers['content-length'])>32768))response=error(413,'request_too_large');
        else {
          const request=new Request(url,{method:nodeRequest.method,headers:nodeRequest.headers,...(nodeRequest.method==='POST'?{body:nodeRequest,duplex:'half'}:{})});
          response=await handleSync(request);
          if(!(response instanceof Response))throw Error();
          originAllowed=origin===allowedOrigin;
        }
      }
      else if(nodeRequest.method==='OPTIONS'){
        if(origin!==allowedOrigin||nodeRequest.headers['access-control-request-method']!=='POST'
          ||!/^content-type$/i.test(nodeRequest.headers['access-control-request-headers']||''))response=error(403,'origin_denied');
        else{originAllowed=true;response=new Response(null,{status:204,headers:{'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});}
      }else if(nodeRequest.method!=='POST')response=error(405,'method_not_allowed');
      else if(!/^application\/json(?:\s*;|$)/i.test(nodeRequest.headers['content-type']||''))response=error(415,'json_required');
      else if(nodeRequest.headers['content-length']&&(!/^\d+$/.test(nodeRequest.headers['content-length'])||Number(nodeRequest.headers['content-length'])>2048))response=error(413,'request_too_large');
      else {
        const request=new Request(url,{method:'POST',headers:nodeRequest.headers,body:nodeRequest,duplex:'half'});
        response=await handleLogin(request,{remoteAddress:nodeRequest.socket.remoteAddress});
        if(!(response instanceof Response))throw Error();
        originAllowed=origin===allowedOrigin;
      }
    }catch{response=error(503,isSync?'sync_unavailable':'login_unavailable');}
    try {
      const headers=Object.fromEntries(response.headers.entries());
      // A supplied adapter cannot widen CORS or set an unintended shared cookie.
      for(const key of Object.keys(headers))if(key.startsWith('access-control-')||key==='set-cookie')delete headers[key];
      if(originAllowed){headers['access-control-allow-origin']=allowedOrigin;
        if(response.status===204){headers['access-control-allow-methods']=isSync?'GET, POST':'POST';headers['access-control-allow-headers']=isSync?'authorization, content-type':'content-type';}}
      headers['cache-control']='no-store';headers['vary']=isSync?'Origin, Authorization':'Origin';headers['x-content-type-options']='nosniff';
      nodeResponse.writeHead(response.status,headers);nodeResponse.end(Buffer.from(await response.arrayBuffer()));
    }catch{nodeResponse.destroy();}
  });
}
