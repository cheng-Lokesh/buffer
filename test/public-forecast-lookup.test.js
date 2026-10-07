import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const load = () => import('../src/forecast-lookup.js');

test('money lookup uses exact cents and rejects missing, excessive precision and unsafe values', async () => {
  const { parseLookupCents } = await load();
  for (const raw of ['', ' ', null, '1e3', '1.001', 'NaN', '90071992547409.92']) assert.equal(parseLookupCents(raw), null);
  for (const [raw, cents] of [['0', 0], ['1.01',101], ['-1.01',-101], [' 2501 ',250100], ['90071992547409.91',Number.MAX_SAFE_INTEGER]]) assert.equal(parseLookupCents(raw), cents);
});
test('lookup chooses first reachable day, never interprets unknown as zero or mutates points', async () => {
  const { findBalanceDay } = await load();
  const points = [null,400000,420000,250000,300000,200000].map(balanceCents => ({balanceCents}));
  const snapshot = JSON.stringify(points);
  assert.equal(findBalanceDay(points,250100,p=>p.balanceCents),3);
  assert.equal(findBalanceDay(points,0,p=>p.balanceCents),-1);
  assert.equal(findBalanceDay(points,420000,p=>p.balanceCents),1);
  assert.equal(findBalanceDay([],0,p=>p.balanceCents),-1);
  assert.equal(findBalanceDay(points,null,p=>p.balanceCents),-1);
  assert.equal(JSON.stringify(points),snapshot);
});
test('date choices stay inside projection including leap day and year boundary', async () => {
  const { lookupDateOptions } = await load();
  const points=['2028-02-28','2028-02-29','2028-03-01'].map(date=>({date}));
  assert.deepEqual(lookupDateOptions(points,'2028-02-29'),{months:['2028-02','2028-03'],monthIndex:0,dates:['2028-02-28','2028-02-29'],dayIndex:1});
  assert.deepEqual(lookupDateOptions(points,'2028-03-31').dates,['2028-03-01']);
  assert.equal(lookupDateOptions(points,'2028-03-31').dayIndex,0);
  assert.deepEqual(lookupDateOptions([],''),{months:[],monthIndex:0,dates:[],dayIndex:0});
  assert.deepEqual(lookupDateOptions([{date:'2027-12-31'},{date:'2028-01-01'}],'2028-01-01').months,['2027-12','2028-01']);
});
test('both platforms share Asia/Shanghai dates regardless of device timezone', async () => {
  const web=await load(); const mini=require('../miniprogram/core/forecast-lookup.js');
  for (const instant of ['2026-10-07T15:59:59Z','2026-10-07T16:00:00Z']) assert.equal(mini.shanghaiDate(instant),web.shanghaiDate(instant));
  assert.equal(web.shanghaiDate('2026-10-07T16:00:00Z'),'2026-10-08');
  assert.equal(web.shanghaiDate('invalid'),null);
  for (const raw of ['2501','-10.12','1.001',null]) assert.equal(mini.parseLookupCents(raw),web.parseLookupCents(raw));
  const source=readFileSync(new URL('../src/forecast-lookup.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const generated=readFileSync(new URL('../miniprogram/core/forecast-lookup.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.ok(generated.includes(source.replace(/^export /gm,'')), 'mini copy is generated from the authoritative shared source');
});
