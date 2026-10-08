import {createServer} from 'node:http';

/** HTTP host only: the caller supplies the real login runtime and deliberately
 * starts listening. Default site server and public routes are not changed.
 * Do not interpret client forwarding headers as an authenticated network source.
 * A proxied cloud deployment must separately verify its source-IP contract. */
export function createWechatLoginHttpServer({allowedOrigin,handleLogin}={}) {
  try {
    const url=new URL(allowedOrigin);
    if(url.protocol!=='https:'||url.origin!==allowedOrigin||typeof handleLogin!=='function')throw Error();
  }catch{throw Error('login_http_config_invalid');}
  const error=(status,code)=>new Response(JSON.stringify({code}),{status,headers:{'content-type':'application/json; charset=utf-8'}});
  return createServer(async(nodeRequest,nodeResponse)=>{
    let response,originAllowed=false;
    try {
      const url=new URL(nodeRequest.url,allowedOrigin);
      const origin=nodeRequest.headers.origin;
      if(url.origin!==allowedOrigin||url.pathname!=='/api/auth/wechat')response=error(404,'not_found');
      else if(url.search)response=error(400,'query_not_allowed');
      else if(origin!==undefined&&origin!==allowedOrigin)response=error(403,'origin_denied');
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
    }catch{response=error(503,'login_unavailable');}
    try {
      const headers=Object.fromEntries(response.headers.entries());
      // A supplied adapter cannot widen CORS or set an unintended shared cookie.
      for(const key of Object.keys(headers))if(key.startsWith('access-control-')||key==='set-cookie')delete headers[key];
      if(originAllowed){headers['access-control-allow-origin']=allowedOrigin;
        if(response.status===204){headers['access-control-allow-methods']='POST';headers['access-control-allow-headers']='content-type';}}
      headers['cache-control']='no-store';headers['vary']='Origin';headers['x-content-type-options']='nosniff';
      nodeResponse.writeHead(response.status,headers);nodeResponse.end(Buffer.from(await response.arrayBuffer()));
    }catch{nodeResponse.destroy();}
  });
}
