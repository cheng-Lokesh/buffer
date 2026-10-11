// Reset only transient/display state, never persistent facts or backups.
function withAccountView(definition,accountApp,actionNames=[]){
  const initial=JSON.parse(JSON.stringify(definition.data||{})),scopes=new WeakMap(),subscriptions=new WeakMap();
  const app=()=>accountApp||(typeof getApp==='function'?getApp():null);
  const status=()=>app()?app().accountStatus():{phase:'signed_out'};
  const scope=()=>{const value=status();return JSON.stringify([value.phase,value.accountId||null,value.viewGeneration||0]);};
  const reset=page=>{page.setData(JSON.parse(JSON.stringify(initial)));scopes.set(page,scope());};
  const show=definition.onShow;
  const unsubscribe=page=>{subscriptions.get(page)?.();subscriptions.delete(page);};
  const subscribe=page=>{
    if(subscriptions.has(page)||typeof app()?.subscribeAccountSync!=='function')return;
    subscriptions.set(page,app().subscribeAccountSync(()=>{
      if(scopes.get(page)!==scope())reset(page);
      page.refresh?.({preserveDrafts:true});
    }));
  };
  const pending=new WeakSet(),actions={};
  for(const name of actionNames){const action=definition[name];actions[name]=async function(...args){
    if(pending.has(this))return;
    pending.add(this);try{return await action.apply(this,args);}finally{pending.delete(this);}
  };}
  return {...definition,...actions,
    onShow(){const current=scope();if(scopes.get(this)!==current)reset(this);subscribe(this);return typeof show==='function'?show.call(this):this.refresh?.();},
    onHide(){unsubscribe(this);return definition.onHide?.call(this);},
    onUnload(){unsubscribe(this);return definition.onUnload?.call(this);},
    onAccountChange(){reset(this);return this.refresh?.();}
  };
}
module.exports={withAccountView};
