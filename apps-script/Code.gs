/**
 * Winter Camp 2027 registration backend (Google Apps Script web app).
 *
 * Bound to a private Google Sheet. It:
 *  - returns seats left per category (GET ?action=seats)
 *  - validates every registration again on the server (POST)
 *  - saves signatures and payment screenshots to private Drive folders,
 *    one set per category, and links them from the sheet row
 *  - uses a lock so the 30-seat limit can never be exceeded
 *  - keeps Kids and Youth registrations in separate tabs
 *  - writes paid submissions that arrive after the last seat to "Paid, no seat"
 *  - stores the registration PDF made by the family's browser (action "pdf") in a
 *    private "Registration PDFs" folder and links it from the row
 *  - neutralises text that could run as a spreadsheet formula
 *  - holds a seat for 5 minutes while a family pays (action "hold"), counted as
 *    taken while it lasts, kept in Script Properties (action "release" frees it)
 *  - never loses a payment: a paid duplicate goes to "Paid, no seat" as "Paid, duplicate"
 *  - gives each registration a code for the UPI note, flags reused screenshots and
 *    UPI references, and adds a "Payment check" column for the organisers
 * Uploads are never stored in GitHub. Deployment steps: apps-script/README.md.
 *
 * Keep CONFIG in step with site.config.js.
 */

var CONFIG = {
  seats: { kids: 30, youth: 30 },
  campStart: { kids: '2027-01-11', youth: '2027-01-04' },
  ages: { kids: [0, 11], youth: [11, null] }, // inclusive, on the first day of that camp; Youth has no upper limit
  labels: { kids: 'Kids', youth: 'Youth' },
  rootFolder: 'Winter Camp 2027',
  sheets: { kids: 'Kids registrations', youth: 'Youth registrations', overflow: 'Paid, no seat', summary: 'Summary', old: 'Registrations' },
  fee: 500,
  maxImageBytes: 5 * 1024 * 1024,
  maxPdfBytes: 8 * 1024 * 1024,
  pdfWindowMinutes: 30, // the PDF must arrive within this time of its registration
  maxBodyChars: 16 * 1024 * 1024,
  minFillMs: 5000, // four steps in under 5 seconds is a bot
  maxPerMinute: 120, // rate limit across all visitors for registrations and PDFs
  maxPerIdPerMinute: 10, // and per submission (retries are safe, floods are not)
  maxHoldsPerMinute: 300, // hold, release and seat checks are small and cheap
  holdMinutes: 5, // a seat is held this long once the payment step opens
  maxHoldMinutes: 15, // one submission can hold (and hold again) for this long in all
  timeZone: 'Asia/Kolkata',
  max: { name: 100, parent: 150, address: 400, medical: 1000, dietary: 1000, ref: 64, signatureTyped: 150 },
};

var HEADERS = [
  'Timestamp', 'Submission ID', 'Category', 'Name', 'Date of birth', 'Age on first day',
  "Parent/Guardian's Name(s)", 'Address', 'Emergency contact number(s)',
  'Medical conditions or concerns', 'Dietary requirements or allergies',
  'Medical emergency consent', 'Agreed to take part', 'Date of signing',
  'Signature', 'Typed signature', 'Payment screenshot', 'UPI transaction reference', 'Language', 'Status', 'Registration PDF', 'Fee non-refundable (agreed)',
  'Registration code', 'Payment check', 'Possible duplicate payment', 'Screenshot fingerprint',
];
// Filled in by the organisers. "Not received" and "Refunded" give the seat back.
var PAYMENT_CHECK = ['Not checked', 'Received', 'Not received', 'Refund due', 'Refunded'];
var FREES_SEAT = { 'Not received': true, 'Refunded': true };
var STATUS = { seat: 'Seat given', noSeat: 'Paid, no seat', duplicate: 'Paid, duplicate' };
var COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i; });

// ---------- Entry points ----------

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'seats') {
    migrateOldTab_();
    return json_({ ok: true, seats: seats_(), now: now_() });
  }
  return json_({ ok: true, service: 'Winter Camp 2027 registration' });
}

function doPost(e) {
  var body = e && e.postData && e.postData.contents;
  if (!body || body.length > CONFIG.maxBodyChars) return json_({ ok: false, error: 'bad_request' });
  var data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    if (data && data.action === 'pdf') return json_(savePdf_(data));
    if (data && data.action === 'hold') return json_(hold_(data));
    if (data && data.action === 'release') return json_(release_(data));
    return json_(register_(data));
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'server' });
  }
}

/** Run once from the editor to create the tabs and folders and grant permissions. */
function setup() {
  sheet_(CONFIG.sheets.kids);
  sheet_(CONFIG.sheets.youth);
  sheet_(CONFIG.sheets.overflow);
  summary_();
  migrateOldTab_();
  ['kids', 'youth'].forEach(function (cat) {
    folder_([CONFIG.rootFolder, CONFIG.labels[cat], 'Signatures']);
    folder_([CONFIG.rootFolder, CONFIG.labels[cat], 'Payment screenshots']);
    folder_([CONFIG.rootFolder, CONFIG.labels[cat], 'Registration PDFs']);
  });
  console.log(JSON.stringify(seats_()));
}

/**
 * Earlier versions kept both groups in one "Registrations" tab. Move any rows
 * found there into the Kids and Youth tabs (adding the new "Typed signature"
 * column), then rename the old tab so it is clearly no longer used.
 */
function migrateOldTab_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CONFIG.sheets.old)) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    moveOldRows_(ss);
  } finally {
    lock.releaseLock();
  }
}

function moveOldRows_(ss) {
  var old = ss.getSheetByName(CONFIG.sheets.old);
  if (!old) return;
  var last = old.getLastRow();
  var oldHeaders = old.getRange(1, 1, 1, Math.max(1, old.getLastColumn())).getValues()[0].map(String);
  if (last > 1) {
    var rows = old.getRange(2, 1, last - 1, oldHeaders.length).getValues();
    rows.forEach(function (r) {
      var row = HEADERS.map(function (h) {
        var i = oldHeaders.indexOf(h);
        return i < 0 ? '' : r[i];
      });
      var cat = text_(row[COL.Category]) === CONFIG.labels.youth ? 'youth' : 'kids';
      sheet_(CONFIG.sheets[cat]).appendRow(row.map(function (v) { return v instanceof Date ? text_(v) : safe_(v); }));
    });
  }
  old.setName(CONFIG.sheets.old + ' (old, moved ' + today_(0) + ')');
}

// ---------- Registration ----------

function register_(d) {
  if (!d || d.action !== 'register') return { ok: false, error: 'bad_request' };
  // Honeypot and minimum fill time: quietly refuse bots.
  if (d.website) return validationError_([{ field: 'form', code: 'server' }]);
  if (typeof d.elapsedMs !== 'number' || d.elapsedMs < CONFIG.minFillMs) return validationError_([{ field: 'form', code: 'server' }]);
  if (!rateOk_(d.submissionId)) return { ok: false, error: 'busy' };
  migrateOldTab_();
  summary_();

  var v = validate_(d);
  if (v.errors.length) return validationError_(v.errors);
  var c = v.clean;

  var shot = decodeImage_(d.screenshot && d.screenshot.data, ['image/jpeg', 'image/png', 'image/webp']);
  if (!shot) return validationError_([{ field: 'shot', code: d.screenshot ? 'shotType' : 'shot' }]);
  // Signature: drawn (PNG) or, for anyone who cannot draw one, their typed full name.
  var sig = null;
  if (d.signature) {
    sig = decodeImage_(d.signature, ['image/png']);
    if (!sig) return validationError_([{ field: 'signature', code: 'signature' }]);
  } else if (!c.signatureTyped) {
    return validationError_([{ field: 'signature', code: 'signature' }]);
  }

  var prior = findSubmission_(c.submissionId);
  if (prior) return prior;

  // The family has paid by now, so nothing below refuses to save: a duplicate
  // or a full group is recorded in "Paid, no seat" for the organisers.
  c.fingerprint = fingerprint_(shot.bytes);
  var files = saveFiles_(c, shot, sig);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    prior = findSubmission_(c.submissionId);
    if (prior) return prior;
    var holds = loadHolds_();
    var others = activeHolds_(holds, c.category, c.submissionId);
    dropHold_(holds, c.submissionId);
    saveHolds_(holds);
    c.flag = paymentFlag_(c);
    if (isDuplicate_(c)) {
      var dup = row_(c, files, STATUS.duplicate);
      sheet_(CONFIG.sheets.overflow).appendRow(dup);
      SpreadsheetApp.flush();
      return { ok: true, status: 'duplicate_paid', submittedAt: dup[COL.Timestamp] };
    }
    var taken = countCategory_(c.category);
    var full = taken + others >= CONFIG.seats[c.category];
    var row = row_(c, files, full ? STATUS.noSeat : STATUS.seat);
    sheet_(full ? CONFIG.sheets.overflow : CONFIG.sheets[c.category]).appendRow(row);
    SpreadsheetApp.flush();
    var at = row[COL.Timestamp];
    if (full) return { ok: true, status: 'last_seat', submittedAt: at };
    return { ok: true, status: 'registered', seatsLeft: Math.max(0, CONFIG.seats[c.category] - taken - others - 1), submittedAt: at };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Seat holds ----------
//
// A hold keeps one seat for a family while they pay. Holds live in Script
// Properties as one small JSON value, { kids: { id: { exp, first } }, youth: {...} },
// read and written only under the script lock. A hold counts as a taken seat
// until it expires (CONFIG.holdMinutes) or the form is sent. The same submission
// can hold again after expiry, up to CONFIG.maxHoldMinutes from its first hold.

function hold_(d) {
  var id = validId_(d.submissionId);
  var cat = d.category === 'kids' || d.category === 'youth' ? d.category : null;
  if (!id || !cat) return { ok: false, error: 'bad_request' };
  if (!holdRateOk_()) return { ok: false, error: 'busy' };
  migrateOldTab_();
  // Tell the family before they pay if this child is already registered.
  var name = clean_(d.name, CONFIG.max.name);
  var dob = parseIso_(d.dob) ? String(d.dob) : '';
  if (name && dob && isDuplicate_({ category: cat, name: name, dob: dob })) return { ok: false, error: 'duplicate' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    var prior = findSubmission_(id);
    if (prior) return prior;
    var now = now_();
    var holds = loadHolds_();
    var mine = holds[cat][id];
    if (mine && mine.exp > now) return held_(holds, cat, mine, now); // retry-safe
    var other = cat === 'kids' ? 'youth' : 'kids';
    if (holds[other][id]) delete holds[other][id]; // changed group
    var first = mine ? mine.first : now;
    var exp = Math.min(now + CONFIG.holdMinutes * 60000, first + CONFIG.maxHoldMinutes * 60000);
    if (exp <= now) { saveHolds_(holds); return { ok: true, status: 'limit', now: now, seats: seatsFrom_(holds, now) }; }
    var rows = countCategory_(cat);
    var heldByOthers = activeHolds_(holds, cat, id, now);
    if (rows + heldByOthers >= CONFIG.seats[cat]) {
      saveHolds_(holds);
      var res = { ok: true, status: 'full', reason: rows >= CONFIG.seats[cat] ? 'taken' : 'held', now: now, seats: seatsFrom_(holds, now) };
      if (res.reason === 'held') res.until = nextExpiry_(holds, cat, now);
      return res;
    }
    holds[cat][id] = { exp: exp, first: first };
    saveHolds_(holds);
    return held_(holds, cat, holds[cat][id], now);
  } finally {
    lock.releaseLock();
  }
}

function held_(holds, cat, h, now) {
  return { ok: true, status: 'held', expiresAt: h.exp, now: now, seats: seatsFrom_(holds, now) };
}

function release_(d) {
  var id = validId_(d.submissionId);
  if (!id) return { ok: false, error: 'bad_request' };
  if (!holdRateOk_()) return { ok: false, error: 'busy' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    var holds = loadHolds_();
    dropHold_(holds, id);
    saveHolds_(holds);
    return { ok: true, status: 'released' };
  } finally {
    lock.releaseLock();
  }
}

function validId_(v) {
  return /^[A-Za-z0-9-]{8,64}$/.test(String(v || '')) ? String(v) : null;
}

/** Reads the holds, dropping any that can no longer be renewed. */
function loadHolds_() {
  var raw = PropertiesService.getScriptProperties().getProperty('holds');
  var holds = { kids: {}, youth: {} };
  try {
    var parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.kids) holds.kids = parsed.kids;
    if (parsed && parsed.youth) holds.youth = parsed.youth;
  } catch (err) { /* a damaged value is treated as no holds */ }
  // An ended hold is remembered for 30 minutes after its 15-minute limit, so the
  // limit cannot be reset by waiting; after that it is forgotten.
  var now = now_();
  ['kids', 'youth'].forEach(function (cat) {
    Object.keys(holds[cat]).forEach(function (id) {
      var h = holds[cat][id];
      if (!h || typeof h.exp !== 'number' || h.first + (CONFIG.maxHoldMinutes + 30) * 60000 < now) delete holds[cat][id];
    });
  });
  return holds;
}

function saveHolds_(holds) {
  var json = JSON.stringify(holds);
  if (json.length > 8000) {
    // Stay under the 9 KB limit of a property value: forget holds that have ended.
    var now = now_();
    ['kids', 'youth'].forEach(function (cat) {
      Object.keys(holds[cat]).forEach(function (id) { if (holds[cat][id].exp <= now) delete holds[cat][id]; });
    });
    json = JSON.stringify(holds);
  }
  PropertiesService.getScriptProperties().setProperty('holds', json);
}

function dropHold_(holds, id) {
  delete holds.kids[id];
  delete holds.youth[id];
}

/** Holds still running in a group, leaving out one submission's own hold. */
function activeHolds_(holds, cat, exceptId, now) {
  var t = now || now_();
  return Object.keys(holds[cat]).filter(function (id) { return id !== exceptId && holds[cat][id].exp > t; }).length;
}

function nextExpiry_(holds, cat, now) {
  var times = Object.keys(holds[cat]).map(function (id) { return holds[cat][id].exp; }).filter(function (x) { return x > now; });
  return times.length ? Math.min.apply(null, times) : now;
}

function validationError_(fields) {
  return { ok: false, error: 'validation', fields: fields };
}

// ---------- Validation (mirrors src/js/validate.js) ----------

function clean_(v, max) {
  if (v === null || v === undefined) return '';
  var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return s.length > max ? null : s;
}

function parseIso_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return [y, mo, d];
}

function ageOn_(dob, on) {
  var a = parseIso_(dob), b = parseIso_(on);
  var age = b[0] - a[0];
  if (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2])) age -= 1;
  return age;
}

/** The current time in ms. One place, so the tests can move the clock. */
function now_() {
  return Date.now();
}

function today_(offsetDays) {
  var d = new Date(now_() + (offsetDays || 0) * 86400000);
  return Utilities.formatDate(d, CONFIG.timeZone, 'yyyy-MM-dd');
}

function validate_(d) {
  var errors = [];
  var c = {};
  var add = function (field, code) { errors.push({ field: field, code: code }); };

  c.category = d.category === 'kids' || d.category === 'youth' ? d.category : null;
  if (!c.category) add('category', 'server');

  c.submissionId = /^[A-Za-z0-9-]{8,64}$/.test(String(d.submissionId || '')) ? String(d.submissionId) : null;
  if (!c.submissionId) add('form', 'server');

  [['name', 'name'], ['parent', 'parent'], ['address', 'address']].forEach(function (p) {
    var v = clean_(d[p[0]], CONFIG.max[p[0]]);
    if (v === null) add(p[0], 'tooLong');
    else if (!v) add(p[0], p[1]);
    c[p[0]] = v;
  });
  ['medical', 'dietary'].forEach(function (k) {
    var v = clean_(d[k], CONFIG.max[k]);
    if (v === null) add(k, 'tooLong');
    c[k] = v || '';
  });
  // Optional UPI transaction reference (UTR): 12 digits when given.
  var ref = clean_(d.paymentRef, CONFIG.max.ref);
  if (ref === null) add('ref', 'tooLong');
  else if (ref && !/^\d{12}$/.test(ref.replace(/[\s-]/g, ''))) add('ref', 'refFormat');
  c.paymentRef = ref ? ref.replace(/[\s-]/g, '') : '';

  // Date of birth against the category's age range on that camp's first day.
  c.dob = String(d.dob || '');
  if (!parseIso_(c.dob)) add('dob', 'dobInvalid');
  else if (c.dob > today_(1)) add('dob', 'dobFuture');
  else if (c.category) {
    var age = ageOn_(c.dob, CONFIG.campStart[c.category]);
    var range = CONFIG.ages[c.category];
    c.age = age;
    if (c.category === 'kids' && age > range[1]) add('dob', 'dobKids');
    else if (c.category === 'youth' && age < range[0]) add('dob', 'dobYouthYoung');
    else if (age < range[0]) add('dob', 'dobInvalid');
  }

  var phones = Array.isArray(d.phones) ? d.phones.slice(0, 4) : [];
  // Numbers only, 6 to 10 digits (a leading +91 or 0 on a longer number is dropped first).
  c.phones = phones.map(function (p) {
    var raw = String(p || '');
    var digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && /^\s*\+?\s*91/.test(raw)) digits = digits.slice(2);
    else if (digits.length === 11 && digits.charAt(0) === '0') digits = digits.slice(1);
    return /[^\d\s\-().+]/.test(raw) ? 'x' : digits;
  }).filter(Boolean);
  if (!c.phones.length || !c.phones.every(function (p) { return /^\d{6,10}$/.test(p); })) add('phones', 'phone');

  var typed = clean_(d.signatureTyped, CONFIG.max.signatureTyped);
  if (typed === null) add('signature', 'tooLong');
  else if (typed && typed.length < 2) add('signature', 'signTyped');
  c.signatureTyped = typed || '';

  // Medical emergency consent must be YES to take part.
  c.consent = d.consent === 'yes' ? 'yes' : null;
  if (!c.consent) add('consent', d.consent === 'no' ? 'consentYes' : 'consent');
  if (d.agree !== true) add('agree', 'agree');
  if (d.refundAck !== true) add('refund', 'refund');

  c.signDate = String(d.signDate || '');
  if (!parseIso_(c.signDate) || c.signDate < '2026-01-01') add('signDate', 'signDate');
  else if (c.signDate > today_(1)) add('signDate', 'signDateFuture');

  c.lang = d.lang === 'bo' ? 'bo' : 'en';
  c.code = c.submissionId ? regCode_(c.submissionId) : '';
  return { errors: errors, clean: c };
}

// ---------- Images ----------

/** Accepts a data URL; returns { bytes, mime, ext } only if the content really is an allowed image. */
function decodeImage_(dataUrl, allowed) {
  if (typeof dataUrl !== 'string') return null;
  var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || allowed.indexOf(m[1]) < 0) return null;
  if (m[2].length > Math.ceil((CONFIG.maxImageBytes * 4) / 3) + 4) return null;
  var bytes;
  try {
    bytes = Utilities.base64Decode(m[2]);
  } catch (err) {
    return null;
  }
  if (!bytes || bytes.length < 16 || bytes.length > CONFIG.maxImageBytes) return null;
  var sniffed = sniff_(bytes);
  if (!sniffed || sniffed !== m[1]) return null;
  return { bytes: bytes, mime: sniffed, ext: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[sniffed] };
}

function sniff_(bytes) {
  var b = function (i) { return bytes[i] & 0xff; };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return 'image/png';
  var ascii = function (from, to) { var s = ''; for (var i = from; i < to; i++) s += String.fromCharCode(b(i)); return s; };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ---------- Drive ----------

function folder_(path) {
  var f = DriveApp.getRootFolder();
  path.forEach(function (name) {
    var it = f.getFoldersByName(name);
    f = it.hasNext() ? it.next() : f.createFolder(name);
  });
  return f;
}

function saveFiles_(c, shot, sig) {
  var label = CONFIG.labels[c.category];
  var stamp = Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd HHmmss');
  var who = c.name.replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'child';
  var base = label + ' - ' + who + ' - ' + stamp;
  var sigFile = sig ? folder_([CONFIG.rootFolder, label, 'Signatures'])
    .createFile(Utilities.newBlob(sig.bytes, sig.mime, base + ' - signature.' + sig.ext)) : null;
  var shotFile = folder_([CONFIG.rootFolder, label, 'Payment screenshots'])
    .createFile(Utilities.newBlob(shot.bytes, shot.mime, base + ' - payment.' + shot.ext));
  // Files stay private to the owner (Drive's default); never shared by link.
  return { signature: sigFile ? sigFile.getUrl() : '', screenshot: shotFile.getUrl() };
}

// ---------- Sheet ----------

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    // Plain text everywhere, so dates and phone numbers are stored exactly as sent.
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    checkColumn_(sh);
  } else if (!headerChecked_[name]) {
    // Tabs made by an earlier version lack the newest columns (e.g. "Registration PDF"): add their headings.
    var have = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0].map(String);
    var added = false;
    HEADERS.forEach(function (h, i) {
      if (!have[i]) { sh.getRange(1, i + 1).setNumberFormat('@').setValue(h).setFontWeight('bold'); added = true; }
    });
    if (added) sh.getRange(2, HEADERS.length - 3, Math.max(1, sh.getMaxRows() - 1), 4).setNumberFormat('@');
    if (added) checkColumn_(sh);
  }
  headerChecked_[name] = true;
  return sh;
}

/** The organisers' "Payment check" column: a dropdown on every row. */
function checkColumn_(sh) {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(PAYMENT_CHECK, true).setAllowInvalid(false).build();
  sh.getRange(2, COL['Payment check'] + 1, Math.max(1, sh.getMaxRows() - 1), 1).setDataValidation(rule);
}

function colLetter_(i) {
  var s = '';
  for (var n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * A "Summary" tab with live totals, for reconciling money against the bank
 * statement. Made once; the organisers can move or format it freely.
 */
function summary_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(CONFIG.sheets.summary)) return;
  var sh = ss.insertSheet(CONFIG.sheets.summary);
  var name = colLetter_(COL.Name), check = colLetter_(COL['Payment check']), flag = colLetter_(COL['Possible duplicate payment']);
  var fee = CONFIG.fee;
  var q = function (tab) { return "'" + tab + "'!"; };
  var rows = [['Group', 'Rows', 'Seats taken', 'Payment: not checked', 'Received', 'Not received', 'Refund due', 'Refunded', 'Possible duplicates', 'Money expected (₹)', 'Money received (₹)']];
  [CONFIG.sheets.kids, CONFIG.sheets.youth, CONFIG.sheets.overflow].forEach(function (tab) {
    var t = q(tab), n = t + name + '2:' + name, c = t + check + '2:' + check;
    rows.push([
      tab,
      '=COUNTA(' + n + ')',
      tab === CONFIG.sheets.overflow ? '0' : '=COUNTA(' + n + ')-COUNTIF(' + c + ',"Not received")-COUNTIF(' + c + ',"Refunded")',
      '=COUNTA(' + n + ')-COUNTIF(' + c + ',"Received")-COUNTIF(' + c + ',"Not received")-COUNTIF(' + c + ',"Refund due")-COUNTIF(' + c + ',"Refunded")',
      '=COUNTIF(' + c + ',"Received")',
      '=COUNTIF(' + c + ',"Not received")',
      '=COUNTIF(' + c + ',"Refund due")',
      '=COUNTIF(' + c + ',"Refunded")',
      '=COUNTIF(' + t + flag + '2:' + flag + ',"?*")',
      '=(COUNTA(' + n + ')-COUNTIF(' + c + ',"Not received"))*' + fee,
      '=COUNTIF(' + c + ',"Received")*' + fee,
    ]);
  });
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
}
var headerChecked_ = {};

function rows_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

function text_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.timeZone, 'yyyy-MM-dd');
  return String(v === null || v === undefined ? '' : v).replace(/^'/, '');
}

/** Seats taken = filled rows in that group's tab, except rows the organisers marked "Not received" or "Refunded". */
function countCategory_(cat) {
  return rows_(CONFIG.sheets[cat]).filter(function (r) {
    return text_(r[COL.Name]) !== '' && !FREES_SEAT[text_(r[COL['Payment check']])];
  }).length;
}

function seats_() {
  return seatsFrom_(loadHolds_(), now_());
}

/** { kids: { left, total, held }, youth: {...} }: "left" already counts holds as taken. */
function seatsFrom_(holds, now) {
  var out = {};
  ['kids', 'youth'].forEach(function (cat) {
    var taken = countCategory_(cat);
    var held = Math.min(activeHolds_(holds, cat, null, now), Math.max(0, CONFIG.seats[cat] - taken));
    out[cat] = { left: Math.max(0, CONFIG.seats[cat] - taken - held), total: CONFIG.seats[cat], held: held };
  });
  return out;
}

function findSubmission_(id) {
  var found = locate_(id);
  if (!found) return null;
  var at = String(found.row[COL.Timestamp] instanceof Date
    ? Utilities.formatDate(found.row[COL.Timestamp], CONFIG.timeZone, 'yyyy-MM-dd HH:mm:ss')
    : text_(found.row[COL.Timestamp]));
  var status = found.tab !== 'overflow' ? 'registered'
    : text_(found.row[COL.Status]) === STATUS.duplicate ? 'duplicate_paid' : 'last_seat';
  return { ok: true, status: status, submittedAt: at };
}

/** Finds a submission's row: { tab: 'kids' | 'youth' | 'overflow', index (1-based sheet row), row }. */
function locate_(id) {
  var col = COL['Submission ID'];
  var tabs = ['kids', 'youth', 'overflow'];
  for (var t = 0; t < tabs.length; t++) {
    var rows = rows_(CONFIG.sheets[tabs[t]]);
    for (var i = 0; i < rows.length; i++) {
      if (text_(rows[i][col]) === id) return { tab: tabs[t], index: i + 2, row: rows[i] };
    }
  }
  return null;
}

function norm_(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDuplicate_(c) {
  return rows_(CONFIG.sheets[c.category]).some(function (r) {
    return norm_(text_(r[COL.Name])) === norm_(c.name) && text_(r[COL['Date of birth']]) === c.dob;
  });
}

/** A short code for the UPI note and the PDF: the first 8 characters of the submission ID. */
function regCode_(id) {
  return String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
}

function fingerprint_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/**
 * Flags (never blocks) a payment that may have been used before: the same
 * screenshot, or the same UPI reference, in any tab. One payment for two
 * siblings is allowed; the organisers decide.
 */
function paymentFlag_(c) {
  var hits = [];
  var tabs = { kids: 'Kids', youth: 'Youth', overflow: 'Paid, no seat' };
  Object.keys(tabs).forEach(function (t) {
    rows_(CONFIG.sheets[t]).forEach(function (r, i) {
      var what = [];
      if (c.fingerprint && text_(r[COL['Screenshot fingerprint']]) === c.fingerprint) what.push('screenshot');
      if (c.paymentRef && text_(r[COL['UPI transaction reference']]).replace(/[\s-]/g, '') === c.paymentRef) what.push('UPI reference');
      if (what.length) hits.push('Same ' + what.join(' and ') + ' as ' + tabs[t] + ' row ' + (i + 2) + ' (' + text_(r[COL.Name]) + ')');
    });
  });
  return hits.slice(0, 5).join('; ');
}

/** Text starting with = + - @ (or a tab/return) is stored with a leading apostrophe so it cannot run as a formula. */
function safe_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function row_(c, files, status) {
  var r = [];
  r[COL.Timestamp] = Utilities.formatDate(new Date(now_()), CONFIG.timeZone, 'yyyy-MM-dd HH:mm:ss');
  r[COL['Submission ID']] = c.submissionId;
  r[COL.Category] = CONFIG.labels[c.category];
  r[COL.Name] = c.name;
  r[COL['Date of birth']] = c.dob;
  r[COL['Age on first day']] = String(c.age);
  r[COL["Parent/Guardian's Name(s)"]] = c.parent;
  r[COL.Address] = c.address;
  r[COL['Emergency contact number(s)']] = c.phones.join(', ');
  r[COL['Medical conditions or concerns']] = c.medical;
  r[COL['Dietary requirements or allergies']] = c.dietary;
  r[COL['Medical emergency consent']] = c.consent === 'yes' ? 'YES' : 'NO';
  r[COL['Agreed to take part']] = 'Yes';
  r[COL['Date of signing']] = c.signDate;
  r[COL.Signature] = files.signature;
  r[COL['Typed signature']] = files.signature ? '' : c.signatureTyped;
  r[COL['Payment screenshot']] = files.screenshot;
  r[COL['UPI transaction reference']] = c.paymentRef;
  r[COL.Language] = c.lang === 'bo' ? 'Tibetan' : 'English'; // kept for rows sent before round 6
  r[COL.Status] = status;
  r[COL['Registration PDF']] = '';
  r[COL['Fee non-refundable (agreed)']] = 'Yes';
  r[COL['Registration code']] = c.code;
  r[COL['Payment check']] = 'Not checked';
  r[COL['Possible duplicate payment']] = c.flag || '';
  r[COL['Screenshot fingerprint']] = c.fingerprint || '';
  return r.map(safe_);
}

// ---------- Registration PDF ----------

/**
 * The family's browser draws the registration as a PDF after the registration is
 * accepted, then sends it here. It is accepted once per submission, only as a real
 * PDF, only within CONFIG.pdfWindowMinutes, and saved privately next to the others.
 */
function savePdf_(d) {
  var id = /^[A-Za-z0-9-]{8,64}$/.test(String(d.submissionId || '')) ? String(d.submissionId) : null;
  if (!id) return { ok: false, error: 'bad_request' };
  if (!rateOk_(id)) return { ok: false, error: 'busy' };
  var pdf = decodePdf_(d.pdf);
  if (!pdf) return { ok: false, error: 'pdf' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    var found = locate_(id);
    if (!found) return { ok: false, error: 'not_found' };
    if (text_(found.row[COL['Registration PDF']])) return { ok: true, status: 'saved' }; // already stored: retry-safe
    var at = text_(found.row[COL.Timestamp]);
    var limit = Utilities.formatDate(new Date(now_() - CONFIG.pdfWindowMinutes * 60000), CONFIG.timeZone, 'yyyy-MM-dd HH:mm:ss');
    if (!at || at < limit) return { ok: false, error: 'too_late' };

    var cat = text_(found.row[COL.Category]) === CONFIG.labels.youth ? 'youth' : 'kids';
    var label = CONFIG.labels[cat];
    var who = text_(found.row[COL.Name]).replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'child';
    var stamp = at.replace(/:/g, '');
    var file = folder_([CONFIG.rootFolder, label, 'Registration PDFs'])
      .createFile(Utilities.newBlob(pdf, 'application/pdf', label + ' - ' + who + ' - ' + stamp + ' - registration.pdf'));
    // Private to the owner (Drive's default); never shared by link.
    sheet_(CONFIG.sheets[found.tab]).getRange(found.index, COL['Registration PDF'] + 1).setValue(file.getUrl());
    SpreadsheetApp.flush();
    return { ok: true, status: 'saved' };
  } finally {
    lock.releaseLock();
  }
}

/** Accepts a data URL; returns the bytes only if they really are a PDF of an allowed size. */
function decodePdf_(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  var m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || m[1].length > Math.ceil((CONFIG.maxPdfBytes * 4) / 3) + 4) return null;
  var bytes;
  try {
    bytes = Utilities.base64Decode(m[1]);
  } catch (err) {
    return null;
  }
  if (!bytes || bytes.length < 64 || bytes.length > CONFIG.maxPdfBytes) return null;
  var head = '';
  for (var i = 0; i < 5; i++) head += String.fromCharCode(bytes[i] & 0xff);
  return head === '%PDF-' ? bytes : null;
}

// ---------- Utilities ----------

function count_(key, limit) {
  var cache = CacheService.getScriptCache();
  var k = key + ':' + Math.floor(now_() / 60000);
  var n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 120);
  return n <= limit;
}

/** Registrations and PDFs: a limit across all visitors and a smaller one per submission. */
function rateOk_(id) {
  if (id && !count_('rate-id:' + String(id).slice(0, 64), CONFIG.maxPerIdPerMinute)) return false;
  return count_('rate', CONFIG.maxPerMinute);
}

function holdRateOk_() {
  return count_('rate-hold', CONFIG.maxHoldsPerMinute);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
