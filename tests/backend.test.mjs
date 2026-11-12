// Tests for apps-script/Code.gs, run against in-memory Google services.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../scripts/gas-sandbox.mjs';

const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
let n = 0;
const valid = (over = {}) => ({
  action: 'register', submissionId: `test-${Date.now()}-${++n}`, category: 'kids', name: `Tenzin ${n}`, dob: '2019-03-15',
  parent: 'Dolma', address: 'Jogiwara Road, McLeodganj', phones: ['9876543210'], medical: '', dietary: 'None',
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
  const rows = g.sheet('Kids registrations').rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'Timestamp');
  assert.equal(rows[1][g.context.COL.Category], 'Kids');
  assert.match(rows[1][g.context.COL['Payment screenshot']], /^https:\/\/drive\.google\.com\//);
  assert.deepEqual(g.files.map((f) => f.folder).sort(), ['Winter Camp 2027/Kids/Payment screenshots', 'Winter Camp 2027/Kids/Signatures']);
  g.doPost(valid({ category: 'youth', dob: '2012-01-01' }));
  assert.equal(g.sheet('Youth registrations').rows.length, 2, 'Youth rows go to their own tab');
  assert.equal(g.sheet('Kids registrations').rows.length, 2);
  assert.ok(g.files.some((f) => f.folder === 'Winter Camp 2027/Youth/Payment screenshots'));
  assert.equal(g.doGet({ action: 'seats' }).seats.youth.left, 29);
});

test('text that could run as a formula is neutralised', () => {
  const g = createSandbox();
  g.doPost(valid({ name: '=HYPERLINK("http://x","y")', medical: '@SUM(A1)' }));
  const row = g.sheet('Kids registrations').rows[1];
  assert.equal(row[g.context.COL.Name], `'=HYPERLINK("http://x","y")`);
  assert.equal(row[g.context.COL['Medical conditions or concerns']], `'@SUM(A1)`);
  assert.equal(row[g.context.COL['Emergency contact number(s)']], '9876543210');
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
  assert.equal(g.sheet('Kids registrations')?.rows.length ?? 1, 1);
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
  assert.equal(late.ok, true);
  assert.equal(late.status, 'last_seat');
  assert.match(late.submittedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const overflow = g.sheet('Paid, no seat').rows;
  assert.equal(overflow.length, 2);
  assert.equal(overflow[1][g.context.COL.Status], 'Paid, no seat');
  assert.match(overflow[1][g.context.COL['Payment screenshot']], /^https?:\/\/drive\.google\.com(?:\/|$)/);
  assert.equal(g.sheet('Kids registrations').rows.length, 31);
  assert.equal(g.doGet({ action: 'seats' }).seats.youth.left, 30);
});

test('retrying the same submission does not take a second seat', () => {
  const g = createSandbox();
  const p = valid();
  assert.equal(g.doPost(p).status, 'registered');
  assert.equal(g.doPost(p).status, 'registered');
  assert.equal(g.sheet('Kids registrations').rows.length, 2);
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

test('phone numbers have up to 10 digits (at least 6)', () => {
  const g = createSandbox();
  const code = (phones) => g.doPost(valid({ phones })).fields?.find((f) => f.field === 'phones')?.code;
  assert.equal(code(['98765']), 'phone');
  assert.equal(code(['98765432']), undefined);
  assert.equal(code(['98765432101']), 'phone');
  assert.equal(code(['98765abc10']), 'phone');
  assert.equal(code(['9876543210', '12345']), 'phone');
  assert.equal(g.doPost(valid({ name: 'Phone Kid', phones: ['+91 98765 43210', '01892-221234', '221234'] })).status, 'registered');
  const row = g.sheet('Kids registrations').rows.at(-1);
  assert.equal(row[g.context.COL['Emergency contact number(s)']], '9876543210, 1892221234, 221234');
});

test('a typed name can be used instead of a drawn signature', () => {
  const g = createSandbox();
  assert.equal(g.doPost(valid({ signature: '', signatureTyped: '' })).fields[0].field, 'signature');
  assert.equal(g.doPost(valid({ signature: '', signatureTyped: 'D' })).fields[0].code, 'signTyped');
  const res = g.doPost(valid({ signature: '', signatureTyped: 'Dolma Tsering' }));
  assert.equal(res.status, 'registered');
  const row = g.sheet('Kids registrations').rows[1];
  assert.equal(row[g.context.COL['Typed signature']], 'Dolma Tsering');
  assert.equal(row[g.context.COL.Signature], '');
  assert.equal(g.files.filter((f) => f.folder.endsWith('Signatures')).length, 0);
  assert.equal(g.files.filter((f) => f.folder.endsWith('Payment screenshots')).length, 1);
});

test('rows in an old single "Registrations" tab are moved to the Kids and Youth tabs', () => {
  const g = createSandbox();
  g.seedOldTab([
    { Category: 'Kids', Name: 'Old Kid', 'Submission ID': 'old-1', 'Date of birth': '2019-01-01' },
    { Category: 'Youth', Name: 'Old Youth', 'Submission ID': 'old-2', 'Date of birth': '2012-01-01' },
  ]);
  const seats = g.doGet({ action: 'seats' }).seats;
  assert.equal(seats.kids.left, 29);
  assert.equal(seats.youth.left, 29);
  assert.equal(g.sheet('Youth registrations').rows[1][g.context.COL.Name], 'Old Youth');
  assert.ok(!g.sheet('Registrations'), 'old tab renamed');
  assert.ok(g.sheetNames().some((n) => n.startsWith('Registrations (old, moved')));
  g.doGet({ action: 'seats' });
  assert.equal(g.sheet('Kids registrations').rows.length, 2, 'moved only once');
});

const pdf = 'data:application/pdf;base64,' + Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(300, 32), Buffer.from('%%EOF')]).toString('base64');

test('the registration PDF is stored once, privately, in the group\'s folder and linked from its row', () => {
  const g = createSandbox();
  const reg = valid({ category: 'youth', dob: '2012-01-01', name: 'Pema PDF' });
  const res = g.doPost(reg);
  assert.match(res.submittedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const col = g.context.COL['Registration PDF'];
  assert.equal(g.sheet('Youth registrations').rows[0][col], 'Registration PDF');
  assert.equal(g.sheet('Youth registrations').rows[1][col], '');
  assert.deepEqual(g.doPost({ action: 'pdf', submissionId: reg.submissionId, pdf }), { ok: true, status: 'saved' });
  const saved = g.files.filter((f) => f.folder === 'Winter Camp 2027/Youth/Registration PDFs');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].mime, 'application/pdf');
  assert.match(saved[0].name, /^Youth - Pema PDF - .* - registration\.pdf$/);
  assert.match(g.sheet('Youth registrations').rows[1][col], /^https:\/\/drive\.google\.com\//);
  // A retry is harmless and does not make a second file.
  assert.deepEqual(g.doPost({ action: 'pdf', submissionId: reg.submissionId, pdf }), { ok: true, status: 'saved' });
  assert.equal(g.files.filter((f) => f.folder.endsWith('Registration PDFs')).length, 1);
  // The retry of the registration itself reports the same time.
  assert.equal(g.doPost(reg).submittedAt, res.submittedAt);
});

test('the PDF upload refuses unknown submissions, non-PDF files, oversized files and late uploads', () => {
  const g = createSandbox();
  const reg = valid();
  g.doPost(reg);
  assert.equal(g.doPost({ action: 'pdf', submissionId: 'no-such-submission', pdf }).error, 'not_found');
  assert.equal(g.doPost({ action: 'pdf', submissionId: 'bad id!', pdf }).error, 'bad_request');
  const fake = 'data:application/pdf;base64,' + Buffer.from('<html>' + ' '.repeat(100)).toString('base64');
  assert.equal(g.doPost({ action: 'pdf', submissionId: reg.submissionId, pdf: fake }).error, 'pdf');
  assert.equal(g.doPost({ action: 'pdf', submissionId: reg.submissionId, pdf: pdf.replace('application/pdf', 'image/png') }).error, 'pdf');
  const big = 'data:application/pdf;base64,' + Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(8 * 1024 * 1024 + 10)]).toString('base64');
  assert.equal(g.doPost({ action: 'pdf', submissionId: reg.submissionId, pdf: big }).error, 'pdf');
  // Make the registration 31 minutes old.
  const row = g.sheet('Kids registrations').rows[1];
  row[g.context.COL.Timestamp] = g.context.Utilities.formatDate(new Date(Date.now() - 31 * 60000), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
  assert.equal(g.doPost({ action: 'pdf', submissionId: reg.submissionId, pdf }).error, 'too_late');
  assert.equal(g.files.filter((f) => f.folder.endsWith('Registration PDFs')).length, 0);
});

test('a "Paid, no seat" registration gets its PDF too', () => {
  const g = createSandbox();
  g.seed('kids', 30);
  const reg = valid({ name: 'Late Kid' });
  assert.equal(g.doPost(reg).status, 'last_seat');
  assert.equal(g.doPost({ action: 'pdf', submissionId: reg.submissionId, pdf }).status, 'saved');
  assert.ok(g.files.some((f) => f.folder === 'Winter Camp 2027/Kids/Registration PDFs'));
  assert.match(g.sheet('Paid, no seat').rows[1][g.context.COL['Registration PDF']], /^https:\/\/drive\.google\.com\//);
});

test('tabs made by an earlier version get the "Registration PDF" heading added', () => {
  const g = createSandbox();
  const sh = g.context.SpreadsheetApp.getActiveSpreadsheet().insertSheet('Kids registrations');
  sh.appendRow(g.context.HEADERS.slice(0, -1));
  g.doGet({ action: 'seats' });
  assert.equal(sh.rows[0].at(-1), 'Registration PDF');
  assert.equal(sh.rows[0].length, g.context.HEADERS.length);
});
