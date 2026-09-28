const ACCESS_PATH = '/__pilot-access';
const COOKIE_NAME = 'buffer_pilot_access';
const SESSION_MS = 12 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesFromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function sameSecret(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let different = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    different |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return different === 0;
}

function readCookie(request, name) {
  const target = `${name}=`;
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const value = part.trim();
    if (value.startsWith(target)) return value.slice(target.length);
  }
  return '';
}

function safeNext(value) {
  const target = String(value || '/');
  return target.startsWith('/') && !target.startsWith('//') ? target : '/';
}

function accessPage(next, invalid = false) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buffer 私有试用</title><main><h1>Buffer 私有试用</h1><p>${invalid ? '访问密码不正确，请重试。' : '请输入访问密码。'}</p><form method="post" action="${ACCESS_PATH}"><input type="hidden" name="next" value="${encodeURIComponent(safeNext(next))}"><label>访问密码 <input name="password" type="password" autocomplete="current-password" required autofocus></label><button type="submit">进入</button></form></main></html>`;
}

function privateResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers }
  });
}

async function issueCookie(secret) {
  const payload = `v1.${Date.now() + SESSION_MS}`;
  const signature = base64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

async function validCookie(value, secret) {
  const [version, expiresAt, signature, extra] = String(value || '').split('.');
  if (version !== 'v1' || !/^\d{13}$/.test(expiresAt || '') || extra || !signature) return false;
  if (Number(expiresAt) <= Date.now()) return false;
  try {
    const expected = await hmac(`${version}.${expiresAt}`, secret);
    const supplied = bytesFromBase64Url(signature);
    return supplied.length === expected.length && await crypto.subtle.verify(
      'HMAC',
      await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']),
      supplied,
      encoder.encode(`${version}.${expiresAt}`)
    );
  } catch {
    return false;
  }
}

export async function middleware(context) {
  const request = context.request;
  const secret = String(context.env?.PILOT_ACCESS_PASSWORD || '');
  if (!secret) return privateResponse('private_pilot_not_configured', 503, { 'content-type': 'text/plain; charset=utf-8' });

  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next') || `${url.pathname}${url.search}`);
  if (url.pathname === ACCESS_PATH && request.method === 'GET') {
    return privateResponse(accessPage(next), 200, { 'content-type': 'text/html; charset=utf-8' });
  }
  if (url.pathname === ACCESS_PATH && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const submitted = typeof form?.get('password') === 'string' ? form.get('password') : '';
    const destination = safeNext(form?.get('next'));
    if (!await sameSecret(String(submitted), secret)) {
      return privateResponse(accessPage(destination, true), 401, { 'content-type': 'text/html; charset=utf-8' });
    }
    const session = await issueCookie(secret);
    return privateResponse('', 303, {
      location: destination,
      'set-cookie': `${COOKIE_NAME}=${session}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`
    });
  }

  if (await validCookie(readCookie(request, COOKIE_NAME), secret)) return context.next();
  return privateResponse('', 303, { location: `${ACCESS_PATH}?next=${encodeURIComponent(next)}` });
}

export const config = { matcher: ['/:path*'] };
