const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('account coverage gate runs the native browser pairing and sync conflict interaction suites',()=>{
  const scripts=JSON.parse(readFileSync('package.json','utf8')).scripts;
  const command=scripts['test:public-account'];
  assert.equal(typeof command,'string');
  for(const file of [
    'test/public-mini-account-view.test.cjs',
    'test/public-mini-browser-pairing.test.cjs',
    'test/public-mini-conflict-entry.test.cjs'
  ])assert.ok(command.includes(file),`missing ${file} from account coverage gate`);
});
