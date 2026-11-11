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
 *  - neutralises text that could run as a spreadsheet formula
 * Uploads are never stored in GitHub. Deployment steps: apps-script/README.md.
 *
 * Keep CONFIG in step with site.config.js.
 */

var CONFIG = {
  seats: { kids: 30, youth: 30 },
  campStart: { kids: '2027-01-11', youth: '2027-01-04' },
  ages: { kids: [0, 9], youth: [10, 18] }, // inclusive, on the first day of that camp
  labels: { kids: 'Kids', youth: 'Youth' },
  rootFolder: 'Winter Camp 2027',
  sheets: { kids: 'Kids registrations', youth: 'Youth registrations', overflow: 'Paid, no seat', old: 'Registrations' },
  maxImageBytes: 5 * 1024 * 1024,
  maxBodyChars: 16 * 1024 * 1024,
  minFillMs: 5000, // four steps in under 5 seconds is a bot
  maxPerMinute: 30, // simple rate limit across all visitors
  timeZone: 'Asia/Kolkata',
  max: { name: 100, parent: 150, address: 400, medical: 1000, dietary: 1000, ref: 64, signatureTyped: 150 },
};

var HEADERS = [
  'Timestamp', 'Submission ID', 'Category', 'Name', 'Date of birth', 'Age on first day',
  "Parent/Guardian's Name(s)", 'Address', 'Emergency contact number(s)',
  'Medical conditions or concerns', 'Dietary requirements or allergies',
  'Medical emergency consent', 'Agreed to take part', 'Date of signing',
  'Signature', 'Typed signature', 'Payment screenshot', 'UPI transaction reference', 'Language', 'Status',
];
var COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i; });

// ---------- Entry points ----------

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'seats') {
    migrateOldTab_();
    return json_({ ok: true, seats: seats_() });
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
  migrateOldTab_();
  ['kids', 'youth'].forEach(function (cat) {
    folder_([CONFIG.rootFolder, CONFIG.labels[cat], 'Signatures']);
    folder_([CONFIG.rootFolder, CONFIG.labels[cat], 'Payment screenshots']);
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
  if (!rateOk_()) return { ok: false, error: 'busy' };
  migrateOldTab_();

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
  if (isDuplicate_(c)) return { ok: false, error: 'duplicate' };

  var files = saveFiles_(c, shot, sig);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    prior = findSubmission_(c.submissionId);
    if (prior) return prior;
    if (isDuplicate_(c)) return { ok: false, error: 'duplicate' };
    var taken = countCategory_(c.category);
    var full = taken >= CONFIG.seats[c.category];
    var row = row_(c, files, full ? 'Paid, no seat' : 'Seat given');
    sheet_(full ? CONFIG.sheets.overflow : CONFIG.sheets[c.category]).appendRow(row);
    SpreadsheetApp.flush();
    if (full) return { ok: true, status: 'last_seat' };
    return { ok: true, status: 'registered', seatsLeft: CONFIG.seats[c.category] - taken - 1 };
  } finally {
    lock.releaseLock();
  }
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

function today_(offsetDays) {
  var d = new Date(Date.now() + (offsetDays || 0) * 86400000);
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
  var ref = clean_(d.paymentRef, CONFIG.max.ref);
  if (ref === null) add('ref', 'tooLong');
  c.paymentRef = ref || '';

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
    else if (c.category === 'youth' && age > range[1]) add('dob', 'dobYouth');
    else if (age < range[0]) add('dob', 'dobInvalid');
  }

  var phones = Array.isArray(d.phones) ? d.phones.slice(0, 4) : [];
  // 10-digit numbers only (a leading +91 or 0 is dropped first).
  c.phones = phones.map(function (p) {
    var raw = String(p || '');
    var digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && /^\s*\+?\s*91/.test(raw)) digits = digits.slice(2);
    else if (digits.length === 11 && digits.charAt(0) === '0') digits = digits.slice(1);
    return /[^\d\s\-().+]/.test(raw) ? 'x' : digits;
  }).filter(Boolean);
  if (!c.phones.length || !c.phones.every(function (p) { return /^\d{10}$/.test(p); })) add('phones', 'phone');

  var typed = clean_(d.signatureTyped, CONFIG.max.signatureTyped);
  if (typed === null) add('signature', 'tooLong');
  else if (typed && typed.length < 2) add('signature', 'signTyped');
  c.signatureTyped = typed || '';

  c.consent = d.consent === 'yes' || d.consent === 'no' ? d.consent : null;
  if (!c.consent) add('consent', 'consent');
  if (d.agree !== true) add('agree', 'agree');

  c.signDate = String(d.signDate || '');
  if (!parseIso_(c.signDate) || c.signDate < '2026-01-01') add('signDate', 'signDate');
  else if (c.signDate > today_(1)) add('signDate', 'signDateFuture');

  c.lang = d.lang === 'bo' ? 'bo' : 'en';
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
  }
  return sh;
}

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

/** Seats taken = filled rows in that group's tab. */
function countCategory_(cat) {
  return rows_(CONFIG.sheets[cat]).filter(function (r) { return text_(r[COL.Name]) !== ''; }).length;
}

function seats_() {
  var out = {};
  ['kids', 'youth'].forEach(function (cat) {
    var taken = countCategory_(cat);
    out[cat] = { left: Math.max(0, CONFIG.seats[cat] - taken), total: CONFIG.seats[cat] };
  });
  return out;
}

function findSubmission_(id) {
  var col = COL['Submission ID'];
  var registered = ['kids', 'youth'].some(function (cat) {
    return rows_(CONFIG.sheets[cat]).some(function (r) { return text_(r[col]) === id; });
  });
  if (registered) return { ok: true, status: 'registered' };
  if (rows_(CONFIG.sheets.overflow).some(function (r) { return text_(r[col]) === id; })) return { ok: true, status: 'last_seat' };
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

/** Text starting with = + - @ (or a tab/return) is stored with a leading apostrophe so it cannot run as a formula. */
function safe_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function row_(c, files, status) {
  var r = [];
  r[COL.Timestamp] = Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd HH:mm:ss');
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
  r[COL.Language] = c.lang === 'bo' ? 'Tibetan' : 'English';
  r[COL.Status] = status;
  return r.map(safe_);
}

// ---------- Utilities ----------

function rateOk_() {
  var cache = CacheService.getScriptCache();
  var key = 'rate:' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  return n <= CONFIG.maxPerMinute;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
