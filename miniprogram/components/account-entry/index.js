Component({
  data:{label:'微信登录',message:'',busy:false,confirming:false},
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
        message:phase==='signed_in'?(messages[sync?.phase]||'同步尚未连接'):'',busy:false});
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
