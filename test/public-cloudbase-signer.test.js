import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
const module = await import('../server/cloudbase-ticket-signer.js').catch(()=>null);
const create = async options => { assert.ok(module,'真实CloudBase签名适配尚未实现'); return module.createCloudBaseTicketSigner(options); };
const envId='test-environment';
const keys=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const credentials={env_id:envId,private_key_id:'test-key',private_key:keys.privateKey};

test('official SDK generates a verifiable RSA ticket offline, not a mock string',async()=>{
  const sign=await create({envId,credentials});
  const result=await sign('wx_12345678901234567890123456789');
  assert.ok(result.startsWith('test-key/@@/'));
  const [header,payload,signature]=result.split('/@@/')[1].split('.');
  assert.equal(JSON.parse(Buffer.from(header,'base64url')).alg,'RS256');
  assert.ok(verify('RSA-SHA256',Buffer.from(`${header}.${payload}`),createPublicKey(keys.publicKey),Buffer.from(signature,'base64url')));
  assert.ok(!result.includes(keys.privateKey));
});
test('refuses missing, wrong-environment, malformed or non-RSA credentials',async()=>{
  for(const bad of [null,{}, {...credentials,env_id:'another-env'}, {...credentials,private_key_id:''}, {...credentials,private_key:'invalid'}]) await assert.rejects(create({envId,credentials:bad}),/cloudbase_signer_config_invalid/);
  const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1',privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  await assert.rejects(create({envId,credentials:{...credentials,private_key:ec.privateKey}}),/cloudbase_signer_config_invalid/);
});
test('does not sign arbitrary, privileged or client-selected account IDs',async()=>{
  const sign=await create({envId,credentials});
  for(const id of ['administrator','other-user','wx_foo',null]) await assert.rejects(sign(id),/cloudbase_signer_identity_invalid/);
});
