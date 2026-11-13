// Pre-renders the pages so every word of content is in the delivered HTML:
//   index.html and privacy/index.html
// plus public/robots.txt, public/sitemap.xml, public/llms.txt, and small
// public/bo/ pages that send old Tibetan links to the English page.
// These outputs are generated files (git-ignored). Edit this script, site.config.js
// or src/i18n/*.json instead.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.js';
import { icons } from './icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const base = process.env.WC_BASE || config.site.basePath;
const origin = config.site.origin;
const appsScriptUrl = process.env.WC_APPS_SCRIPT_URL || config.appsScriptUrl;

const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const strings = { en: await readJson('src/i18n/en.json') };
const gallery = await readJson('src/generated/gallery.json');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const phone = config.contact.phoneDisplay;
const tel = config.contact.phoneHref;

const urls = {
  en: { home: base, privacy: `${base}privacy/` },
};
const abs = (p) => origin + p;

function csp() {
  if (dev) return '';
  const connect = ["'self'", 'https://script.google.com', 'https://script.googleusercontent.com', 'https://*.googleusercontent.com'];
  if (appsScriptUrl) {
    const o = new URL(appsScriptUrl).origin;
    if (!/google(usercontent)?\.com$/.test(new URL(appsScriptUrl).hostname)) connect.push(o);
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${esc(policy)}">`;
}

function jsonLd(lang, t) {
  const place = {
    '@type': 'Place',
    name: config.venue.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${config.venue.name}, ${config.venue.street}`,
      addressLocality: config.venue.locality,
      addressRegion: config.venue.region,
      postalCode: config.venue.postalCode,
      addressCountry: config.venue.countryCode,
    },
  };
  const org = {
    '@type': 'Organization',
    '@id': abs(base) + '#organisation',
    name: config.camp.organiser,
    url: abs(base),
    telephone: phone,
    contactPoint: { '@type': 'ContactPoint', telephone: phone, contactType: 'registration', availableLanguage: ['en'] },
  };
  const event = (key, label, minAge, maxAge) => ({
    '@type': 'Event',
    '@id': abs(base) + '#' + key,
    name: `${config.camp.name}: ${label}`,
    description: `${config.camp.name}, ${config.camp.theme}: ${config.camp.themeLine}. ${label}. Games, craft, storytelling, music time, snacks and lunch, and a picnic on day 3. Fee ${config.fee.display} (non-refundable). ${config.categories[key].seats} seats, first come first served.`,
    startDate: config.categories[key].start,
    endDate: config.categories[key].end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place,
    organizer: { '@id': org['@id'] },
    image: abs(base) + 'og-image.jpg',
    inLanguage: 'en',
    isAccessibleForFree: false,
    maximumAttendeeCapacity: config.categories[key].seats,
    audience: { '@type': 'PeopleAudience', suggestedMinAge: minAge, ...(maxAge === null ? {} : { suggestedMaxAge: maxAge }) },
    offers: {
      '@type': 'Offer',
      price: String(config.fee.amount),
      priceCurrency: config.fee.currency,
      availability: 'https://schema.org/InStock',
      url: abs(urls[lang].home) + '#register',
      validFrom: '2026-11-11',
    },
  });
  const graph = [
    org,
    { '@type': 'WebSite', '@id': abs(base) + '#website', name: config.camp.name, url: abs(base), inLanguage: 'en', publisher: { '@id': org['@id'] } },
    event('youth', 'Youth (11 and over)', 11, null),
    event('kids', 'Kids (11 and under)', 0, 11),
    {
      '@type': 'FAQPage',
      '@id': abs(urls[lang].home) + '#faq',
      inLanguage: lang,
      mainEntity: t.faq.items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
    },
  ];
  // "<" is escaped so the data block can never close the script element early.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

function head({ lang, t, title, description, pathKey, withLd }) {
  const self = urls[lang][pathKey];
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${csp()}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#180E55">
<meta name="color-scheme" content="dark light">
<link rel="canonical" href="${abs(self)}">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.camp.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(self)}">
<meta property="og:locale" content="en_IN">
<meta property="og:image" content="${abs(base)}og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(t.meta.ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${abs(base)}og-image.jpg">
<noscript><link rel="stylesheet" href="${base}nojs.css"></noscript>
${withLd ? `<script type="application/ld+json">${jsonLd(lang, t)}</script>` : ''}`;
}

const en = (s) => `<span lang="en">${s}</span>`;
const brandWord = 'ILLUMINATE';

// The Day 3 picnic card shows a gallery photo behind its text (Paul, round 8: gallery
// item 20, children playing a group game outdoors). Found by id so it stays the same
// photo if the gallery order changes; left out if the photo is removed.
const PICNIC_PHOTO = 'p-3514f4ca1f';
function picnicPhoto(lang) {
  const item = gallery.find((g) => g.id === PICNIC_PHOTO && g.type === 'photo');
  if (!item) return '';
  const src = (w) => `${base}gallery/${item.id}-${w}.webp`;
  const srcset = item.widths.map((w) => `${src(w)} ${w}w`).join(', ');
  const w = item.widths[item.widths.length - 1];
  return `<img class="card__photo" src="${src(item.widths[1] || w)}" srcset="${srcset}" sizes="(min-width: 1024px) 66vw, 100vw" width="${w}" height="${Math.round((w * item.height) / item.width)}" alt="${esc(item.alt[lang] || item.alt.en || '')}" loading="lazy" decoding="async" draggable="false">`;
}

function galleryItems(lang, t) {
  const total = gallery.length;
  return gallery
    .map((item, i) => {
      const n = i + 1;
      const fallbackAlt = item.type === 'video' ? t.gallery.videoAlt : t.gallery.photoAlt;
      const alt = item.alt[lang] || item.alt.en || fallbackAlt;
      const caption = item.caption[lang] || '';
      let img;
      let data = `data-type="${item.type}" data-w="${item.width}" data-h="${item.height}"`;
      if (item.type === 'photo') {
        const src = (w) => `${base}gallery/${item.id}-${w}.webp`;
        const srcset = item.widths.map((w) => `${src(w)} ${w}w`).join(', ');
        const small = item.widths[0];
        const ratio = item.height / item.width;
        img = `<img src="${src(small)}" srcset="${srcset}" sizes="(min-width: 1024px) 480px, 72vw" width="${small}" height="${Math.round(small * ratio)}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false">`;
        data += ` data-full="${src(item.widths[item.widths.length - 1])}" data-fw="${item.widths[item.widths.length - 1]}"`;
      } else {
        const poster = item.poster ? `${base}gallery/${item.id}-poster.webp` : '';
        img = poster
          ? `<img src="${poster}" width="${item.width}" height="${item.height}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false">`
          : `<span class="car__noposter" role="img" aria-label="${esc(alt)}"></span>`;
        data += ` data-video="${base}gallery/${item.id}.mp4"${poster ? ` data-poster="${poster}"` : ''}`;
      }
      return `<li class="car__item" ${data}>
  <button type="button" class="car__btn" aria-label="${esc(fill(t.gallery.open, { n, total }))}" data-cursor="${esc(item.type === 'video' ? t.gallery.cursorPlay : t.gallery.cursorView)}">
    <span class="car__media skeleton">${img}</span>
    ${item.type === 'video' ? `<span class="car__play" aria-hidden="true">${icons.play}</span>` : ''}
  </button>
  ${caption ? `<p class="car__caption glass">${esc(caption)}</p>` : ''}
</li>`;
    })
    .join('\n');
}

function registration(lang, t) {
  const r = t.reg;
  const f = r.f;
  const req = `<span class="req" aria-hidden="true">*</span>`;
  const opt = `<span class="opt">(${esc(r.optional)})</span>`;
  const err = (id) => `<p class="field__error" id="err-${id}" hidden></p>`;
  const years = [];
  for (let y = 2027; y >= 1950; y--) years.push(y); // Youth has no upper age limit
  const options = (list) => list.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  const cat = (key) => `<article class="cat" data-cat="${key}">
  <div class="cat__head">
    <h4 class="cat__title">${esc(r[key])}</h4>
    <span class="cat__icon" aria-hidden="true">${key === 'kids' ? icons.kids : icons.youth}</span>
  </div>
  <p class="cat__age">${esc(r[key + 'Age'])}</p>
  <p class="cat__dates">${esc(r[key + 'Dates'])}</p>
  <p class="cat__seats" data-seats><span class="skeleton skeleton--text">${esc(r.seatsLoading)}</span></p>
  <p class="cat__full" data-full hidden><span lang="en">${esc(r.full)}</span>${r.fullLocal ? `<br><span>${esc(r.fullLocal)}</span>` : ''} <a class="link" href="${tel}">${esc(fill(t.common.call, { phone }))}</a></p>
  <p class="cat__held" data-held hidden><span>${esc(r.heldNote)}</span> <button type="button" class="link" data-recheck>${esc(r.checkAgain)}</button></p>
  <button type="button" class="btn btn--dark cat__choose" data-choose disabled><span class="btn__label">${esc(fill(r.choose, { category: r[key] }))}</span></button>
  <p class="cat__chosen" data-chosen hidden><span class="cat__check" aria-hidden="true">${icons.check}</span> ${esc(fill(r.chosen, { category: r[key] }))} <button type="button" class="link cat__change" data-change>${esc(r.change)}</button></p>
</article>`;

  return `<dialog class="reg" id="register" data-tone="light" data-particles="accent" data-particles-density="0.6" aria-labelledby="reg-title">
<div class="reg__bar" data-tone="dark">
  <h2 class="reg__title" id="reg-title">${esc(r.title)}</h2>
  <button type="button" class="icon-btn" data-close-register aria-label="${esc(t.common.close)}">${icons.close}</button>
</div>
<div class="reg__scroll">
<div class="reg__inner">

<section class="reg__pick" id="reg-pick" aria-labelledby="reg-pick-title">
  <h3 class="reg__h" id="reg-pick-title">${esc(r.pick)}</h3>
  <p class="reg__help" id="reg-pick-help">${esc(r.pickHelp)}</p>
  <p class="notice notice--info reg__hold-note" id="reg-hold-note">${esc(r.holdNote)}</p>
  <div class="cats">${cat('kids')}${cat('youth')}</div>
  <p class="notice notice--error" id="seats-error" role="alert" hidden><span>${esc(fill(r.seatsError, { phone }))}</span> <button type="button" class="link" id="seats-retry">${esc(r.retry)}</button></p>
</section>

<form class="form" id="reg-form" novalidate hidden autocomplete="on">
  <ol class="steps" id="reg-steps" aria-label="${esc(r.steps.join(', '))}">
    ${r.steps.map((s, i) => `<li class="steps__item" data-step-dot="${i}"><span class="steps__num" aria-hidden="true">${i + 1}</span><span class="steps__name">${esc(s)}</span></li>`).join('')}
  </ol>
  <p class="sr-only" id="step-status" role="status" aria-live="polite"></p>
  <div class="notice notice--error form__summary" id="form-summary" role="alert" tabindex="-1" hidden></div>
  <p class="form__note">${esc(r.requiredNote)}</p>
  <p class="notice notice--info" id="draft-note" role="status" hidden></p>

  <div class="hp" aria-hidden="true"><label for="f-website">Website</label><input type="text" id="f-website" name="website" tabindex="-1" autocomplete="off"></div>

  <fieldset class="step" data-step="0">
    <legend class="step__legend">${esc(r.steps[0])}</legend>
    <div class="field">
      <label class="field__label" for="f-name">${esc(f.name)} ${req}</label>
      <p class="field__help" id="help-name">${esc(f.nameHelp)}</p>
      <input class="input" type="text" id="f-name" name="name" maxlength="100" autocomplete="off" required aria-describedby="help-name err-name">
      ${err('name')}
    </div>
    <fieldset class="field field--group" id="f-dob" aria-describedby="err-dob">
      <legend class="field__label">${esc(f.dob)} ${req}</legend>
      <div class="dob">
        <label class="dob__part"><span class="dob__label">${esc(f.day)}</span>
          <select class="input" id="f-dob-d" name="dobDay" required><option value=""></option>${options(Array.from({ length: 31 }, (_, i) => [i + 1, i + 1]))}</select></label>
        <label class="dob__part dob__part--wide"><span class="dob__label">${esc(f.month)}</span>
          <select class="input" id="f-dob-m" name="dobMonth" required><option value=""></option>${options(r.months.map((m, i) => [i + 1, m]))}</select></label>
        <label class="dob__part"><span class="dob__label">${esc(f.year)}</span>
          <select class="input" id="f-dob-y" name="dobYear" required><option value=""></option>${options(years.map((y) => [y, y]))}</select></label>
      </div>
      ${err('dob')}
    </fieldset>
  </fieldset>

  <fieldset class="step" data-step="1" hidden>
    <legend class="step__legend">${esc(r.steps[1])}</legend>
    <div class="field">
      <label class="field__label" for="f-parent">${esc(f.parent)} ${req}</label>
      <input class="input" type="text" id="f-parent" name="parent" maxlength="150" autocomplete="name" required aria-describedby="err-parent">
      ${err('parent')}
    </div>
    <div class="field">
      <label class="field__label" for="f-address">${esc(f.address)} ${req}</label>
      <textarea data-lenis-prevent class="input" id="f-address" name="address" rows="3" maxlength="400" autocomplete="street-address" required aria-describedby="err-address"></textarea>
      ${err('address')}
    </div>
    <fieldset class="field field--group" id="f-phones" aria-describedby="err-phones">
      <legend class="field__label">${esc(f.phones)} ${req}</legend>
      <p class="field__help" id="help-phones">${esc(f.phoneHelp)}</p>
      <div class="phones" id="phones-list"></div>
      <p class="field__warn" id="warn-phones" role="status" aria-live="polite"></p>
      <button type="button" class="btn btn--ghost btn--sm" id="phone-add"><span class="btn__icon" aria-hidden="true">${icons.plus}</span><span class="btn__label">${esc(f.addPhone)}</span></button>
      ${err('phones')}
    </fieldset>
    <div class="field">
      <label class="field__label" for="f-medical">${esc(f.medical)} ${opt}</label>
      <p class="field__help" id="help-medical">${esc(f.noneOk)}</p>
      <textarea data-lenis-prevent class="input" id="f-medical" name="medical" rows="3" maxlength="1000" aria-describedby="help-medical err-medical"></textarea>
      ${err('medical')}
    </div>
    <div class="field">
      <label class="field__label" for="f-dietary">${esc(f.dietary)} ${opt}</label>
      <p class="field__help" id="help-dietary">${esc(f.noneOk)}</p>
      <textarea data-lenis-prevent class="input" id="f-dietary" name="dietary" rows="3" maxlength="1000" aria-describedby="help-dietary err-dietary"></textarea>
      ${err('dietary')}
    </div>
  </fieldset>

  <fieldset class="step" data-step="2" hidden>
    <legend class="step__legend">${esc(r.steps[2])}</legend>
    <div class="statement" id="consent-statement">
      ${f.consentStatementLocal ? `<p>${esc(f.consentStatementLocal)}</p>` : ''}
      <p lang="en">${esc(f.consentStatement)}</p>
    </div>
    <fieldset class="field field--group" id="f-consent" aria-describedby="consent-statement err-consent">
      <legend class="field__label">${esc(f.consentLegend)} ${req}</legend>
      <div class="radios">
        <label class="choice"><input type="radio" name="consent" value="yes" required><span class="choice__box" aria-hidden="true"></span><span class="choice__text">${esc(f.yes)}</span></label>
        <label class="choice"><input type="radio" name="consent" value="no"><span class="choice__box" aria-hidden="true"></span><span class="choice__text">${esc(f.no)}</span></label>
      </div>
      ${err('consent')}
    </fieldset>
    <div class="field">
      <label class="choice choice--check"><input type="checkbox" id="f-agree" name="agree" required aria-describedby="err-agree"><span class="choice__box" aria-hidden="true">${icons.check}</span><span class="choice__text">${esc(f.agree)} ${req}${f.agreeOriginal ? `<span class="choice__orig" lang="en">${esc(f.agreeOriginal)}</span>` : ''}</span></label>
      ${err('agree')}
    </div>
    <div class="field">
      <div class="field__row">
        <span class="field__label" id="sign-label">${esc(f.signed)} ${req}</span>
        <button type="button" class="tip-btn" data-tip="${esc(f.signTip)}" aria-label="${esc(f.signTip)}">${icons.help}</button>
      </div>
      <div class="sign" id="sign-wrap">
        <canvas class="sign__canvas" id="f-sign" width="640" height="240" role="img" aria-label="${esc(f.signCanvas)}" aria-describedby="err-signature"></canvas>
        <span class="sign__prompt" id="sign-prompt" aria-hidden="true">${esc(f.signHere)}</span>
        <button type="button" class="btn btn--ghost btn--sm sign__clear" id="f-sign-clear"><span class="btn__label">${esc(f.signClear)}</span></button>
      </div>
      <div class="sign-typed" id="sign-typed" hidden>
        <label class="field__label" for="f-sign-typed">${esc(f.signTyped)} ${req}</label>
        <p class="field__help" id="help-sign-typed">${esc(f.signTypedHelp)}</p>
        <input class="input sign-typed__input" type="text" id="f-sign-typed" name="signatureTyped" maxlength="150" autocomplete="name" aria-describedby="help-sign-typed err-signature">
      </div>
      <p class="sign__switch"><button type="button" class="link" id="sign-mode" aria-controls="sign-wrap sign-typed" data-type="${esc(f.signTypeToggle)}" data-draw="${esc(f.signDrawToggle)}">${esc(f.signTypeToggle)}</button></p>
      ${err('signature')}
    </div>
    <div class="field">
      <label class="field__label" for="f-signdate">${esc(f.signDate)} ${req}</label>
      <input class="input input--date" type="date" id="f-signdate" name="signDate" required aria-describedby="err-signDate">
      ${err('signDate')}
    </div>
    <p class="field__help"><a class="link" href="${urls[lang].privacy}" target="_blank" rel="noopener noreferrer">${esc(f.privacy)}</a></p>
  </fieldset>

  <fieldset class="step" data-step="3" hidden>
    <legend class="step__legend">${esc(r.steps[3])}</legend>
    <div class="pay__checking" id="pay-checking" role="status"><span class="spinner" aria-hidden="true"></span> ${esc(r.pay.checking)}</div>
    <div class="notice notice--full" id="pay-full" role="alert" hidden><span lang="en">${esc(r.full)}</span>${r.fullLocal ? `<br><span>${esc(r.fullLocal)}</span>` : ''} <a class="link" href="${tel}">${esc(fill(t.common.call, { phone }))}</a>
      <p class="pay__held" id="pay-held" hidden><span>${esc(r.heldNote)}</span> <button type="button" class="link" id="pay-recheck">${esc(r.checkAgain)}</button></p></div>
    <div class="notice notice--error" id="pay-dup" role="alert" hidden>${esc(fill(r.err.duplicateBefore, { phone }))}</div>
    <div class="pay" id="pay-panel" hidden>
      <h3 class="pay__title">${esc(r.pay.title)}</h3>
      <div class="hold" id="hold" hidden>
        <p class="hold__text" id="hold-text" aria-hidden="true"></p>
        <span class="hold__bar" aria-hidden="true"><span class="hold__fill" id="hold-fill"></span></span>
        <p class="sr-only" id="hold-live" role="status" aria-live="polite"></p>
        <div class="hold__ended" id="hold-ended" hidden>
          <p id="hold-ended-text"></p>
          <button type="button" class="btn btn--red btn--sm" id="hold-again"><span class="btn__label">${esc(r.hold.again)}</span></button>
        </div>
      </div>
      <div class="field pay__refund">
        <p class="notice notice--info" id="help-refund">${esc(r.pay.nonRefundable)}</p>
        <label class="choice choice--check"><input type="checkbox" id="f-refund" name="refundAck" required aria-describedby="help-refund err-refund"><span class="choice__box" aria-hidden="true">${icons.check}</span><span class="choice__text">${esc(r.pay.refundAck)} ${req}</span></label>
        ${err('refund')}
      </div>
      <p class="notice notice--info pay__help" id="pay-help">${esc(r.pay.help)}</p>
      <div class="pay__grid">
        <figure class="pay__qr"><img src="/assets/payment/upi-qr.jpg" width="1152" height="1600" alt="${esc(r.pay.qrAlt)}" loading="lazy" decoding="async"><figcaption class="field__help pay__qr-help">${esc(r.pay.qrHelp)}</figcaption></figure>
        <div class="pay__details">
          <p class="pay__row"><span class="pay__k">${esc(r.pay.payee)}</span><strong class="pay__v" lang="en">${esc(config.upi.payeeName)}</strong></p>
          <p class="notice notice--info">${esc(r.pay.payeeCheck)}</p>
          <p class="pay__row"><span class="pay__k">${esc(r.pay.upiId)}</span><span class="pay__v pay__v--id" id="upi-id" lang="en">${esc(config.upi.id)}</span>
            <button type="button" class="btn btn--ghost btn--sm" id="upi-copy" data-copy="#upi-id" data-tip="${esc(r.pay.copyTip)}"><span class="btn__icon" aria-hidden="true">${icons.copy}</span><span class="btn__label" data-copy-label>${esc(r.pay.copy)}</span></button></p>
          <p class="sr-only" id="copy-status" role="status" aria-live="polite"></p>
          <p class="pay__row"><span class="pay__k">${esc(r.pay.phone)}</span><span class="pay__v pay__v--id" id="upi-phone" lang="en">${esc(config.upi.phone)}</span>
            <button type="button" class="btn btn--ghost btn--sm" id="phone-copy" data-copy="#upi-phone" data-tip="${esc(r.pay.phoneCopyTip)}"><span class="btn__icon" aria-hidden="true">${icons.copy}</span><span class="btn__label" data-copy-label>${esc(r.pay.copy)}</span></button></p>
          <p class="pay__row pay__row--code"><span class="pay__k">${esc(r.pay.code)}</span><strong class="pay__v pay__v--id" id="pay-code" lang="en"></strong></p>
          <p class="field__help pay__code-help" id="pay-code-help">${esc(r.pay.codeHelp)}</p>
        </div>
      </div>
      <div class="field">
        <span class="field__label" id="shot-label">${esc(r.pay.shot)} ${req}</span>
        <p class="field__help" id="help-shot">${esc(r.pay.shotHelp)}</p>
        <div class="shot" id="shot">
          <input class="sr-only shot__input" type="file" id="f-shot" name="screenshot" accept="image/jpeg,image/png,image/webp" aria-labelledby="shot-label" aria-describedby="help-shot err-shot">
          <label class="btn btn--dark shot__choose" for="f-shot" id="shot-choose"><span class="btn__icon" aria-hidden="true">${icons.upload}</span><span class="btn__label" data-shot-label>${esc(r.pay.shotChoose)}</span></label>
          <div class="shot__preview" id="shot-preview" hidden>
            <img id="shot-img" alt="${esc(r.pay.shotPreview)}">
            <button type="button" class="btn btn--ghost btn--sm" id="shot-remove"><span class="btn__label">${esc(r.pay.shotRemove)}</span></button>
          </div>
        </div>
        ${err('shot')}
      </div>
      <div class="field">
        <label class="field__label" for="f-ref">${esc(r.pay.ref)} ${opt}</label>
        <p class="field__help" id="help-ref">${esc(r.pay.refHelp)}</p>
        <input class="input" type="text" id="f-ref" name="paymentRef" maxlength="64" autocomplete="off" inputmode="numeric" aria-describedby="help-ref err-ref">
        ${err('ref')}
      </div>
      <p class="field__help" id="submit-hint">${esc(r.pay.submitNeedShot)}</p>
    </div>
  </fieldset>

  <div class="notice notice--error" id="send-error" role="alert" hidden></div>
  <p class="form__blocked" id="step-blocked" hidden>${esc(r.blocked)}</p>
  <p class="form__gate" id="step-gate" hidden>${esc(`${r.gate.lead} ${r.gate.consent}, ${r.gate.agree} ${r.gate.and} ${r.gate.sign}.`)}</p>
  <div class="form__nav">
    <button type="button" class="btn btn--ghost" id="reg-back" hidden><span class="btn__label">${esc(r.back)}</span></button>
    <button type="button" class="btn btn--red" id="reg-next" aria-describedby="step-gate"><span class="btn__label">${esc(r.next)}</span></button>
    <button type="submit" class="btn btn--red" id="reg-submit" hidden disabled aria-describedby="submit-hint"><span class="spinner" aria-hidden="true"></span><span class="btn__label">${esc(r.pay.submit)}</span></button>
  </div>
</form>

<section class="done" id="reg-done" hidden tabindex="-1" aria-labelledby="done-title">
  <div class="done__burst" aria-hidden="true"><span class="done__ring"></span><span class="done__check">${icons.check}</span></div>
  <h3 class="done__title" id="done-title">${esc(r.done.title)}</h3>
  <p class="done__text" id="done-text"></p>
  <dl class="done__facts">
    <div><dt>${esc(r.done.name)}</dt><dd id="done-name"></dd></div>
    <div><dt>${esc(r.done.category)}</dt><dd id="done-category"></dd></div>
    <div><dt>${esc(r.done.dates)}</dt><dd id="done-dates"></dd></div>
    <div><dt>${esc(r.done.venue)}</dt><dd>${esc(r.done.venueValue)}</dd></div>
  </dl>
  <div class="done__share">
    <button type="button" class="btn btn--red" id="done-save"><span class="spinner" aria-hidden="true"></span><span class="btn__icon" aria-hidden="true">${icons.download}</span><span class="btn__label">${esc(r.done.download)}</span></button>
    <button type="button" class="btn btn--dark" id="done-share" hidden><span class="btn__icon" aria-hidden="true">${icons.share}</span><span class="btn__label">${esc(r.done.share)}</span></button>
  </div>
  <p class="done__note">${esc(r.done.private)}</p>
  <p class="done__note done__note--copy" id="done-copy" role="status" hidden></p>
  <p class="done__note done__note--error" id="done-error" role="alert" hidden>${esc(r.done.pdfError)}</p>
  <p class="sr-only" id="done-status" role="status" aria-live="polite"></p>
  <button type="button" class="btn btn--ghost" data-close-register><span class="btn__label">${esc(r.done.close)}</span></button>
</section>

<section class="done done--last" id="reg-dup" hidden tabindex="-1" aria-labelledby="dup-title">
  <h3 class="done__title" id="dup-title">${esc(r.dup.title)}</h3>
  <p class="done__text">${esc(r.dup.text)}</p>
  <p class="done__text done__text--strong">${esc(r.dup.call)}</p>
  <a class="btn btn--red" href="${tel}"><span class="btn__icon" aria-hidden="true">${icons.phone}</span><span class="btn__label">${esc(fill(t.common.call, { phone }))}</span></a>
</section>

<section class="done done--last" id="reg-last" hidden tabindex="-1" aria-labelledby="last-title">
  <h3 class="done__title" id="last-title" lang="en">${esc(r.lastSeat)}</h3>
  ${r.lastSeatLocal ? `<p class="done__text">${esc(r.lastSeatLocal)}</p>` : ''}
  <p class="done__text">${esc(r.lastSeatNote)}</p>
  <p class="done__text done__text--strong">${esc(r.lastSeatRefund)}</p>
  <a class="btn btn--red" href="${tel}"><span class="btn__icon" aria-hidden="true">${icons.phone}</span><span class="btn__label">${esc(fill(t.common.call, { phone }))}</span></a>
</section>

</div>
</div>
</dialog>`;
}

// The same menu bar on every page. On the home page the links jump within the page
// and the Register buttons open the registration view; elsewhere they lead to the
// home page sections (/#gallery, /#register).
function siteHeader(lang, t, pathKey) {
  const onHome = pathKey === 'home';
  const pre = onHome ? '' : urls[lang].home;
  const navLinks = [
    ['home', t.nav.home],
    ['activities', t.nav.activities],
    ['gallery', t.nav.gallery],
    ['faq', t.nav.faq],
    ['contact', t.nav.contact],
  ].map(([id, label]) => [`${pre}#${id}`, label]);
  const registerBtn = (cls, label, extra = '') => onHome
    ? `<button type="button" class="${cls}" data-open-register ${extra}><span class="btn__label">${esc(label)}</span></button>`
    : `<a class="${cls}" href="${pre}#register" ${extra}><span class="btn__label">${esc(label)}</span></a>`;
  return `<header class="nav${onHome ? '' : ' nav--sub'}" id="nav" data-tone="dark">
  <a class="nav__brand" href="${pre}#home" aria-label="Illuminate, ${esc(config.camp.name)}: ${esc(t.nav.home)}"><span class="nav__wordmark${onHome ? '' : ' is-shown'}" lang="en" aria-hidden="true">${brandWord}</span></a>
  <nav class="nav__nav" aria-label="${esc(t.nav.label)}">
    <ul class="nav__links">
      ${navLinks.map(([href, label]) => `<li><a class="nav__link" href="${href}" data-text="${esc(label)}"><span>${esc(label)}</span></a></li>`).join('')}
    </ul>
  </nav>
  <div class="nav__actions">
    <button type="button" class="icon-btn sound" data-sound-toggle aria-pressed="false" aria-label="${esc(t.common.soundTip)}" data-tip="${esc(t.common.soundTip)}"><span class="sound__on" aria-hidden="true">${icons.soundOn}</span><span class="sound__off" aria-hidden="true">${icons.soundOff}</span></button>
    ${registerBtn('btn btn--red btn--sm nav__register', t.common.register, `data-magnetic data-cursor="${esc(t.common.register)}"`)}
    <button type="button" class="icon-btn nav__burger" id="menu-open" aria-haspopup="dialog" aria-controls="menu" aria-label="${esc(t.common.menuOpen)}"><span class="burger" aria-hidden="true"><span></span><span></span></span></button>
  </div>
</header>

<dialog class="menu" id="menu" data-tone="dark" aria-label="${esc(t.common.menu)}">
  <div class="menu__bar">
    <span class="nav__wordmark is-shown" lang="en" aria-hidden="true">${brandWord}</span>
    <button type="button" class="icon-btn" id="menu-close" aria-label="${esc(t.common.menuClose)}">${icons.close}</button>
  </div>
  <nav aria-label="${esc(t.common.menu)}">
    <ul class="menu__links">
      ${navLinks.map(([href, label]) => `<li><a class="menu__link" href="${href}">${esc(label)}</a></li>`).join('')}
    </ul>
  </nav>
  <div class="menu__foot">
    ${registerBtn('btn btn--red', t.common.registerNow)}
    <p class="menu__seats" data-seat-line hidden></p>
    <button type="button" class="btn btn--outline sound menu__sound" data-sound-toggle aria-pressed="false"><span class="btn__icon" aria-hidden="true"><span class="sound__on">${icons.soundOn}</span><span class="sound__off">${icons.soundOff}</span></span><span class="btn__label">${esc(t.loader.soundLabel)}</span></button>
    <a class="link" href="${tel}">${phone}</a>
  </div>
</dialog>`;
}

function homePage(lang) {
  const t = strings[lang];
  const a = t.activities;
  const letters = [...brandWord].map((c, i) => `<span class="ltr${i === 0 ? ' ltr--accent' : ''}" aria-hidden="true">${c}</span>`).join('');
  const card = (key, extra = '') => `<li class="card ${extra}" data-reveal>
  <article class="card__in${key === 'picnic' && picnicPhoto(lang) ? ' has-photo' : ''}" data-tilt>
    ${key === 'picnic' ? `${picnicPhoto(lang)}<div class="card__body">` : ''}
    <span class="card__icon icon-${key}" aria-hidden="true">${icons[key]}</span>
    <h3 class="card__title">${esc(a.cards[key].title)}</h3>
    <p class="card__text">${esc(a.cards[key].text)}</p>
    ${key === 'picnic' ? `</div><div class="card__rail"><span class="card__badge">${esc(a.cards.picnic.badge)}</span></div>` : ''}
  </article>
</li>`;
  // Strings the scripts need at run time (no personal data).
  const clientStrings = { lang, api: appsScriptUrl, holdMinutes: config.holdMinutes, live: t.hero.live, common: t.common, gallery: t.gallery, reg: t.reg, phone, tel, cats: config.categories, count: t.hero.count, pay: { amount: config.fee.display, payee: config.upi.payeeName, upiId: config.upi.id } };
  const venueLine = `${config.venue.name}, ${config.venue.street}, ${config.venue.locality}, ${config.venue.region}, ${config.venue.country}, ${config.venue.postalCode}`;

  return `<!doctype html>
<html lang="${lang}" class="lang-${lang}">
<head>
${head({ lang, t, title: t.meta.title, description: t.meta.description, pathKey: 'home', withLd: true })}
<script type="module" src="/src/entry-${lang}.js"></script>
</head>
<body>
<a class="skip" href="#main">${esc(t.common.skip)}</a>

<div class="loader" id="loader" role="dialog" aria-modal="true" aria-label="${esc(t.loader.label)}">
  <div class="loader__in">
    <p class="loader__word" lang="en" aria-hidden="true">${[...brandWord].map((c) => `<span class="loader__ltr">${c}</span>`).join('')}</p>
    <p class="loader__sub">${esc(t.hero.sub)}</p>
    <div class="loader__bar" role="progressbar" aria-label="${esc(t.loader.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
    <div class="loader__choice">
      <div class="loader__step" id="loader-sound" role="group" aria-label="${esc(t.loader.soundLabel)}" hidden>
        <div class="loader__actions" id="loader-actions">
          <button type="button" class="btn btn--red" id="enter-sound"><span class="btn__icon" aria-hidden="true">${icons.soundOn}</span><span class="btn__label">${esc(t.loader.withSound)}</span></button>
          <button type="button" class="btn btn--outline" id="enter-silent"><span class="btn__label">${esc(t.loader.silent)}</span></button>
        </div>
      </div>
    </div>
  </div>
</div>

${siteHeader(lang, t, 'home')}

<main id="main" tabindex="-1">

<section class="hero dark" id="home" data-section>
  <div class="hero__scene" aria-hidden="true">
    <div class="hero__glow"></div>
    <svg class="hero__ridges" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" focusable="false">
      <path class="ridge ridge--3" d="M0 380 L120 330 L230 372 L340 290 L450 350 L560 262 L640 318 L760 236 L880 322 L980 276 L1100 340 L1210 286 L1330 346 L1440 300 L1440 600 L0 600Z"/>
      <path class="ridge ridge--2" d="M0 450 L100 410 L210 452 L330 372 L420 424 L540 350 L660 430 L770 366 L900 440 L1010 384 L1130 446 L1260 392 L1360 436 L1440 404 L1440 600 L0 600Z"/>
      <path class="ridge ridge--1" d="M0 520 L140 478 L260 516 L380 462 L520 512 L640 470 L780 522 L920 474 L1060 520 L1200 480 L1320 516 L1440 488 L1440 600 L0 600Z"/>
    </svg>
    <canvas class="hero__canvas" id="scene"></canvas>
  </div>
  <div class="hero__content">
    <h1 class="hero__h1">
      <span class="hero__label" data-hero-in>${esc(t.hero.label)}</span>
      <span class="hero__word" id="hero-word" lang="en"><span class="sr-only">Illuminate</span>${letters}</span>
      <span class="hero__sub" data-hero-in>${esc(t.hero.sub)}</span>
    </h1>
    <dl class="hero__facts" data-hero-in>
      <div class="hero__fact"><dt>${esc(t.hero.youth)}</dt><dd>${esc(t.hero.youthDates)}</dd></div>
      <div class="hero__fact"><dt>${esc(t.hero.kids)}</dt><dd>${esc(t.hero.kidsDates)}</dd></div>
    </dl>
    <p class="hero__venue" data-hero-in><span class="hero__pin" aria-hidden="true">${icons.pin}</span>${esc(t.hero.venue)}</p>
    <div class="hero__cta" data-hero-in>
      <button type="button" class="btn btn--red btn--lg" data-open-register data-magnetic data-cursor="${esc(t.common.register)}"><span class="btn__label">${esc(t.common.registerNow)}</span><span class="btn__icon" aria-hidden="true">${icons.arrow}</span></button>
      <a class="btn btn--outline btn--lg" href="#activities"><span class="btn__label">${esc(t.hero.secondary)}</span></a>
    </div>
    <p class="hero__live" id="hero-live" data-hero-in hidden><span class="hero__live-text"></span> <a class="link hero__live-call" href="${tel}" hidden>${esc(fill(t.common.call, { phone }))}</a></p>
    <p class="hero__count" id="hero-count" data-hero-in hidden><span class="hero__count-vis" aria-hidden="true"><span class="hero__count-b"></span> <span class="hero__count-n"></span> <span class="hero__count-a"></span></span><span class="sr-only hero__count-sr"></span></p>
    <p class="hero__seats" data-hero-in>${esc(t.hero.seats)}</p>
    <noscript><p class="hero__seats">${esc(fill(t.common.noJs, { phone }))}</p></noscript>
  </div>
  <p class="sr-only">${esc(t.hero.sceneAlt)}</p>
</section>

<section class="section light activities" id="activities" data-particles="accent" data-section aria-labelledby="activities-title">
  <div class="wrap">
    <p class="eyebrow" data-reveal>${esc(a.eyebrow)}</p>
    <h2 class="title" id="activities-title" data-title>${esc(a.title)}</h2>
    <p class="lead" data-reveal>${esc(a.lead)}</p>
    <ul class="cards">
      ${card('games')}${card('craft')}${card('story')}${card('music')}${card('food')}${card('picnic', 'card--wide')}
    </ul>
    <div class="strip" data-reveal>
      <dl class="strip__facts">
        <div><dt>${esc(a.strip.dates)}</dt><dd>${esc(a.strip.datesValue)}</dd></div>
        <div><dt>${esc(a.strip.venue)}</dt><dd>${esc(a.strip.venueValue)}</dd></div>
        <div><dt>${esc(a.strip.fee)}</dt><dd>${esc(a.strip.feeValue)}</dd></div>
      </dl>
      <button type="button" class="btn btn--red" data-open-register data-magnetic data-cursor="${esc(t.common.register)}"><span class="btn__label">${esc(t.common.registerNow)}</span><span class="btn__icon" aria-hidden="true">${icons.arrow}</span></button>
    </div>
  </div>
</section>

<section class="section dark gallery" id="gallery" data-particles="secondary" data-section aria-labelledby="gallery-title">
  <div class="wrap">
    <p class="eyebrow" data-reveal>${esc(t.gallery.eyebrow)}</p>
    <h2 class="title" id="gallery-title" data-title>${esc(t.gallery.title)}</h2>
    <p class="lead" data-reveal>${esc(t.gallery.lead)}</p>
  </div>
  ${
    gallery.length
      ? `<div class="car" id="carousel" role="region" aria-roledescription="carousel" aria-label="${esc(t.gallery.regionLabel)}" tabindex="0" data-cursor="${esc(t.gallery.cursorDrag)}" data-reveal>
    <ul class="car__track" id="car-track">
${galleryItems(lang, t)}
    </ul>
    <div class="car__controls glass">
      <button type="button" class="icon-btn car__arrow" id="car-prev" aria-label="${esc(t.gallery.prev)}" data-magnetic>${icons.left}</button>
      <div class="car__slider">
        <input type="range" class="range" id="car-range" min="0" max="${gallery.length - 1}" step="1" value="0" aria-label="${esc(t.gallery.slider)}" data-tip="${esc(t.gallery.sliderTip)}">
      </div>
      <p class="car__pos" id="car-pos" aria-live="polite">${esc(fill(t.gallery.position, { n: 1, total: gallery.length }))}</p>
      <button type="button" class="icon-btn car__arrow" id="car-next" aria-label="${esc(t.gallery.next)}" data-magnetic>${icons.right}</button>
    </div>
  </div>`
      : `<div class="wrap"><div class="car-empty glass" data-reveal><span class="car-empty__icon" aria-hidden="true">${icons.image}</span><p>${esc(t.gallery.empty)}</p></div></div>`
  }
</section>

<section class="section light faq" id="faq" data-particles="accent" data-section aria-labelledby="faq-title">
  <div class="wrap wrap--narrow">
    <p class="eyebrow" data-reveal>${esc(t.faq.eyebrow)}</p>
    <h2 class="title" id="faq-title" data-title>${esc(t.faq.title)}</h2>
    <div class="faq__list">
      ${t.faq.items
        .map(
          (i) => `<details class="qa" data-reveal>
        <summary class="qa__q"><h3 class="qa__h">${esc(i.q)}</h3><span class="qa__icon" aria-hidden="true">${icons.plus}</span></summary>
        <div class="qa__a"><p>${esc(i.a)}</p></div>
      </details>`,
        )
        .join('\n      ')}
    </div>
    <noscript><p class="notice notice--info">${esc(fill(t.common.noJs, { phone }))}</p></noscript>
  </div>
</section>

</main>

<footer class="footer dark" id="contact" data-particles="secondary" data-section>
  <div class="wrap">
    <div class="footer__grid">
      <div data-reveal>
        <h2 class="footer__h">${esc(t.footer.venueTitle)}</h2>
        <address class="footer__addr" lang="en">${esc(venueLine)}</address>
      </div>
      <div data-reveal>
        <h2 class="footer__h">${esc(t.footer.contactTitle)}</h2>
        <p><a class="footer__tel" href="${tel}" aria-label="${esc(fill(t.common.call, { phone }))}"><span aria-hidden="true">${icons.phone}</span> ${phone}</a></p>
        <p><a class="link" href="${urls[lang].privacy}">${esc(t.footer.privacy)}</a></p>
      </div>
      <div class="footer__tools" data-reveal>
        <a class="icon-btn footer__top" href="#home" aria-label="${esc(t.common.backToTop)}" data-tip="${esc(t.common.backToTop)}" data-magnetic>${icons.up}</a>
      </div>
    </div>
    <p class="footer__line">${esc(t.footer.line)}</p>
  </div>
  <p class="footer__mark" lang="en" data-clip><span>${esc(config.camp.organiser)}</span></p>
  <p class="footer__rights wrap" lang="en">${esc(t.footer.rights)}</p>
</footer>

${registration(lang, t)}

<dialog class="lightbox" id="lightbox" data-tone="dark" aria-label="${esc(t.gallery.lightbox)}">
  <button type="button" class="icon-btn lightbox__close" id="lightbox-close" aria-label="${esc(t.common.close)}">${icons.close}</button>
  <button type="button" class="icon-btn lightbox__nav lightbox__nav--prev" id="lightbox-prev" aria-label="${esc(t.gallery.prev)}">${icons.left}</button>
  <figure class="lightbox__fig" id="lightbox-fig"><div class="lightbox__stage" id="lightbox-stage"></div><figcaption class="lightbox__cap" id="lightbox-cap" aria-live="polite"></figcaption></figure>
  <button type="button" class="icon-btn lightbox__nav lightbox__nav--next" id="lightbox-next" aria-label="${esc(t.gallery.next)}">${icons.right}</button>
</dialog>

<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">
  <filter id="liquid-glass" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise"/>
    <feGaussianBlur in="noise" stdDeviation="2" result="soft"/>
    <feDisplacementMap in="SourceGraphic" in2="soft" scale="56" xChannelSelector="R" yChannelSelector="G" result="bent"/>
    <feGaussianBlur in="bent" stdDeviation="3"/>
  </filter>
</svg>

<script type="application/json" id="i18n">${JSON.stringify(clientStrings).replace(/</g, '\\u003c')}</script>
</body>
</html>
`;
}

// Every page other than the home page: the same menu bar, see-through over an
// indigo title band (a small hero, like the home page's), then the light content.
// New sub-pages should be made with this, so no page starts light under the bar.
function subPage({ lang, t, pathKey, title, metaTitle, metaDescription, meta = '', body }) {
  return `<!doctype html>
<html lang="${lang}" class="lang-${lang} page-plain">
<head>
${head({ lang, t, title: metaTitle, description: metaDescription, pathKey, withLd: false })}
<script type="module" src="/src/entry-plain-${lang}.js"></script>
</head>
<body>
<a class="skip" href="#main">${esc(t.common.skip)}</a>
${siteHeader(lang, t, pathKey)}
<main id="main" class="plain" tabindex="-1">
  <div class="page-hero dark" data-tone="dark" data-particles="secondary">
    <div class="wrap wrap--narrow page-hero__inner">
      <p class="page-hero__back"><a class="link" href="${urls[lang].home}">← ${esc(t.privacy.back)}</a></p>
      <h1 class="title page-hero__title">${esc(title)}</h1>
      ${meta ? `<p class="page-hero__meta">${esc(meta)}</p>` : ''}
    </div>
  </div>
  <div class="section light plain__body" data-tone="light" data-particles="accent">
    <div class="wrap wrap--narrow prose">
    ${body}
    </div>
  </div>
</main>
<footer class="footer dark footer--plain" data-particles="secondary">
  <p class="footer__line wrap">${esc(t.footer.line)} · <span lang="en">${esc(config.camp.organiser)}</span></p>
</footer>
<script type="application/json" id="i18n">${JSON.stringify({ lang, common: t.common, phone, tel }).replace(/</g, '\\u003c')}</script>
</body>
</html>
`;
}

function privacyPage(lang) {
  const t = strings[lang];
  const p = t.privacy;
  return subPage({
    lang, t, pathKey: 'privacy', title: p.title, metaTitle: p.metaTitle, metaDescription: p.metaDescription, meta: p.updated,
    body: `${p.sections.map((s) => `<h2>${esc(s.h)}</h2>${s.p.map((x) => `<p>${esc(x)}</p>`).join('')}`).join('\n    ')}
    <p><a class="btn btn--dark" href="${tel}"><span class="btn__icon" aria-hidden="true">${icons.phone}</span><span class="btn__label">${esc(fill(t.common.call, { phone }))}</span></a></p>`,
  });
}

function llmsTxt() {
  const t = strings.en;
  const c = config;
  return `# ${c.camp.name} (${c.camp.organiser})

> ${c.camp.name} is a three-day winter camp for children and young people, run by ${c.camp.organiser} in McLeodganj, Dharamshala, India. The 2027 theme is "${c.camp.theme}: ${c.camp.themeLine}". This website is where parents register and pay.

## Key facts

- Organiser: ${c.camp.organiser}
- Theme: ${c.camp.theme}: ${c.camp.themeLine}
- Youth camp (age 11 and over): 4 to 6 January 2027, ${c.categories.youth.seats} seats
- Kids camp (age 11 and under): 11 to 13 January 2027, ${c.categories.kids.seats} seats
- Venue: ${c.venue.name}, ${c.venue.street}, ${c.venue.locality}, ${c.venue.region}, ${c.venue.country}, ${c.venue.postalCode}
- Fee: ${c.fee.display} per child, paid by UPI (UPI ID ${c.upi.id}, payee name ${c.upi.payeeName}). Non-refundable, except when someone else took the last seat while the family was paying: then the organisers refund it.
- Seats: first come, first served. A seat is held for ${config.holdMinutes} minutes while a family pays, and given only when the registration form is sent with a payment screenshot.
- Activities: games, craft, storytelling, music time, snacks and a hot lunch every day, and a picnic on day 3 with a treasure hunt, team challenges and prizes
- Staff ratio: 1 staff member to 7 children
- Contact: ${c.contact.phoneDisplay}
- Language: English

## Pages

- [${c.camp.name} (English)](${abs(urls.en.home)}): camp details, activities, gallery, questions and answers, registration
- [Privacy notice](${abs(urls.en.privacy)}): what is collected at registration and how it is used

## Questions and answers

${t.faq.items.map((i) => `### ${i.q}\n${i.a}`).join('\n\n')}
`;
}

const robots = `# Winter Camp 2027: search engines and AI crawlers are welcome.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${abs(base)}sitemap.xml
`;

function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const entry = (key) =>
`  <url>
    <loc>${abs(urls.en[key])}</loc>
    <lastmod>${today}</lastmod>
  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entry('home')}
${entry('privacy')}
</urlset>
`;
}

async function out(rel, content) {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

await out('index.html', homePage('en'));
await out('privacy/index.html', privacyPage('en'));
// The Tibetan pages were removed in round 6. Old /bo/ links (shared before then)
// land on these and go straight to the English page, keeping any #section.
const goEnglish = (to) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="1; url=${to}">
<link rel="canonical" href="${abs(to)}">
<title>${esc(config.camp.name)}</title>
<script src="${base}bo/go.js" data-to="${to}"></script>
</head>
<body><p><a href="${to}">${esc(config.camp.name)}</a></p></body>
</html>
`;
await out('public/bo/index.html', goEnglish(urls.en.home));
await out('public/bo/privacy/index.html', goEnglish(urls.en.privacy));
await out('public/bo/go.js', "const s = document.currentScript;\nlocation.replace(s.dataset.to + location.hash);\n");
await out('public/robots.txt', robots);
await out('public/sitemap.xml', sitemap());
await out('public/llms.txt', llmsTxt());
console.log(`pages: rendered (${dev ? 'dev, no CSP' : 'production'}), base ${base}`);
