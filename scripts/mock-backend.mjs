// Local stand-in for the Apps Script web app, running the real apps-script/Code.gs.
//   npm run mock-backend            -> http://127.0.0.1:8787/exec
// Then build or run the site with WC_APPS_SCRIPT_URL=http://127.0.0.1:8787/exec
// Test helpers: POST /__seed {"category":"kids","count":29}, POST /__reset, GET /__state,
//   POST /__clock {"advanceMs":300000} (moves the script's clock), POST /__hold {"submissionId","category"} (another family's hold)
import http from 'node:http';
import { createSandbox } from './gas-sandbox.mjs';

export function startMockBackend({ port = Number(process.env.MOCK_PORT || 8787), delay = Number(process.env.MOCK_DELAY || 0) } = {}) {
  // Like the live Sheet, timestamps (and dates of birth) come back as dates.
  let gas = createSandbox({ sheetDates: true });
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => setTimeout(() => {
      try {
        if (url.pathname === '/exec' && req.method === 'GET') return send(res, 200, gas.doGet(Object.fromEntries(url.searchParams)));
        if (url.pathname === '/exec' && req.method === 'POST') { gas.resetRate(); return send(res, 200, gas.doPost(body)); }
        if (url.pathname === '/__seed') { const { category, count } = JSON.parse(body); gas.seed(category, count); return send(res, 200, gas.doGet({ action: 'seats' })); }
        if (url.pathname === '/__clock') { const { advanceMs = 0 } = JSON.parse(body || '{}'); return send(res, 200, { ok: true, offset: gas.advance(advanceMs) }); }
        if (url.pathname === '/__hold') { const { submissionId, category } = JSON.parse(body); gas.resetRate(); return send(res, 200, gas.doPost({ action: 'hold', submissionId, category })); }
        if (url.pathname === '/__reset') { gas = createSandbox({ sheetDates: true }); return send(res, 200, { ok: true }); }
        if (url.pathname === '/__state') {
          // Dates shown as the Sheet would show them: a day, or a day and time.
          const cell = (v) => (Object.prototype.toString.call(v) === '[object Date]' ? (/ 00:00:00$/.test(gas.context.stamp_(v)) ? gas.context.text_(v) : gas.context.stamp_(v)) : v);
          const rows = (n) => (gas.sheet(n)?.rows || []).slice(1).map((r) => r.map(cell));
          const headers = gas.context.HEADERS;
          return send(res, 200, { holds: gas.holds(), headers, kids: rows('Kids registrations'), youth: rows('Youth registrations'), main: [...rows('Kids registrations'), ...rows('Youth registrations')], overflow: rows('Paid, no seat'), files: gas.files });
        }
        send(res, 404, { ok: false });
      } catch (err) {
        console.error(err);
        send(res, 500, { ok: false, error: 'server' });
      }
    }, url.pathname === '/exec' ? delay : 0));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${port}/exec` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMockBackend().then(({ url }) => console.log(`Mock Apps Script backend: ${url}`));
}
