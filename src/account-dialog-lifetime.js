const saving = new WeakSet();

export function isCurrentAccountDialog(layer, getScope) {
  const current = getScope();
  return Boolean(layer?.isConnected && layer.accountScope &&
    layer.accountScope.accountId === current.accountId &&
    layer.accountScope.generation === current.generation);
}

export async function confirmAccountDialog(layer, getScope, save) {
  if (!isCurrentAccountDialog(layer, getScope)) throw Error('account_scope_changed');
  if (saving.has(layer)) throw Error('confirmation_in_progress');
  saving.add(layer);
  try {
    const result = await save();
    if (result !== false && isCurrentAccountDialog(layer, getScope)) layer.remove();
    return result;
  } finally { saving.delete(layer); }
}
