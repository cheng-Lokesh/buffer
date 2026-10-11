// Reset only transient/display state, never persistent facts or backups.
function withAccountView(definition,accountApp){
  const initial=JSON.parse(JSON.stringify(definition.data||{})),scopes=new WeakMap();
  const status=()=>accountApp?accountApp.accountStatus():typeof getApp==='function'?getApp().accountStatus():{phase:'signed_out'};
  const scope=()=>{const value=status();return JSON.stringify([value.phase,value.accountId||null,value.viewGeneration||0]);};
  const reset=page=>{page.setData(JSON.parse(JSON.stringify(initial)));scopes.set(page,scope());};
  const show=definition.onShow;
  return {...definition,
    onShow(){const current=scope();if(scopes.get(this)!==current)reset(this);return typeof show==='function'?show.call(this):this.refresh?.();},
    onAccountChange(){reset(this);return this.refresh?.();}
  };
}
module.exports={withAccountView};
