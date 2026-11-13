// Runs apps-script/Code.gs in Node with in-memory stand-ins for the Google services
// it uses (Sheets, Drive, Lock, Cache, Utilities, ContentService). Used by the
// backend tests and by the local mock backend, so both exercise the real script.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fmtDate(d, tz, fmt) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((p) => [p.type, p.value]),
  );
  return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
    .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
}

// Like the live Sheet, which stored timestamps as real dates (right-aligned):
// with { sheetDates: true }, text that looks like a date or a date and time
// comes back from the Sheet as a Date (read as India time).
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/;
const asSheetValue = (v, D) => {
  const m = typeof v === 'string' && DATE_RE.exec(v);
  return m ? new D(`${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}+05:30`) : v;
};

export function createSandbox({ sheetDates = false } = {}) {
  let SheetDate = Date; // the script's own Date (another realm), set below
  const store = (v) => (sheetDates ? asSheetValue(v, SheetDate) : v);
  const folders = [];
  const files = [];
  const cache = new Map();
  const props = new Map();
  let fileId = 0;
  let clockOffset = 0; // moved by advance(), for hold expiry tests

  class Sheet {
    constructor(name) { this.name = name; this.rows = []; this.validations = []; }
    getMaxRows() { return 1000; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
    setName(n) { sheets.delete(this.name); this.name = n; sheets.set(n, this); return this; }
    appendRow(r) { this.rows.push(Array.from(r, store)); return this; }
    setFrozenRows() { return this; }
    getRange(r, c, nr = 1, nc = 1) {
      const self = this;
      const range = {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = self.rows[r - 1 + i] || [];
            out.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] ?? ''));
          }
          return out;
        },
        setValues(values) {
          values.forEach((row, i) => {
            const idx = r - 1 + i;
            self.rows[idx] = self.rows[idx] || [];
            row.forEach((x, j) => { self.rows[idx][c - 1 + j] = store(x); });
          });
          return range;
        },
        setValue(v) { return range.setValues([[v]]); },
        setNumberFormat: () => range,
        setFontWeight: () => range,
        setDataValidation: (rule) => { self.validations.push({ r, c, nr, nc, rule }); return range; },
      };
      return range;
    }
  }
  const sheets = new Map();
  const spreadsheet = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; },
  };

  const makeFolder = (name, parentPath) => {
    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    const children = [];
    const folder = {
      name, path: folderPath,
      getFoldersByName(n) {
        const list = children.filter((f) => f.name === n);
        let i = 0;
        return { hasNext: () => i < list.length, next: () => list[i++] };
      },
      createFolder(n) { const f = makeFolder(n, folderPath); children.push(f); folders.push(f.path); return f; },
      createFile(blob) {
        const id = `file${++fileId}`;
        files.push({ id, folder: folderPath, name: blob.name, mime: blob.mime, size: blob.bytes.length });
        return { getUrl: () => `https://drive.google.com/file/d/${id}/view`, getId: () => id };
      },
    };
    return folder;
  };
  const driveRoot = makeFolder('', '');

  const context = vm.createContext({
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush() {},
      newDataValidation() {
        const rule = { values: null };
        const b = { requireValueInList: (v) => { rule.values = v; return b; }, setAllowInvalid: () => b, build: () => rule };
        return b;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, String(v)); },
        deleteProperty: (k) => { props.delete(k); },
      }),
    },
    DriveApp: { getRootFolder: () => driveRoot },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)) }) },
    Utilities: {
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64'), (b) => (b > 127 ? b - 256 : b)),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: fmtDate,
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, bytes) => Array.from(createHash(alg).update(Buffer.from(bytes.map((b) => b & 0xff))).digest(), (b) => (b > 127 ? b - 256 : b)),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => { const o = { getContent: () => s, setMimeType: () => o }; return o; },
    },
  });
  vm.runInContext(readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), context, { filename: 'Code.gs' });
  context.now_ = () => Date.now() + clockOffset;
  SheetDate = vm.runInContext('Date', context);

  const api = {
    context,
    files,
    folders,
    // A Date as the script sees it (for tests that put dates in the Sheet).
    date: (ms) => new SheetDate(ms),
    cache,
    sheet: (name) => sheets.get(name),
    doGet: (params = {}) => JSON.parse(context.doGet({ parameter: params }).getContent()),
    doPost: (body) => JSON.parse(context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } }).getContent()),
    // Fill seats directly, for testing the full and last-seat cases.
    seed(category, count) {
      const sh = context.sheet_(context.CONFIG.sheets[category]);
      for (let i = 0; i < count; i++) {
        const r = context.HEADERS.map(() => '');
        r[context.COL.Category] = context.CONFIG.labels[category];
        r[context.COL['Submission ID']] = `seed-${category}-${sh.getLastRow()}-${i}`;
        r[context.COL.Name] = `Seeded ${i}`;
        sh.appendRow(r);
      }
    },
    resetRate: () => cache.clear(),
    props,
    holds: () => JSON.parse(props.get('holds') || '{"kids":{},"youth":{}}'),
    // Move the script's clock forward (hold expiry, PDF window).
    advance(ms) { clockOffset += ms; return clockOffset; },
    // An old single "Registrations" tab, as created by the first version.
    seedOldTab(rows) {
      const sh = spreadsheet.insertSheet('Registrations');
      const oldHeaders = context.HEADERS.filter((h) => h !== 'Typed signature');
      sh.appendRow(oldHeaders);
      rows.forEach((o) => sh.appendRow(oldHeaders.map((h) => o[h] ?? '')));
    },
    sheetNames: () => [...sheets.keys()],
  };
  return api;
}
