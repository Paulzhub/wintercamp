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
  consent: 'yes', agree: true, refundAck: true, signature: png, signDate: '2026-11-11', screenshot: { type: 'image/jpeg', data: jpeg },
  paymentRef: '412345678901', lang: 'en', website: '', elapsedMs: 60000, ...over,
});

test('seats start at 30 each', () => {
  const g = createSandbox();
  const res = g.doGet({ action: 'seats' });
  assert.deepEqual(res.seats, { kids: { left: 30, total: 30, held: 0 }, youth: { left: 30, total: 30, held: 0 } });
  assert.equal(typeof res.now, 'number');
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
  assert.equal(g.doPost(valid({ consent: 'no' })).fields[0].code, 'consentYes'); // medical emergency consent must be YES
  assert.equal(g.doPost(valid({ paymentRef: 'UPI123' })).fields[0].code, 'refFormat'); // a UTR has 12 digits
  assert.equal(g.doPost(valid({ paymentRef: '4123 4567 8901' })).status, 'registered');
  assert.equal(got.agree, 'agree');
  assert.equal(g.doPost(valid({ refundAck: false })).fields[0].field, 'refund'); // fee is non-refundable: must be agreed
  assert.equal(got.signDate, 'signDateFuture');
  assert.equal(g.doPost(valid({ category: 'youth', dob: '2016-01-05' })).fields[0].code, 'dobYouthYoung'); // 10 on 4 Jan 2027
  assert.equal(g.doPost(valid({ category: 'youth', dob: '2016-01-04' })).status, 'registered'); // 11 on 4 Jan 2027
  assert.equal(g.doPost(valid({ category: 'youth', dob: '1995-06-01' })).status, 'registered'); // no upper limit
  assert.equal(g.doPost(valid({ category: 'kids', dob: '2015-01-12' })).status, 'registered'); // 11 on 11 Jan 2027
  assert.equal(g.doPost(valid({ category: 'kids', dob: '2015-01-11' })).fields[0].code, 'dobKids'); // turns 12 that day
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

test('the same child cannot take two seats; a paid duplicate is saved as "Paid, duplicate"', () => {
  const g = createSandbox();
  g.doPost(valid({ name: 'Pema Lhamo' }));
  const again = valid({ name: '  pema   LHAMO ' });
  const res = g.doPost(again);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'duplicate_paid');
  assert.equal(g.sheet('Kids registrations').rows.length, 2, 'no second seat');
  const row = g.sheet('Paid, no seat').rows[1];
  assert.equal(row[g.context.COL.Status], 'Paid, duplicate');
  assert.match(row[g.context.COL['Payment screenshot']], /^https:\/\/drive\.google\.com\//);
  assert.equal(g.doPost(again).status, 'duplicate_paid', 'a retry gets the same answer');
  assert.equal(g.sheet('Paid, no seat').rows.length, 2);
  const pdf = 'data:application/pdf;base64,' + Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100, 32)]).toString('base64');
  assert.equal(g.doPost({ action: 'pdf', submissionId: again.submissionId, pdf }).status, 'saved');
  assert.match(g.sheet('Paid, no seat').rows[1][g.context.COL['Registration PDF']], /^https:\/\/drive/);
});

test('bots: honeypot, too fast, and rate limit', () => {
  const g = createSandbox();
  assert.equal(g.doPost(valid({ website: 'http://spam' })).error, 'validation');
  assert.equal(g.doPost(valid({ elapsedMs: 4000 })).error, 'validation');
  assert.equal(g.doPost('not json').error, 'bad_request');
  g.resetRate();
  let busy = 0;
  for (let i = 0; i < 125; i++) if (g.doPost(valid({ category: i % 2 ? 'kids' : 'youth', dob: i % 2 ? '2019-03-15' : '2010-03-15' })).error === 'busy') busy++;
  assert.equal(busy, 5, 'across all visitors: 120 a minute');
  g.resetRate();
  const p = valid();
  let mine = 0;
  for (let i = 0; i < 12; i++) if (g.doPost(p).error === 'busy') mine++;
  assert.equal(mine, 2, 'one submission: 10 a minute');
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

test('tabs made by an earlier version get the newer headings added', () => {
  const g = createSandbox();
  const sh = g.context.SpreadsheetApp.getActiveSpreadsheet().insertSheet('Kids registrations');
  sh.appendRow(g.context.HEADERS.slice(0, -6));
  g.doGet({ action: 'seats' });
  assert.deepEqual(sh.rows[0].slice(-6), ['Registration PDF', 'Fee non-refundable (agreed)', 'Registration code', 'Payment check', 'Possible duplicate payment', 'Screenshot fingerprint']);
  assert.equal(sh.rows[0].length, g.context.HEADERS.length);
  assert.deepEqual([...sh.validations.at(-1).rule.values], ['Not checked', 'Received', 'Not received', 'Refund due', 'Refunded'], 'Payment check dropdown added');
});

// ---------- Round 7: seat holds, payment checks ----------

const hold = (g, p, over = {}) => { g.resetRate(); return g.doPost({ action: 'hold', submissionId: p.submissionId, category: p.category, name: p.name, dob: p.dob, ...over }); };
const MIN = 60000;

test('a hold takes a seat for 5 minutes, is retry-safe, and is released when the form is sent', () => {
  const g = createSandbox();
  const p = valid();
  const h = hold(g, p);
  assert.equal(h.status, 'held');
  assert.equal(h.expiresAt - h.now, 5 * MIN);
  assert.deepEqual(h.seats.kids, { left: 29, total: 30, held: 1 });
  g.advance(30000);
  const again = hold(g, p);
  assert.equal(again.expiresAt, h.expiresAt, 'the same submission keeps the same hold');
  assert.equal(Object.keys(g.holds().kids).length, 1);
  assert.equal(g.doPost(p).status, 'registered');
  assert.deepEqual(g.holds().kids, {}, 'released on submit');
  assert.deepEqual(g.doGet({ action: 'seats' }).seats.kids, { left: 29, total: 30, held: 0 });
});

test('a hold expires after 5 minutes; holding again is allowed up to 15 minutes in all', () => {
  const g = createSandbox();
  const p = valid();
  hold(g, p);
  g.advance(5 * MIN + 1000);
  assert.deepEqual(g.doGet({ action: 'seats' }).seats.kids, { left: 30, total: 30, held: 0 });
  const h2 = hold(g, p);
  assert.equal(h2.status, 'held');
  g.advance(5 * MIN + 1000);
  const h3 = hold(g, p);
  assert.equal(h3.status, 'held');
  assert.ok(h3.expiresAt - h3.now < 5 * MIN, 'the last hold is cut at 15 minutes from the first');
  g.advance(5 * MIN);
  assert.equal(hold(g, p).status, 'limit');
  assert.equal(g.doGet({ action: 'seats' }).seats.kids.held, 0);
});

test('while the last seat is held, a second family cannot hold it; it opens again when the hold expires', () => {
  const g = createSandbox();
  g.seed('kids', 29);
  const a = valid();
  const b = valid();
  assert.equal(hold(g, a).status, 'held');
  assert.deepEqual(g.doGet({ action: 'seats' }).seats.kids, { left: 0, total: 30, held: 1 });
  const blocked = hold(g, b);
  assert.equal(blocked.status, 'full');
  assert.equal(blocked.reason, 'held');
  assert.ok(blocked.until > blocked.now);
  // B sends anyway (paid without a hold): no seat while A's hold lasts.
  assert.equal(g.doPost(b).status, 'last_seat');
  assert.equal(g.doPost(a).status, 'registered', 'A keeps the held seat');
  const c = valid();
  const full = hold(g, c);
  assert.equal(full.status, 'full');
  assert.equal(full.reason, 'taken');
});

test('paying after the hold expired and the seat was taken goes to "Paid, no seat"', () => {
  const g = createSandbox();
  g.seed('kids', 29);
  const a = valid();
  const b = valid();
  hold(g, a);
  g.advance(5 * MIN + 1000);
  assert.equal(hold(g, b).status, 'held');
  assert.equal(g.doPost(b).status, 'registered');
  const late = g.doPost(a);
  assert.equal(late.status, 'last_seat');
  assert.equal(g.sheet('Paid, no seat').rows[1][g.context.COL.Status], 'Paid, no seat');
});

test('hold: a child already registered is told before paying; release frees the seat; bad input is refused', () => {
  const g = createSandbox();
  g.doPost(valid({ name: 'Pema Lhamo' }));
  const p = valid({ name: 'pema lhamo' });
  assert.equal(hold(g, p).error, 'duplicate');
  assert.deepEqual(g.holds().kids, {});
  const q = valid();
  hold(g, q);
  assert.equal(g.doGet({ action: 'seats' }).seats.kids.held, 1);
  g.resetRate();
  assert.equal(g.doPost({ action: 'release', submissionId: q.submissionId }).status, 'released');
  assert.equal(g.doGet({ action: 'seats' }).seats.kids.held, 0);
  assert.equal(hold(g, q, { category: 'adults' }).error, 'bad_request');
  assert.equal(hold(g, q, { submissionId: 'x' }).error, 'bad_request');
  // Changing group moves the hold.
  hold(g, q);
  hold(g, q, { category: 'youth', dob: '2010-01-01' });
  assert.deepEqual(Object.keys(g.holds().kids), []);
  assert.deepEqual(Object.keys(g.holds().youth), [q.submissionId]);
});

test('each row gets a registration code, a "Not checked" payment check and a screenshot fingerprint', () => {
  const g = createSandbox();
  const p = valid();
  g.doPost(p);
  const row = g.sheet('Kids registrations').rows[1];
  const C = g.context.COL;
  assert.equal(row[C['Registration code']], p.submissionId.replace(/-/g, '').slice(0, 8).toUpperCase());
  assert.equal(row[C['Payment check']], 'Not checked');
  assert.match(row[C['Screenshot fingerprint']], /^[0-9a-f]{64}$/);
  assert.equal(row[C['Possible duplicate payment']], '');
  assert.equal(row[C['UPI transaction reference']], '412345678901');
});

test('a reused screenshot or UPI reference is flagged, not refused', () => {
  const g = createSandbox();
  g.doPost(valid({ name: 'Tenzin A' }));
  const second = g.doPost(valid({ name: 'Tenzin B', paymentRef: '999999999999' }));
  assert.equal(second.status, 'registered');
  const C = g.context.COL;
  assert.equal(g.sheet('Kids registrations').rows[2][C['Possible duplicate payment']], 'Same screenshot as Kids row 2 (Tenzin A)');
  const otherShot = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 9)]).toString('base64');
  g.doPost(valid({ name: 'Tenzin C', screenshot: { data: otherShot }, paymentRef: '999999999999' }));
  assert.equal(g.sheet('Kids registrations').rows[3][C['Possible duplicate payment']], 'Same UPI reference as Kids row 3 (Tenzin B)');
});

test('rows marked "Not received" or "Refunded" give their seat back; a Summary tab is made', () => {
  const g = createSandbox();
  g.seed('kids', 30);
  assert.equal(g.doGet({ action: 'seats' }).seats.kids.left, 0);
  const sh = g.sheet('Kids registrations');
  sh.rows[5][g.context.COL['Payment check']] = 'Not received';
  sh.rows[6][g.context.COL['Payment check']] = 'Refunded';
  sh.rows[7][g.context.COL['Payment check']] = 'Received';
  assert.equal(g.doGet({ action: 'seats' }).seats.kids.left, 2);
  g.doPost(valid());
  const sum = g.sheet('Summary');
  assert.ok(sum, 'Summary tab');
  assert.equal(sum.rows[0][0], 'Group');
  assert.deepEqual(sum.rows.slice(1).map((r) => r[0]), ['Kids registrations', 'Youth registrations', 'Paid, no seat']);
  assert.match(sum.rows[1][4], /^=COUNTIF\('Kids registrations'!X2:X,"Received"\)$/);
});
