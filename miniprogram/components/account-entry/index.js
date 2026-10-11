Component({
  data:{label:'微信登录',message:'',syncActionLabel:'',browserAvailable:false,busy:false,confirming:false},
  lifetimes:{attached(){this.observeSync();this.refresh();},detached(){this.stopObservingSync();}},
  pageLifetimes:{show(){this.observeSync();this.refresh();},hide(){this.stopObservingSync();}},
  methods:{
    observeSync(){if(!this.detachSync&&typeof getApp().subscribeAccountSync==='function')this.detachSync=getApp().subscribeAccountSync(()=>this.refresh());},
    stopObservingSync(){this.detachSync?.();this.detachSync=null;},
    notifyPage(){
      try{if(typeof getCurrentPages==='function'){const pages=getCurrentPages();pages[pages.length-1]?.onAccountChange?.();}}catch{}
    },
    refresh(){
      if(this.data.confirming||this.data.busy)return;
      const phase=getApp().accountStatus().phase;
      const sync=getApp().accountSyncStatus?.();
      const messages={synced:'已同步',remote_deleted:'账号数据已删除',pending:'正在同步',offline:sync?.pendingCount?`${sync.pendingCount} 项待同步`:'离线，显示本机副本',conflict:'有变更冲突，待核对',unavailable:'同步暂不可用',session_expired:'请重新登录同步'};
      this.setData({label:phase==='signed_in'?'微信已登录':phase==='login_failed'||phase==='session_expired'?'重新登录':'微信登录',
        browserAvailable:phase==='signed_in',
        message:phase==='signed_in'?(messages[sync?.phase]||'同步尚未连接'):'',
        syncActionLabel:phase==='signed_in'?(sync?.phase==='conflict'?'核对冲突':['offline','unavailable'].includes(sync?.phase)?'重新同步':''):'',busy:false});
    },
    async authorizeBrowser(){
      if(this.data.busy||this.data.confirming)return;
      const app=getApp(),scope=app.accountStatus();if(scope.phase!=='signed_in')return;
      const same=()=>{const current=app.accountStatus();return current.phase===scope.phase&&current.accountId===scope.accountId&&current.viewGeneration===scope.viewGeneration;};
      const modal=options=>new Promise(resolve=>wx.showModal({...options,success:resolve,fail:()=>resolve({confirm:false})}));
      this.setData({confirming:true});
      try {
        const input=await modal({title:'登录网页版',editable:true,placeholderText:'输入网页上的 8 位授权码',confirmText:'下一步',cancelText:'取消'});
        if(!input.confirm||!same())return;
        const code=String(input.content||'').trim().toUpperCase();
        if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code)){wx.showToast({title:'请输入网页上的 8 位授权码',icon:'none'});return;}
        const confirmed=await modal({title:'确认网页登录',content:`授权码 ${code}\n仅为你自己打开的缓冲区网页授权。登录不会上传本机旧数据，请勿确认他人提供的授权码。`,confirmText:'确认登录',cancelText:'取消'});
        if(!confirmed.confirm||!same())return;
        this.setData({busy:true});
        await require('../../utils/browser-pairing').approveMiniBrowserLogin(wx,app,code,{confirmed:true,scope});
        wx.showToast({title:'已确认，请返回网页',icon:'none'});
      }catch{wx.showToast({title:'授权未完成，请回网页重试',icon:'none'});}
      finally{this.setData({busy:false,confirming:false});this.refresh();}
    },
    async manageSync(){
      if(this.data.busy||this.data.confirming)return;
      const app=getApp(),scope=()=>JSON.stringify(app.accountStatus());
      if(app.accountStatus().phase!=='signed_in')return;
      const stamp=scope(),sync=app.accountSyncStatus(),fingerprint=JSON.stringify(sync);
      const unchanged=()=>scope()===stamp&&JSON.stringify(app.accountSyncStatus())===fingerprint;
      const modal=options=>new Promise(resolve=>wx.showModal({...options,success:value=>resolve(value.confirm===true),fail:()=>resolve(false)}));
      this.setData({busy:true});
      try{
        if(['offline','unavailable'].includes(sync.phase)){await app.refreshAccount();return;}
        if(sync.phase!=='conflict'||!sync.conflict)return;
        const {portableToMini}=require('../../core/portable-backup'),{emptyState}=require('../../core/state');
        const {formatMoney}=require('../../utils/view');
        const describe=value=>{
          const state=value?portableToMini(value):emptyState(),money=value=>value===''||value==null?'待确认':formatMoney(value);
          return `余额 ${money(state.cash.balance)}，保留 ${money(state.cash.reserve)}，每日 ${money(state.cash.daily)}\n条件 ${state.cashReality.conditions.length} 项，变化 ${state.cashReality.events.length} 条`;
        };
        const approved=await modal({title:'核对两个版本',content:`本机\n${describe(sync.state)}\n云端\n${describe(sync.conflict.state)}\n本机有 ${sync.pendingCount} 项待同步变更。先复制备份，再选择云端版本。`,confirmText:'复制备份',cancelText:'暂不处理'});
        if(!approved)return;
        if(!unchanged())throw Error('scope_changed');
        const backup=require('../../utils/account-store').exportText();
        if(!backup)throw Error('backup_unavailable');
        await new Promise((resolve,reject)=>wx.setClipboardData({data:backup,success:resolve,fail:()=>reject(Error('backup_failed'))}));
        if(!unchanged())throw Error('scope_changed');
        const adopt=await modal({title:'使用云端版本？',content:`本机备份已复制到剪贴板，请先保存到只有你能访问的位置。继续将移除本机 ${sync.pendingCount} 项待同步变更，显示云端版本；云端数据不会删除。`,confirmText:'使用云端',cancelText:'保留本机'});
        if(!adopt)return;
        if(!unchanged())throw Error('scope_changed');
        app.acceptCloudAccountVersion({confirmed:true,discardPending:true});
      }catch{wx.showToast({title:'未完成处理，原变更已保留',icon:'none'});}
      finally{this.setData({busy:false});this.refresh();}
    },
    async activate(){
      if(this.data.busy||this.data.confirming)return;
      const app=getApp();const signedIn=app.accountStatus().phase==='signed_in';
      this.setData({confirming:true});
      const approved=await new Promise(resolve=>wx.showModal({
        title:signedIn?'退出微信登录？':'使用微信登录',
        content:signedIn?'退出账号不会清除本机数据。':'微信身份用于识别你的账号。登录不会上传本机现金数据。',
        confirmText:signedIn?'退出登录':'登录',cancelText:'取消',
        success:result=>resolve(result.confirm===true),fail:()=>resolve(false)
      }));
      this.setData({confirming:false});
      if(!approved)return;
      if(signedIn){app.logoutAccount();this.notifyPage();this.refresh();return;}
      this.setData({busy:true,label:'正在登录',message:''});
      try{await app.loginWechat();this.notifyPage();this.setData({busy:false});this.refresh();}
      catch{this.setData({busy:false,label:'重新登录',message:'登录未完成，请重试'});}
    }
  }
});
