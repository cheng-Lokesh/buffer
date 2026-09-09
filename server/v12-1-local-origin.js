function headerValue(headers, name) {
  if (typeof headers?.get === 'function') return headers.get(name);
  return headers?.[name] ?? headers?.[name.toLowerCase()] ?? null;
}

export function resolveAllowedRequestOrigin(headers) {
  const host = String(headerValue(headers, 'host') || '').trim();
  if (!host || /[\s\\/]/.test(host)) return null;
  let localOrigin;
  try {
    const local = new URL(`http://${host}`);
    if (local.host !== host) return null;
    localOrigin = local.origin;
  } catch {
    return null;
  }
  const supplied = String(headerValue(headers, 'origin') || '').trim();
  if (!supplied) return localOrigin;
  try {
    const origin = new URL(supplied);
    if (origin.protocol !== 'http:' || origin.host !== host || origin.pathname !== '/') return null;
    return origin.origin;
  } catch {
    return null;
  }
}
