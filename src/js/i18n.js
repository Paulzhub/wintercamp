// Strings and settings the page renderer embedded in #i18n (no personal data).
const el = typeof document !== 'undefined' ? document.getElementById('i18n') : null;
export const T = el ? JSON.parse(el.textContent) : {};
export const fill = (s, vars = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
