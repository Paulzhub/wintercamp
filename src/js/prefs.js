// Only one thing is kept in the browser: the sound choice. Never form data.
export const prefs = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage blocked: ignore */ }
  },
};
