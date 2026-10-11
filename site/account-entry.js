import {createBrowserAccountRuntime,ACCOUNT_SERVER} from '../src/browser-account-runtime.js';
import {createBrowserPairingClient} from '../src/browser-pairing-client.js';

async function request(input){
  const response=await fetch(input.url,{method:input.method,headers:input.headers,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),...(input.body?{body:JSON.stringify(input.body)}:{})});
  if(!response.body)throw Error('account_response_invalid');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2200000)throw Error('account_response_invalid');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return {status:response.status,body:JSON.parse(new TextDecoder().decode(bytes))};
}
export function mountSiteAccountEntry({modal,onChange}){
  const button=document.querySelector('[data-account-entry]');let layer=null;
  const pairing=createBrowserPairingClient({baseUrl:ACCOUNT_SERVER,request,onChallenge:value=>{
    if(!layer?.isConnected){pairing.cancel();return;}
    layer.querySelector('[data-code]').textContent=value.code;
    layer.querySelector('[data-account-message]').textContent='在缓冲区小程序点击“登录网页版”，输入此授权码并确认。两分钟内有效。';
  }});
  const messages={synced:'已同步',pending:'待同步',offline:'离线副本',conflict:'待核对冲突',unavailable:'同步未连接',remote_deleted:'数据已删除',session_expired:'需要重新登录'};
  const runtime=createBrowserAccountRuntime({storage:localStorage,getLoginTicket:pairing.getLoginTicket,request,enabled:()=>!document.hidden,onChange:view=>{
    button.textContent=view.auth.phase==='signed_in'?`账号 · ${messages[view.sync.phase]||'连接中'}`:'微信登录';
    onChange(view);
  }});
  button.addEventListener('click',()=>{
    if(runtime.status().auth.phase==='signed_in'){
      const current=runtime.scope();
      layer=modal('<header><h2>账号</h2><button type="button" data-close aria-label="关闭">×</button></header><p data-account-message></p><div class="live-actions"><button type="button" data-retry>重新同步</button><button type="button" data-logout>退出账号</button><button type="button" data-delete>删除账号数据</button></div>','账号');
      layer.querySelector('[data-account-message]').textContent=messages[runtime.status().sync.phase]||'正在连接';
      layer.querySelector('[data-retry]').onclick=async()=>{try{await runtime.refresh();layer.querySelector('[data-account-message]').textContent=messages[runtime.status().sync.phase]||'正在连接';}catch{}};
      layer.querySelector('[data-logout]').onclick=()=>{if(confirm('退出账号，不删除本机或云端数据。')){pairing.cancel();runtime.logout();layer.remove();}};
      layer.querySelector('[data-delete]').onclick=async()=>{
        if(!confirm('删除当前账号在云端的全部数据，并同步到其他设备。本机未上传的旧数据不受影响。请先导出备份。是否继续？'))return;
        try{const result=await runtime.deleteData({confirmed:true,scope:current});layer.querySelector('[data-account-message]').textContent=result.phase==='synced'&&result.pendingCount===0?'账号数据已删除':'删除尚未同步，请保持连接';}
        catch{layer.querySelector('[data-account-message]').textContent='删除未完成，原数据未改变';}
      };
      return;
    }
    layer=modal('<header><h2>使用微信登录</h2><button type="button" data-close aria-label="关闭">×</button></header><p>登录后显示这个账号的数据，不会自动上传本机旧数据。</p><div class="live-confirm"><strong data-code></strong><p data-account-message>点击下方按钮获取授权码。</p></div><footer><button class="live-primary" type="button" data-login>获取授权码</button></footer>','微信登录');
    const activeLayer=layer;
    const observer=new MutationObserver(()=>{if(!activeLayer.isConnected){observer.disconnect();pairing.cancel();if(runtime.status().auth.phase==='signing_in')runtime.logout();}});
    observer.observe(document.body,{childList:true});
    layer.querySelector('[data-login]').onclick=async event=>{
      event.currentTarget.disabled=true;const message=activeLayer.querySelector('[data-account-message]');message.textContent='正在连接';
      try{await runtime.login();if(activeLayer.isConnected)activeLayer.remove();}
      catch{if(activeLayer.isConnected){message.textContent='登录未完成。云端登录尚未启用或暂不可用，请稍后重试。';activeLayer.querySelector('[data-login]').disabled=false;}}
    };
  });
  document.addEventListener('visibilitychange',()=>document.hidden?runtime.hide():runtime.show());
  window.addEventListener('online',()=>runtime.show());
  window.addEventListener('pagehide',()=>{pairing.cancel();runtime.hide();});
  return runtime;
}
