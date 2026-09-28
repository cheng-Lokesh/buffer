import test from 'node:test';
import assert from 'node:assert/strict';
import { middleware } from '../middleware.js';

const protectedEnv = { PILOT_ACCESS_PASSWORD: 'test-only-password' };
const passthrough = () => new Response('private-product', { status: 200 });

test('private pilot fails closed until its access password exists', async () => {
  const response = await middleware({
    request: new Request('https://buffer.example/'),
    env: {},
    next: passthrough
  });
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'private_pilot_not_configured');
});

test('anonymous static and API requests are redirected to the same password gate', async () => {
  const response = await middleware({
    request: new Request('https://buffer.example/api/reality/parse?test=1'),
    env: protectedEnv,
    next: passthrough
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/__pilot-access?next=%2Fapi%2Freality%2Fparse%3Ftest%3D1');
});

test('correct password issues an HttpOnly signed cookie that alone unlocks the full site', async () => {
  const login = await middleware({
    request: new Request('https://buffer.example/__pilot-access?next=%2F', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=test-only-password&next=%2F'
    }),
    env: protectedEnv,
    next: passthrough
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('location'), '/');
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie || '', /buffer_pilot_access=/);
  assert.match(cookie || '', /HttpOnly/);
  assert.match(cookie || '', /Secure/);
  assert.doesNotMatch(cookie || '', /test-only-password/);

  const allowed = await middleware({
    request: new Request('https://buffer.example/api/reality/parse', { headers: { cookie } }),
    env: protectedEnv,
    next: passthrough
  });
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), 'private-product');
});

test('incorrect password and tampered cookies never reach the product', async () => {
  const failedLogin = await middleware({
    request: new Request('https://buffer.example/__pilot-access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=wrong'
    }),
    env: protectedEnv,
    next: passthrough
  });
  assert.equal(failedLogin.status, 401);

  const denied = await middleware({
    request: new Request('https://buffer.example/', { headers: { cookie: 'buffer_pilot_access=tampered' } }),
    env: protectedEnv,
    next: passthrough
  });
  assert.equal(denied.status, 303);
});
