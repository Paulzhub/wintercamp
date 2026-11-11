import { initLangMemory } from './prefs.js';

export function bootPlain() {
  document.documentElement.classList.add('js-ok');
  initLangMemory();
}
