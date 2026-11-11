// Validation rules shared by the form. apps-script/Code.gs repeats them on the server.
export const MAX = { name: 100, parent: 150, address: 400, medical: 1000, dietary: 1000, ref: 64 };

export function isoDate(y, m, d) {
  const yy = Number(y); const mm = Number(m); const dd = Number(d);
  if (!yy || !mm || !dd) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return isoDate(m[1], m[2], m[3]) ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function ageOn(dob, on) {
  const a = parseIso(dob); const b = parseIso(on);
  if (!a || !b) return NaN;
  let age = b[0] - a[0];
  if (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2])) age -= 1;
  return age;
}

export function todayIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Returns an error key from the strings file, or null when the date of birth fits.
export function dobProblem(dob, category, cats, today = todayIso()) {
  if (!parseIso(dob)) return 'dobInvalid';
  if (dob > today) return 'dobFuture';
  const c = cats[category];
  if (!c) return null;
  const age = ageOn(dob, c.start);
  if (category === 'kids' && age > c.maxAge) return 'dobKids';
  if (category === 'youth' && age < c.minAge) return 'dobYouthYoung';
  if (category === 'youth' && age > c.maxAge) return 'dobYouth';
  if (age < c.minAge) return 'dobInvalid';
  return null;
}

export const normPhone = (p) => String(p || '').replace(/[\s\-().]/g, '');
// Up to 10 digits; at least 6 so a stray digit or two can't pass as a number.
export const PHONE_MIN = 6;
export const validPhone = (p) => /^\d{6,10}$/.test(normPhone(p));
