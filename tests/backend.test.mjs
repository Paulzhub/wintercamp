// Tests for apps-script/Code.gs, run against in-memory Google services.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../scripts/gas-sandbox.mjs';

const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
let n = 0;
const valid = (over = {}) => ({
  action: 'register', submissionId: `test-${Date.now()}-${++n}`, category: 'kids', name: `Tenzin ${n}`, dob: '2019-03-15',
  parent: 'Dolma', address: 'Jogiwara Road, McLeodganj', phones: ['+919876543210'], medical: '', dietary: 'None',
  consent: 'yes', agree: true, signature: png, signDate: '2026-11-11', screenshot: { type: 'image/jpeg', data: jpeg },
  paymentRef: 'UPI123', lang: 'en', website: '', elapsedMs: 60000, ...over,
});

test('seats start at 30 each', () => {
  const g = createSandbox();
  assert.deepEqual(g.doGet({ action: 'seats' }), { ok: true, seats: { kids: { left: 30, total: 30 }, youth: { left: 30, total: 30 } } });
});

test('a valid registration gets a seat, a row and two private files per category', () => {
  const g = createSandbox();
  const res = g.doPost(valid());
  assert.equal(res.status, 'registered');
  assert.equal(res.seatsLeft, 29);
  const rows = g.sheet('Registrations').rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'Timestamp');
  assert.equal(rows[1][g.context.COL.Category], 'Kids');
  assert.match(rows[1][g.context.COL['Payment screenshot']], /^https:\/\/drive\.google\.com\//);
  assert.deepEqual(g.files.map((f) => f.folder).sort(), ['Winter Camp 2027/Kids/Payment screenshots', 'Winter Camp 2027/Kids/Signatures']);
  g.doPost(valid({ category: 'youth', dob: '2012-01-01' }));
  assert.ok(g.files.some((f) => f.folder === 'Winter Camp 2027/Youth/Payment screenshots'));
  assert.equal(g.doGet({ action: 'seats' }).seats.youth.left, 29);
});

test('text that could run as a formula is neutralised', () => {
  const g = createSandbox();
  g.doPost(valid({ name: '=HYPERLINK("http://x","y")', medical: '@SUM(A1)' }));
  const row = g.sheet('Registrations').rows[1];
  assert.equal(row[g.context.COL.Name], `'=HYPERLINK("http://x","y")`);
  assert.equal(row[g.context.COL['Medical conditions or concerns']], `'@SUM(A1)`);
  assert.equal(row[g.context.COL['Emergency contact number(s)']], `'+919876543210`);
});

test('a registration without a valid screenshot is rejected', () => {
  const g = createSandbox();
  assert.deepEqual(g.doPost(valid({ screenshot: null })).fields, [{ field: 'shot', code: 'shot' }]);
  const fake = 'data:image/png;base64,' + Buffer.from('<?php echo "not an image"; ?>............').toString('base64');
  assert.equal(g.doPost(valid({ screenshot: { type: 'image/png', data: fake } })).fields[0].code, 'shotType');
  const mismatch = jpeg.replace('image/jpeg', 'image/png');
  assert.equal(g.doPost(valid({ screenshot: { data: mismatch } })).error, 'validation');
  const big = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024 + 10)]).toString('base64');
  assert.equal(g.doPost(valid({ screenshot: { data: big } })).fields[0].field, 'shot');
  assert.equal(g.sheet('Registrations')?.rows.length ?? 1, 1);
  assert.equal(g.files.length, 0);
});

test('every field is validated again on the server', () => {
  const g = createSandbox();
  const res = g.doPost(valid({ name: '', dob: '2015-01-10', phones: ['12'], consent: 'maybe', agree: false, signDate: '2030-01-01', signature: jpeg, category: 'kids' }));
  const got = Object.fromEntries(res.fields.map((f) => [f.field, f.code]));
  assert.equal(got.name, 'name');
  assert.equal(got.dob, 'dobKids');
  assert.equal(got.phones, 'phone');
  assert.equal(got.consent, 'consent');
  assert.equal(got.agree, 'agree');
  assert.equal(got.signDate, 'signDateFuture');
  assert.equal(g.doPost(valid({ category: 'youth', dob: '2018-01-01' })).fields[0].code, 'dobYouthYoung');
  assert.equal(g.doPost(valid({ category: 'youth', dob: '2008-01-03' })).fields[0].code, 'dobYouth');
  assert.equal(g.doPost(valid({ category: 'youth', dob: '2008-01-05' })).status, 'registered'); // 18 on 4 Jan 2027
  assert.equal(g.doPost(valid({ category: 'kids', dob: '2017-01-12' })).status, 'registered'); // 9 on 11 Jan 2027
  assert.equal(g.doPost(valid({ category: 'kids', dob: '2017-01-11' })).fields[0].code, 'dobKids'); // turns 10 that day
  assert.equal(g.doPost(valid({ name: 'x'.repeat(101) })).fields[0].code, 'tooLong');
  assert.equal(g.doPost(valid({ signature: png.replace('image/png', 'image/jpeg') })).fields[0].field, 'signature');
});

test('the 30-seat limit holds; later paid submissions go to "Paid, no seat"', () => {
  const g = createSandbox();
  g.seed('kids', 29);
  assert.equal(g.doPost(valid()).status, 'registered');
  assert.equal(g.doGet({ action: 'seats' }).seats.kids.left, 0);
  const late = g.doPost(valid());
  assert.deepEqual(late, { ok: true, status: 'last_seat' });
  const overflow = g.sheet('Paid, no seat').rows;
  assert.equal(overflow.length, 2);
  assert.equal(overflow[1][g.context.COL.Status], 'Paid, no seat');
  assert.match(overflow[1][g.context.COL['Payment screenshot']], /drive\.google\.com/);
  assert.equal(g.sheet('Registrations').rows.length, 31);
  assert.equal(g.doGet({ action: 'seats' }).seats.youth.left, 30);
});

test('retrying the same submission does not take a second seat', () => {
  const g = createSandbox();
  const p = valid();
  assert.equal(g.doPost(p).status, 'registered');
  assert.equal(g.doPost(p).status, 'registered');
  assert.equal(g.sheet('Registrations').rows.length, 2);
});

test('the same child cannot be registered twice in a category', () => {
  const g = createSandbox();
  g.doPost(valid({ name: 'Pema Lhamo' }));
  assert.equal(g.doPost(valid({ name: '  pema   LHAMO ' })).error, 'duplicate');
});

test('bots: honeypot, too fast, and rate limit', () => {
  const g = createSandbox();
  assert.equal(g.doPost(valid({ website: 'http://spam' })).error, 'validation');
  assert.equal(g.doPost(valid({ elapsedMs: 4000 })).error, 'validation');
  assert.equal(g.doPost('not json').error, 'bad_request');
  g.resetRate();
  let busy = 0;
  for (let i = 0; i < 35; i++) if (g.doPost(valid()).error === 'busy') busy++;
  assert.equal(busy, 5);
});
