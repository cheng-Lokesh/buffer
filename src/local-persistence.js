export function persistJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error?.message || 'unknown_storage_error') };
  }
}
