import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('HTTP cloud startup uses the documented absolute Node 20 runtime',async()=>{
  const script=(await readFile(new URL('../cloud-functions/buffer-login/scf_bootstrap',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  assert.equal(script,'#!/bin/bash\ncd /var/user\nexec /var/lang/node20/bin/node index.js\n');
});
