// Explicit native acceptance, not a default unit test. Never logs identity or tokens.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const modulePath = process.env.BUFFER_AUTOMATOR_MODULE;
if (!modulePath) throw new Error('BUFFER_AUTOMATOR_MODULE_required');
const endpoint = process.env.BUFFER_AUTOMATOR_ENDPOINT;
if (!/^ws:\/\/127\.0\.0\.1:\d+$/.test(endpoint || '')) throw new Error('local_endpoint_required');
const mini = await require(modulePath).connect({ wsEndpoint: endpoint });
let stage = 'preconditions';
async function bounded(task) {
  let timer;
  try { return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('native_timeout')),10000);})]); }
  finally { clearTimeout(timer); }
}
async function phase() { return bounded(mini.evaluate(() => getApp().accountStatus().phase)); }
async function fingerprint() {
  return bounded(mini.evaluate(() => {
    const text = JSON.stringify(['buffer-zone.mini.state.v2','buffer-zone.mini.state.v1'].map(key => wx.getStorageSync(key)));
    let hash = 2166136261;
    for (let i=0;i<text.length;i++) hash = Math.imul(hash ^ text.charCodeAt(i),16777619);
    return hash >>> 0;
  }));
}
async function entry() {
  const page = await mini.currentPage();
  const component = await page.$('#accountEntry');
  assert.ok(component, 'visible_entry_required');
  const button = await component.$('.account-button');
  assert.ok(button, 'visible_button_required');
  return {page, component, button};
}
async function until(check) {
  const end = Date.now()+20000;
  while (Date.now()<end) {
    if (await check()) return;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error('state_timeout');
}
try {
  assert.equal(await phase(),'signed_out','do_not_replace_existing_session');
  const original = await fingerprint();
  for (const space of ['reality','future','conditions','history']) {
    stage = `${space}_cancel`;
    await mini.switchTab(`/pages/${space}/index`);
    const {component,button} = await entry();
    assert.equal(await component.data('label'),'微信登录');
    await button.tap();
    await bounded(mini.native().cancelModal());
    await until(async()=>await bounded(component.data('confirming'))===false);
    assert.equal(await phase(),'signed_out');
    assert.equal(await fingerprint(),original,'local_state_changed');
  }
  await mini.switchTab('/pages/reality/index');
  if (process.argv.includes('--login')) {
    stage='visible_login_entry';
    let current=await entry();
    stage='visible_login_tap';
    await current.button.tap();
    stage='visible_login_confirm';
    await bounded(mini.native().confirmModal());
    await until(async()=>await bounded(current.component.data('confirming'))===false);
    stage='visible_login_response';
    await until(async()=>await phase()==='signed_in'||await phase()==='login_failed');
    assert.equal(await phase(),'signed_in');
    await until(async()=>await current.component.data('label')==='微信已登录');
    assert.equal(await current.component.data('message'),'本机数据未上传');
    for (const space of ['future','conditions','history','reality']) {
      stage=`${space}_shared_session`;
      await mini.switchTab(`/pages/${space}/index`);
      current=await entry();
      assert.equal(await current.component.data('label'),'微信已登录');
    }
    stage='visible_logout';
    await current.button.tap();
    await bounded(mini.native().confirmModal());
    await until(async()=>await phase()==='signed_out');
    assert.equal(await current.component.data('label'),'微信登录');
    assert.equal(await fingerprint(),original,'local_state_changed');
  }
  stage='complete';
  console.log(JSON.stringify({fourSpaces:true,cancelPreservesLocalState:true,
    actualLoginLogout:process.argv.includes('--login'),noMocks:true}));
} catch {
  console.error(JSON.stringify({failedStage:stage}));
  process.exitCode=1;
} finally {
  mini.disconnect();
}
