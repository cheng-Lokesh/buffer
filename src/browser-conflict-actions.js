const clone = value => JSON.parse(JSON.stringify(value));

export function createBrowserConflictActions({getScope,getSync,downloadBackup,confirm,accept}={}) {
  if ([getScope,getSync,downloadBackup,confirm,accept].some(value=>typeof value!=='function')) throw Error('conflict_actions_config_invalid');
  let resolving=false,backupReady=false;
  const capture=()=>{
    const scope=getScope(),sync=getSync();
    if(!scope?.accountId||!Number.isSafeInteger(scope.generation)||sync?.phase!=='conflict'||!sync.conflict||!Number.isSafeInteger(sync.pendingCount)||sync.pendingCount<1)throw Error('conflict_unavailable');
    return {scope:clone(scope),revision:sync.revision,pendingCount:sync.pendingCount,conflict:clone(sync.conflict)};
  };
  const unchanged=snapshot=>{
    const now=capture();
    if(JSON.stringify(now.scope)!==JSON.stringify(snapshot.scope))throw Error('account_scope_changed');
    if(now.revision!==snapshot.revision||now.pendingCount!==snapshot.pendingCount||JSON.stringify(now.conflict)!==JSON.stringify(snapshot.conflict))throw Error('conflict_changed');
    return now;
  };
  const expected=capture();
  return {
    downloadLocalBackup(){
      unchanged(expected);downloadBackup();unchanged(expected);backupReady=true;return true;
    },
    async adoptCloud(){
      if(resolving)throw Error('conflict_resolution_in_progress');
      if(!backupReady)throw Error('conflict_backup_required');
      resolving=true;
      try{
        const snapshot=expected;
        unchanged(snapshot);
        const approved=await confirm({pendingCount:snapshot.pendingCount,scope:clone(snapshot.scope)});
        if(!approved)return false;
        unchanged(snapshot);
        return await accept({confirmed:true,discardPending:true,scope:clone(snapshot.scope)});
      }finally{resolving=false;}
    }
  };
}
