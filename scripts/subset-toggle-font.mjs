// Makes a tiny Jomolhari subset holding only the Tibetan used on the English pages
// (the language toggle and the loader's language question), so those pages need not load the full 360 KB font.
// Run once after changing that text: node scripts/subset-toggle-font.mjs
import { readFile, writeFile } from 'node:fs/promises';
import subsetFont from 'subset-font';

const src = await readFile(new URL('../node_modules/@fontsource/jomolhari/files/jomolhari-tibetan-400-normal.woff2', import.meta.url));
const out = await subsetFont(src, 'བོད་ཡིག སྐད་ཡིག་འདེམས།', { targetFormat: 'woff2' });
await writeFile(new URL('../src/fonts/jomolhari-toggle.woff2', import.meta.url), out);
console.log(`jomolhari-toggle.woff2: ${out.length} bytes`);
