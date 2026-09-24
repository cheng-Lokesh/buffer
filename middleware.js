const ACCESS_PATH = '/__pilot-access';
const COOKIE_NAME = 'buffer_pilot_access';
const SESSION_MS = 12 * 60 * 60 * 1000;
const encoder = new TextEncoder();

const page = (next, invalid = false) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buffer 私有试用</title><main><h1>Buffer 私有试用</h1><p>${invalid ? '访问密码不正确，请重试。' : '请输入访问密码。'}</p><form method="post" action="${ACCESS_PATH}"><input type="hidden" name="next" value="${encodeURIComponent(next)}"><label>访问密码 <input name="password" type="password" autocomplete="current-password" required autofocus></label><button type="submit">进入</button></form></main></html>`;

function nextPath(value) {
  const candidate = String(value || '/');
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
}

function bytesToBase64Url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), (character) => character.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function sameSecret(left, right) {
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(left)), crypto.subtle.digest('SHA-256', encoder.encode(right))]);
  const leftBytes = new Uint8Array(a);
  const rightBytes = new Uint8Array(b);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}

async function validSession(value, secret) {
  const [version, expiresAt, signature, extra] = String(value || '').split('.');
  if (version !== 'v1' || !/^\d{13}$/.test(expiresAt || '') || extra || Number(expiresAt) <= Date.now()) return false;
  try {
    const expected = await hmac(`${version}.${expiresAt}`, secret);
    const supplied = base64UrlToBytes(signature);
    if (supplied.length !== expected.length) return false;
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, supplied, encoder.encode(`${version}.${expiresAt}`));
  } catch { return false; }
}

function cookie(request) {
  return String(request.headers.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || '';
}

export async function middleware(context) {
  const secret = String(context.env?.PILOT_ACCESS_PASSWORD || '');
  if (!secret) return new Response('private_pilot_not_configured', { status: 503 });
  const url = new URL(context.request.url);
  const next = nextPath(url.searchParams.get('next') || `${url.pathname}${url.search}`);
  if (url.pathname === ACCESS_PATH && context.request.method === 'GET') return new Response(page(next), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  if (url.pathname === ACCESS_PATH && context.request.method === 'POST') {
    const form = await context.request.formData().catch(() => null);
    const submitted = String(form?.get('password') || '');
    const destination = nextPath(form?.get('next'));
    if (!await sameSecret(submitted, secret)) return new Response(page(destination, true), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    const payload = `v1.${Date.now() + SESSION_MS}`;
    const token = `${payload}.${bytesToBase64Url(await hmac(payload, secret))}`;
    return new Response(null, { status: 303, headers: { location: destination, 'set-cookie': `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`, 'cache-control': 'no-store' } });
  }
  if (await validSession(cookie(context.request), secret)) {
    if (url.pathname === '/api/reality/parse') return handleRealityParserRequest(context.request, context.env);
    return context.next();
  }
  return new Response(null, { status: 303, headers: { location: `${ACCESS_PATH}?next=${encodeURIComponent(next)}`, 'cache-control': 'no-store' } });
}

export const config = { matcher: ['/:path*'] };
import { handleRealityParserRequest } from './server/v12-1-deepseek.js';
