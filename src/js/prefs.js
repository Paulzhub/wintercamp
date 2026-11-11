// Only two things are kept in the browser: language and sound. Never form data.
export const prefs = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage blocked: ignore */ }
  },
};

export function initLangMemory() {
  document.querySelectorAll('a[data-lang]').forEach((a) =>
    a.addEventListener('click', () => prefs.set('wc-lang', a.dataset.lang)),
  );
  // Only the English home page redirects, so a shared /bo/ link always opens in Tibetan.
  const html = document.documentElement;
  if (html.lang === 'en' && !html.classList.contains('page-plain') && prefs.get('wc-lang') === 'bo') {
    const link = document.querySelector('a[data-lang="bo"]');
    if (link) {
      location.replace(link.href + location.hash);
      return true;
    }
  }
  return false;
}
