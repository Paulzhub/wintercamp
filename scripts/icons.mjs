// Inline SVG icons. All are decorative (their buttons carry the accessible name).
const s = (body, vb = 24) =>
  `<svg viewBox="0 0 ${vb} ${vb}" width="${vb}" height="${vb}" fill="none" stroke="currentColor" stroke-width="${vb === 24 ? 2 : 2.5}" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${body}</svg>`;

export const icons = {
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  arrow: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  left: s('<path d="M15 6l-6 6 6 6"/>'),
  right: s('<path d="M9 6l6 6-6 6"/>'),
  up: s('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  copy: s('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  phone: s('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  pin: s('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  help: s('<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 1-1 1.700M12 17h.01"/>'),
  download: s('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
  share: s('<circle cx="18" cy="5" r="2.500"/><circle cx="6" cy="12" r="2.500"/><circle cx="18" cy="19" r="2.500"/><path d="M8.200 10.800l7.600-4.400M8.200 13.200l7.600 4.400"/>'),
  upload: s('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
  play: s('<path d="M8 5.500v13l11-6.500z" fill="currentColor"/>'),
  image: s('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.500"/><path d="M21 16l-5-5-8 8"/>'),
  soundOn: s('<path d="M4 10v4h3l5 4V6L7 10z"/><path class="wave wave--1" d="M15.500 9.500a3.500 3.500 0 0 1 0 5"/><path class="wave wave--2" d="M18 7a7 7 0 0 1 0 10"/>'),
  soundOff: s('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9.500l5 5M21 9.500l-5 5"/>'),
  kids: s('<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3"/><path d="M9 4.500l-1.500-2M15 4.500l1.500-2"/>'),
  youth: s('<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.500"/><path d="M2.500 21v-2a5.500 5.500 0 0 1 11 0v2M15 21v-1.500a4 4 0 0 1 6.500-3"/>'),

  // Activity icons (48 box). Parts with classes are animated in CSS.
  games: s('<circle class="i-ball" cx="24" cy="26" r="13"/><path class="i-ball" d="M11 26h26M24 13c5 4 5 22 0 26M24 13c-5 4-5 22 0 26"/><path class="i-spark" d="M38 8l1.500 3.500L43 13l-3.500 1.500L38 18l-1.500-3.500L33 13l3.500-1.500z"/>', 48),
  craft: s('<g class="i-blade"><circle cx="13" cy="35" r="5"/><path d="M17 31L38 10"/></g><g class="i-blade i-blade--b"><circle cx="35" cy="35" r="5"/><path d="M31 31L10 10"/></g>', 48),
  story: s('<path d="M24 14c-4-4-11-5-17-4v25c6-1 13 0 17 4 4-4 11-5 17-4V10c-6-1-13 0-17 4z"/><path d="M24 14v25"/><path class="i-spark" d="M24 2l1.200 3L28 6l-2.800 1L24 10l-1.200-3L20 6l2.800-1z"/>', 48),
  music: s('<g class="i-note"><path d="M18 34V11l20-4v23"/><ellipse cx="13" cy="34" rx="5" ry="4"/><ellipse cx="33" cy="30" rx="5" ry="4"/></g>', 48),
  food: s('<path d="M7 24h34a17 17 0 0 1-34 0z"/><path d="M17 41h14"/><path class="i-steam" d="M17 17c-2-3 2-5 0-8"/><path class="i-steam i-steam--b" d="M24 17c-2-3 2-5 0-8"/><path class="i-steam i-steam--c" d="M31 17c-2-3 2-5 0-8"/>', 48),
  picnic: s('<path d="M6 12l12-5 12 5 12-5v29l-12 5-12-5-12 5z"/><path d="M18 7v29M30 12v29"/><path class="i-x" d="M21 20l6 6M27 20l-6 6"/><path class="i-spark" d="M38 16l1 2.500 2.500 1-2.500 1-1 2.500-1-2.500-2.500-1 2.500-1z"/>', 48),
};
