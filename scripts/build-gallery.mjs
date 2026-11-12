// Reads gallery/photos and gallery/videos, writes optimised copies to public/gallery
// and a manifest to src/generated/gallery.json. Run by `npm run gallery`.
//
// Photos: auto-rotated, resized to 480 / 960 / 1600 px wide WebP.
// Videos: converted to H.264 MP4 (max 1280 px wide) with a poster frame, when ffmpeg
// is installed. Without ffmpeg the original file is copied and no poster is made.
// Optional gallery/captions.json:
//   { "file name.jpg": { "caption": { "en": "" }, "alt": { "en": "" } } }

import { readdir, mkdir, readFile, writeFile, stat, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PHOTOS = path.join(root, 'gallery/photos');
const SRC_VIDEOS = path.join(root, 'gallery/videos');
const OUT = path.join(root, 'public/gallery');
const MANIFEST = path.join(root, 'src/generated/gallery.json');
const WIDTHS = [480, 960, 1600];
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm']);

async function list(dir, exts) {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  return names.filter((n) => !n.startsWith('.') && exts.has(path.extname(n).toLowerCase()));
}

// Stable short id from the file name, so outputs can be cached between runs.
const idFor = (name) => createHash('sha1').update(name).digest('hex').slice(0, 10);

// Display order is the file name. A leading "WhatsApp Image " / "WhatsApp Video "
// is ignored so photos and videos sort together by their timestamp.
const sortKey = (name) => name.replace(/^WhatsApp (Image|Video) /i, '').toLowerCase();

async function newer(src, out) {
  if (!existsSync(out)) return true;
  const [a, b] = await Promise.all([stat(src), stat(out)]);
  return a.mtimeMs > b.mtimeMs;
}

async function hasFfmpeg() {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function buildPhoto(name) {
  const src = path.join(SRC_PHOTOS, name);
  const id = 'p-' + idFor(name);
  const meta = await sharp(src).rotate().metadata();
  const rotated = meta.orientation && meta.orientation >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  const widths = WIDTHS.filter((w) => w <= width);
  if (!widths.length) widths.push(width);
  for (const w of widths) {
    const out = path.join(OUT, `${id}-${w}.webp`);
    if (await newer(src, out)) {
      await sharp(src).rotate().resize({ width: w }).webp({ quality: 74 }).toFile(out);
    }
  }
  return { type: 'photo', id, file: name, width, height, widths };
}

async function buildVideo(name, ffmpeg) {
  const src = path.join(SRC_VIDEOS, name);
  const id = 'v-' + idFor(name);
  const out = path.join(OUT, `${id}.mp4`);
  const poster = path.join(OUT, `${id}-poster.webp`);
  let width = 1280;
  let height = 720;
  let hasPoster = false;
  if (ffmpeg) {
    if (await newer(src, out)) {
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-i', src,
        '-vf', "scale='min(1280,iw)':-2",
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out,
      ]);
    }
    if (await newer(src, poster)) {
      const tmp = path.join(OUT, `${id}-poster.png`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', out, '-frames:v', '1', tmp]);
      await sharp(tmp).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 72 }).toFile(poster);
      await rm(tmp, { force: true });
    }
    const pm = await sharp(poster).metadata();
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out,
    ]);
    const [w, h] = stdout.trim().split(',').map(Number);
    if (w && h) [width, height] = [w, h];
    hasPoster = Boolean(pm.width);
  } else if (await newer(src, out)) {
    await copyFile(src, out);
  }
  return { type: 'video', id, file: name, width, height, poster: hasPoster };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(path.dirname(MANIFEST), { recursive: true });

  let captions = {};
  const captionsFile = path.join(root, 'gallery/captions.json');
  if (existsSync(captionsFile)) {
    try {
      captions = JSON.parse(await readFile(captionsFile, 'utf8'));
    } catch (err) {
      console.warn('gallery: captions.json could not be read, ignoring it:', err.message);
    }
  }

  const photos = await list(SRC_PHOTOS, PHOTO_EXT);
  const videos = await list(SRC_VIDEOS, VIDEO_EXT);
  const ffmpeg = videos.length ? await hasFfmpeg() : false;
  if (videos.length && !ffmpeg) {
    console.warn('gallery: ffmpeg not found. Videos are copied as they are, without posters.');
  }

  const items = [];
  for (const name of photos) {
    try {
      items.push(await buildPhoto(name));
    } catch (err) {
      console.warn(`gallery: skipped photo "${name}":`, err.message);
    }
  }
  for (const name of videos) {
    try {
      items.push(await buildVideo(name, ffmpeg));
    } catch (err) {
      console.warn(`gallery: skipped video "${name}":`, err.message);
    }
  }
  items.sort((a, b) => sortKey(a.file).localeCompare(sortKey(b.file), 'en', { numeric: true }));

  const text = (v) => (v && typeof v === 'object' ? { en: String(v.en || '') } : { en: '' });
  const manifest = items.map((item) => {
    const c = captions[item.file] || {};
    const { file, ...rest } = item;
    return { ...rest, caption: text(c.caption), alt: text(c.alt) };
  });

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`gallery: ${photos.length} photos, ${videos.length} videos -> ${manifest.length} items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
