const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const DIST=path.resolve(__dirname,'../dist'),KEY='buffer-zone.product.state.v1';
test('real browser restore requires confirmation, preserves original evidence and rejects partial malformed data',async()=>{
  const {normalizeCashReality}=await import('../src/v8-cash-reality.js');
  const fixture=balance=>({schemaVersion:9,cash:{balance,reserve:500,daily:20},records:[],cashReality:normalizeCashReality({conditions:[
    {id:'balance',type:'balance',amount:balance,status:'confirmed',source:'user_confirmed'},
    {id:'reserve',type:'reserve',amount:500,status:'confirmed',source:'user_confirmed'},
    {id:'daily-floor',type:'daily_floor',amount:20,frequency:'daily',status:'confirmed',source:'user_confirmed'}]})});
  const original=fixture(6000),incoming=fixture(4000);
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext();const page=await context.newPage();let alerts=0;
  page.on('dialog',async dialog=>{alerts++;await dialog.dismiss();});
  try {
    await context.route('http://buffer-backup.test/**',route=>{
      const relative=new URL(route.request().url()).pathname.slice(1)||'index.html';
      const filename=path.resolve(DIST,relative);
      if(!filename.startsWith(DIST+path.sep)||!fs.existsSync(filename))return route.fulfill({status:404});
      return route.fulfill({status:200,contentType:filename.endsWith('.js')?'text/javascript':filename.endsWith('.html')?'text/html':undefined,body:fs.readFileSync(filename)});
    });
    await context.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:KEY,state:original});
    await page.goto('http://buffer-backup.test/',{waitUntil:'networkidle'});
    await page.locator('.nav-item[data-page="rec"]').click();
    const upload=async value=>page.locator('#page-rec [data-role="backup-file"]').setInputFiles({name:'fixture-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
    const stored=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
    await upload(incoming);await page.getByRole('dialog',{name:'恢复备份'}).waitFor();assert.deepEqual(await stored(),original);
    await page.locator('[data-close-again]').click();assert.deepEqual(await stored(),original);
    await upload(incoming);await page.locator('[data-restore]').click();assert.deepEqual((await stored()).cashReality,incoming.cashReality,'restore must not invent new historical confirmations');
    const before=await stored();const malformed={...incoming,cashReality:{...incoming.cashReality,events:[{id:'bad',type:'expense',amount:null,source:'model'}]}};
    await upload(malformed);assert.equal(await page.getByRole('dialog',{name:'恢复备份'}).count(),0);assert.equal(alerts,1);assert.deepEqual(await stored(),before);
    await page.evaluate(key=>{const save=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key)throw Error('fixture quota');return save.call(this,name,value);};},KEY);
    await upload(original);await page.locator('[data-restore]').click();assert.deepEqual(await stored(),before);assert.equal(alerts,2,'save failure needs a recoverable error, not silent state replacement');
  } finally {await context.close();await browser.close();}
});
