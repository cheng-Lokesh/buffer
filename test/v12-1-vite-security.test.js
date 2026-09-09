import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAllowedRequestOrigin } from '../server/v12-1-local-origin.js';

test('local parser accepts only an exact same-host browser origin', () => {
  assert.equal(resolveAllowedRequestOrigin({ host: '127.0.0.1:4191', origin: 'http://127.0.0.1:4191' }), 'http://127.0.0.1:4191');
  assert.equal(resolveAllowedRequestOrigin({ host: '192.168.1.8:4191', origin: 'http://192.168.1.8:4191' }), 'http://192.168.1.8:4191');
  assert.equal(resolveAllowedRequestOrigin({ host: '127.0.0.1:4191' }), 'http://127.0.0.1:4191');
});

test('local parser rejects attacker origins, unsupported schemes and malformed hosts', () => {
  assert.equal(resolveAllowedRequestOrigin({ host: '127.0.0.1:4191', origin: 'http://evil.example' }), null);
  assert.equal(resolveAllowedRequestOrigin({ host: '127.0.0.1:4191', origin: 'https://127.0.0.1:4191' }), null);
  assert.equal(resolveAllowedRequestOrigin({ host: '127.0.0.1:4191', origin: 'null' }), null);
  assert.equal(resolveAllowedRequestOrigin({ host: 'evil.example/path', origin: 'http://evil.example' }), null);
  assert.equal(resolveAllowedRequestOrigin({ host: '' }), null);
});
