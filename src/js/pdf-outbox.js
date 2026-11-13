// The organisers' copy of a registration PDF waits here (IndexedDB, in this browser
// only) until the server confirms it is saved in Drive. If the family closes the
// page or switches app before the upload finishes, it is sent again on their next
// visit. Copies are deleted once saved, refused for good, or after 7 days.
const DB = 'wc-outbox';
const STORE = 'pdfs';
const KEEP_MS = 7 * 24 * 3600 * 1000;

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Every call is safe to fail (private browsing, storage full): the upload still runs.
export const keepPdf = (id, dataUrl) => run('readwrite', (s) => s.put({ id, dataUrl, at: Date.now() })).catch(() => null);
export const dropPdf = (id) => run('readwrite', (s) => s.delete(id)).catch(() => null);
export async function waitingPdfs() {
  try {
    const all = (await run('readonly', (s) => s.getAll())) || [];
    const old = all.filter((x) => !(Date.now() - x.at < KEEP_MS));
    await Promise.all(old.map((x) => dropPdf(x.id)));
    return all.filter((x) => Date.now() - x.at < KEEP_MS);
  } catch {
    return [];
  }
}
