import { T } from './i18n.js';

const TIMEOUT_MS = 60000;

async function call(url, options) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ac.signal, redirect: 'follow', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// { kids: { left, total }, youth: { left, total } }
export async function fetchSeats() {
  if (!T.api) throw new Error('The Apps Script URL is not set in site.config.js');
  const sep = T.api.includes('?') ? '&' : '?';
  const data = await call(`${T.api}${sep}action=seats`, { method: 'GET', cache: 'no-store' });
  if (!data || !data.ok || !data.seats) throw new Error((data && data.error) || 'Bad response');
  return data.seats;
}

// text/plain keeps this a "simple" request, so the browser sends no preflight
// (Apps Script web apps cannot answer one).
export async function sendRegistration(payload) {
  if (!T.api) throw new Error('The Apps Script URL is not set in site.config.js');
  return call(T.api, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

// The registration PDF, sent after the registration is accepted (same simple request).
export const sendPdf = (payload) => sendRegistration(payload);
