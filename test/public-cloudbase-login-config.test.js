import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCloudBaseLoginConfig} from '../server/cloudbase-login-config.js';

const base={envId:'buffer-env',appId:'wx-app',appSecret:'server-only',credentials:{private_key:'server-only'},serviceUserId:'login-service',password:'server-only',allowedOrigin:'https://buffer.example',keyPolicy:'rsa2048'};
const features={sync:{enabled:true,backendKey:'a'.repeat(64)},pair:{enabled:true,backendKey:'b'.repeat(64),encryptionKey:'c'.repeat(64)}};
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');

test('legacy login configuration loads unchanged when no feature extension is set',()=>{
  const config=loadCloudBaseLoginConfig({BUFFER_LOGIN_CONFIG:JSON.stringify(base)});
  assert.deepEqual(config,base);
});

test('server-only base64 feature extension enables sync and browser pairing without replacing login credentials',()=>{
  const config=loadCloudBaseLoginConfig({BUFFER_LOGIN_CONFIG:JSON.stringify(base),BUFFER_LOGIN_FEATURES_B64:encoded(features)});
  assert.deepEqual(config,{...base,...features});
  assert.equal(config.appSecret,base.appSecret);
  assert.equal(config.password,base.password);
  assert.equal(base.sync,undefined);
});

test('malformed, non-object, or credential-overriding feature extensions fail closed',()=>{
  const invalid=[
    'not-base64-json',
    encoded([]),
    encoded({appSecret:'attacker-controlled'}),
    encoded({sync:null}),
  ];
  for(const value of invalid) assert.throws(()=>loadCloudBaseLoginConfig({BUFFER_LOGIN_CONFIG:JSON.stringify(base),BUFFER_LOGIN_FEATURES_B64:value}),/cloud_login_config_invalid/);
});

test('missing or malformed base login configuration fails closed',()=>{
  for(const env of [{},{BUFFER_LOGIN_CONFIG:'not-json'},{BUFFER_LOGIN_CONFIG:'[]'}])
    assert.throws(()=>loadCloudBaseLoginConfig(env),/cloud_login_config_invalid/);
});
