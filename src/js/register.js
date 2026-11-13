// Registration view: choose Kids or Youth (with live seats), four short steps,
// hand-drawn signature, UPI payment with a required screenshot, one submission.
// The seat is held for 5 minutes once the payment step opens (server "hold").
// A draft of the form (never the payment screenshot) is kept in sessionStorage,
// so it survives the tab being reloaded while the family pays in their UPI app;
// it is deleted when the registration is sent and ends with the browser tab.
import { gsap, reduced, smoothPanel } from './motion.js';
import { T, $, $$, fill } from './i18n.js';
import { openModal } from './modal.js';
import { burst, sweep } from './effects.js';
import { fetchSeats, sendRegistration, sendPdf, sendHold, sendRelease } from './api.js';
import { initSignature } from './signature.js';
import { keepPdf, dropPdf, waitingPdfs } from './pdf-outbox.js';
import { prepareScreenshot } from './image.js';
import { MAX, isoDate, dobProblem, todayIso, validPhone, normPhone, ageOn } from './validate.js';

const STEP_OF = {
  name: 0, dob: 0,
  parent: 1, address: 1, phones: 1, medical: 1, dietary: 1,
  consent: 2, agree: 2, signature: 2, signDate: 2,
  refund: 3, shot: 3, ref: 3,
};
const MAX_PHONES = 4;
const DRAFT_KEY = 'wc-reg-draft';
const DRAFT_HOURS = 24;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
export const regCode = (id) => String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();

export function initRegistration({ audio }) {
  const dlg = $('#register');
  if (!dlg) return;
  const R = T.reg;
  const E = R.err;
  const phone = T.phone;
  const form = $('#reg-form');
  const pick = $('#reg-pick');
  const doneView = $('#reg-done');
  const lastView = $('#reg-last');
  const dupView = $('#reg-dup');
  const steps = $$('.step', form);
  const dots = $$('[data-step-dot]', form);
  const summary = $('#form-summary');
  const sendError = $('#send-error');
  const btnBack = $('#reg-back');
  const btnNext = $('#reg-next');
  const btnSubmit = $('#reg-submit');
  const submitLabel = $('.btn__label', btnSubmit);
  const cards = { kids: $('.cat[data-cat="kids"]', dlg), youth: $('.cat[data-cat="youth"]', dlg) };

  const state = {
    cat: null, step: 0, seats: null, shot: null, shotUrl: null,
    submissionId: null, started: 0, busy: false, payOk: false, touched: new Set(),
    panelShown: false, // the payment details were shown: the family may have paid
    sent: false, pending: false, // pending: a send failed on the network and will be retried
    hold: { exp: 0, timer: 0, warned: false }, // exp: local time the hold ends
  };
  const HOLD_MS = (T.holdMinutes || 5) * 60000;

  // Smooth scrolling inside the registration view (created on first open).
  let panel = null;
  const scrollerEl = $('.reg__scroll', dlg);
  const panelTo = (y, immediate = false) => {
    const top = Math.max(0, y);
    if (panel) panel.scrollTo(top, { immediate, duration: 0.9, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
    else scrollerEl.scrollTo({ top, behavior: immediate || reduced() ? 'auto' : 'smooth' });
  };
  const panelCenter = (el) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = scrollerEl.getBoundingClientRect();
    panelTo(scrollerEl.scrollTop + r.top - w.top - (scrollerEl.clientHeight - r.height) / 2);
  };

  // ---------- Fields ----------
  const f = {
    name: $('#f-name'), dobD: $('#f-dob-d'), dobM: $('#f-dob-m'), dobY: $('#f-dob-y'),
    parent: $('#f-parent'), address: $('#f-address'), medical: $('#f-medical'), dietary: $('#f-dietary'),
    agree: $('#f-agree'), refund: $('#f-refund'), signDate: $('#f-signdate'), shot: $('#f-shot'), ref: $('#f-ref'), website: $('#f-website'),
  };
  const consentInputs = $$('input[name="consent"]', form);
  const phoneList = $('#phones-list');
  const signature = initSignature($('#f-sign'), $('#sign-wrap'), {
    onChange: (ink) => { if (ink) clearError('signature'); updateGate(); },
  });
  $('#f-sign-clear').addEventListener('click', () => signature.clear());
  // People who cannot draw a signature can type their name instead.
  const typedInput = $('#f-sign-typed');
  const modeBtn = $('#sign-mode');
  let typedMode = false;
  function setSignMode(typed, { focus = true } = {}) {
    typedMode = typed;
    $('#sign-wrap').hidden = typed;
    $('#sign-typed').hidden = !typed;
    modeBtn.textContent = typed ? modeBtn.dataset.draw : modeBtn.dataset.type;
    modeBtn.setAttribute('aria-expanded', String(typed));
    clearError('signature');
    updateGate();
    if (typed) { if (focus) typedInput.focus(); }
    else { requestAnimationFrame(() => signature.resize()); if (focus) $('#f-sign-clear').focus(); }
  }
  modeBtn.addEventListener('click', () => setSignMode(!typedMode));
  typedInput.addEventListener('input', () => { if (state.touched.has('signature')) check('signature'); updateGate(); });
  typedInput.addEventListener('blur', () => { if (typedInput.value) { state.touched.add('signature'); check('signature'); } });

  // ---------- Phones ----------
  function addPhone(value = '') {
    const rows = $$('.phone', phoneList);
    if (rows.length >= MAX_PHONES) return null;
    const n = rows.length + 1;
    const row = document.createElement('div');
    row.className = 'phone';
    const id = `f-phone-${n}`;
    const label = document.createElement('label');
    label.className = 'sr-only';
    label.htmlFor = id;
    label.textContent = fill(R.f.phoneN, { n });
    const input = document.createElement('input');
    // No maxlength: it would cut a pasted "+91 98765 43210" before it is cleaned up.
    Object.assign(input, { type: 'tel', id, name: 'phone', className: 'input', inputMode: 'numeric', value });
    input.autocomplete = n === 1 ? 'tel-national' : 'off';
    input.setAttribute('pattern', '[0-9]{10}');
    input.setAttribute('aria-describedby', 'help-phones warn-phones err-phones');
    if (n === 1) input.setAttribute('aria-required', 'true');
    // Allow only digits, at most 10. A pasted +91 or leading 0 is dropped.
    const sanitise = (raw) => {
      let d = raw.replace(/\D/g, '');
      let note = d.length !== raw.replace(/[\s]/g, '').length ? 'phoneDigits' : '';
      if (d.length > 10 && /^91/.test(d) && /^\s*\+?\s*91/.test(raw)) d = d.slice(2);
      else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
      if (d.length > 10) { d = d.slice(0, 10); note = 'phoneMax'; }
      return { d, note };
    };
    // Single key presses are stopped before they appear; pasted or autofilled
    // text is cleaned up afterwards (it may carry spaces or +91).
    input.addEventListener('beforeinput', (e) => {
      if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return;
      if (!/\d/.test(e.data)) { e.preventDefault(); phoneWarn('phoneDigits'); }
      else if (input.value.replace(/\D/g, '').length >= 10 && input.selectionStart === input.selectionEnd) { e.preventDefault(); phoneWarn('phoneMax'); }
    });
    input.addEventListener('input', () => {
      const { d, note } = sanitise(input.value);
      if (d !== input.value) input.value = d;
      if (note) phoneWarn(note);
    });
    row.append(label, input);
    if (n > 1) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'icon-btn';
      rm.setAttribute('aria-label', fill(R.f.removePhone, { n }));
      rm.append($('.lightbox__close svg').cloneNode(true));
      rm.addEventListener('click', () => {
        row.remove();
        renumberPhones();
        $$('.phone input', phoneList).at(-1)?.focus();
      });
      row.append(rm);
    }
    phoneList.append(row);
    input.addEventListener('blur', () => { state.touched.add('phones'); check('phones'); });
    input.addEventListener('input', () => { if (state.touched.has('phones')) check('phones'); });
    $('#phone-add').hidden = $$('.phone', phoneList).length >= MAX_PHONES;
    return input;
  }
  function renumberPhones() {
    $$('.phone', phoneList).forEach((row, i) => {
      const n = i + 1;
      $('label', row).textContent = fill(R.f.phoneN, { n });
      $('button', row)?.setAttribute('aria-label', fill(R.f.removePhone, { n }));
    });
    $('#phone-add').hidden = $$('.phone', phoneList).length >= MAX_PHONES;
  }
  $('#phone-add').addEventListener('click', () => addPhone()?.focus());
  addPhone();

  const phones = () => $$('.phone input', phoneList).map((i) => i.value.trim()).filter(Boolean);
  let warnTimer = 0;
  function phoneWarn(key) {
    const w = $('#warn-phones');
    w.textContent = E[key];
    w.classList.add('is-shown');
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => { w.classList.remove('is-shown'); w.textContent = ''; }, 4000);
  }

  // ---------- Errors ----------
  const targets = {
    name: () => f.name, dob: () => f.dobD, parent: () => f.parent, address: () => f.address,
    phones: () => $('.phone input', phoneList), medical: () => f.medical, dietary: () => f.dietary,
    consent: () => consentInputs[0], agree: () => f.agree, signature: () => (typedMode ? typedInput : $('#f-sign')),
    signDate: () => f.signDate, refund: () => f.refund, shot: () => f.shot, ref: () => f.ref,
  };
  const inputsFor = (key) => ({
    dob: [f.dobD, f.dobM, f.dobY],
    phones: $$('.phone input', phoneList),
    consent: consentInputs,
    signature: typedMode ? [typedInput] : [],
  })[key] || [targets[key]?.()].filter(Boolean);

  function setError(key, msg) {
    const p = $(`#err-${key}`, dlg) || $(`#err-${key === 'phones' ? 'phones' : key}`, dlg);
    if (p) { p.textContent = msg; p.hidden = false; }
    inputsFor(key).forEach((i) => { i.setAttribute('aria-invalid', 'true'); i.classList.remove('is-valid'); });
    if (key === 'signature') $('#sign-wrap').classList.add('is-invalid');
    if (key === 'shot') $('#shot').classList.add('is-invalid');
  }
  function clearError(key, valid = true) {
    const p = $(`#err-${key}`, dlg);
    if (p) { p.textContent = ''; p.hidden = true; }
    inputsFor(key).forEach((i) => {
      i.removeAttribute('aria-invalid');
      if (valid && i.classList.contains('input') && i.value) i.classList.add('is-valid');
    });
    if (key === 'signature') $('#sign-wrap').classList.remove('is-invalid');
    if (key === 'shot') $('#shot').classList.remove('is-invalid');
  }

  // Each rule returns an error message or ''.
  const text = (el) => el.value.trim();
  const rules = {
    name: () => (!text(f.name) ? E.name : text(f.name).length > MAX.name ? E.tooLong : ''),
    dob: () => {
      if (!f.dobD.value || !f.dobM.value || !f.dobY.value) return E.dob;
      const iso = isoDate(f.dobY.value, f.dobM.value, f.dobD.value);
      if (!iso) return E.dobInvalid;
      const p = dobProblem(iso, state.cat, T.cats);
      return p ? E[p] : '';
    },
    parent: () => (!text(f.parent) ? E.parent : text(f.parent).length > MAX.parent ? E.tooLong : ''),
    address: () => (!text(f.address) ? E.address : text(f.address).length > MAX.address ? E.tooLong : ''),
    phones: () => {
      const list = phones();
      if (!list.length) return E.phone;
      return list.every(validPhone) ? '' : E.phone;
    },
    medical: () => (text(f.medical).length > MAX.medical ? E.tooLong : ''),
    dietary: () => (text(f.dietary).length > MAX.dietary ? E.tooLong : ''),
    consent: () => {
      const v = consentInputs.find((i) => i.checked)?.value;
      return !v ? E.consent : v !== 'yes' ? E.consentYes : '';
    },
    agree: () => (f.agree.checked ? '' : E.agree),
    signature: () => {
      if (!typedMode) return signature.hasInk() ? '' : E.signature;
      const v = typedInput.value.trim();
      if (v.length < 2) return E.signTyped;
      return v.length > 150 ? E.tooLong : '';
    },
    signDate: () => {
      const v = f.signDate.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return E.signDate;
      return v > todayIso() ? E.signDateFuture : '';
    },
    refund: () => (f.refund.checked ? '' : E.refund),
    shot: () => (state.shot ? '' : E.shot),
    ref: () => {
      const v = text(f.ref).replace(/[\s-]/g, '');
      if (text(f.ref).length > MAX.ref) return E.tooLong;
      return v && !/^\d{12}$/.test(v) ? E.refFormat : '';
    },
  };
  const STEP_FIELDS = [['name', 'dob'], ['parent', 'address', 'phones', 'medical', 'dietary'], ['consent', 'agree', 'signature', 'signDate'], ['refund', 'shot', 'ref']];

  function check(key) {
    const msg = rules[key]();
    if (msg) setError(key, msg); else clearError(key);
    if (!$('#step-blocked').hidden && STEP_FIELDS[state.step].every((k) => !state.touched.has(k) || !rules[k]())) {
      $('#step-blocked').hidden = true;
      summary.hidden = true;
    }
    return msg;
  }

  // Every required field must be valid before moving on. When something is
  // missing: list the problems at the top, show a note by the buttons, and move
  // to the first field that needs attention.
  function validateStep(n) {
    const errors = [];
    STEP_FIELDS[n].forEach((key) => {
      state.touched.add(key);
      const msg = check(key);
      if (msg) errors.push([key, msg]);
    });
    showSummary(errors, { focus: false });
    $('#step-blocked').hidden = errors.length === 0;
    if (errors.length) {
      const [key] = errors[0];
      const el = key === 'signature' && !typedMode ? $('#sign-wrap') : targets[key]?.();
      panelCenter(el);
      const focusEl = key === 'signature' && !typedMode ? $('#f-sign-clear') : targets[key]?.();
      setTimeout(() => focusEl?.focus({ preventScroll: true }), reduced() ? 0 : 320);
      if (!reduced()) gsap.fromTo(btnNext.hidden ? btnSubmit : btnNext, { x: -8 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)', clearProps: 'transform' });
    }
    return errors.length === 0;
  }

  function showSummary(errors, { focus = true } = {}) {
    summary.replaceChildren();
    if (!errors.length) { summary.hidden = true; return; }
    const p = document.createElement('p');
    p.textContent = E.summary;
    const ul = document.createElement('ul');
    errors.forEach(([key, msg]) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const target = targets[key]();
      a.href = `#${target?.id || ''}`;
      a.textContent = msg;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        (key === 'signature' ? $('#f-sign-clear') : target)?.focus();
        panelCenter(target);
      });
      li.append(a);
      ul.append(li);
    });
    summary.append(p, ul);
    summary.hidden = false;
    if (focus) summary.focus();
  }

  // Validate as people go: on leaving a field, then live once it has been touched.
  [['name', f.name], ['parent', f.parent], ['address', f.address], ['medical', f.medical], ['dietary', f.dietary], ['signDate', f.signDate], ['ref', f.ref]].forEach(([key, el]) => {
    el.addEventListener('blur', () => { if (el.value || state.touched.has(key)) { state.touched.add(key); check(key); } });
    el.addEventListener('input', () => { if (state.touched.has(key)) check(key); });
  });
  [f.dobD, f.dobM, f.dobY].forEach((el) => el.addEventListener('change', () => {
    if (f.dobD.value && f.dobM.value && f.dobY.value) { state.touched.add('dob'); check('dob'); }
    else if (state.touched.has('dob')) check('dob');
  }));
  consentInputs.forEach((i) => i.addEventListener('change', () => { state.touched.add('consent'); check('consent'); updateGate(); audio.play('tick'); }));
  f.agree.addEventListener('change', () => { if (state.touched.has('agree') || f.agree.checked) check('agree'); updateGate(); });

  // Consent and signature: Next stays disabled until medical emergency consent
  // is YES, the agreement box is ticked and there is a signature (drawn on the
  // pad, or a typed full name). The note says only what is still missing.
  function updateGate() {
    const G = R.gate;
    const missing = [];
    if (consentInputs.find((i) => i.checked)?.value !== 'yes') missing.push(G.consent);
    if (!f.agree.checked) missing.push(G.agree);
    if (rules.signature()) missing.push(G.sign);
    const gated = state.step === 2 && missing.length > 0;
    btnNext.disabled = gated;
    const note = $('#step-gate');
    note.hidden = !gated;
    if (gated) {
      const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} ${G.and} ${missing[missing.length - 1]}` : missing[0];
      const msg = `${G.lead} ${list}.`;
      if (note.textContent !== msg) note.textContent = msg;
    }
  }
  f.refund.addEventListener('change', () => { if (state.touched.has('refund') || f.refund.checked) check('refund'); });

  // ---------- Seats and category ----------
  function renderSeats() {
    ['kids', 'youth'].forEach((cat) => {
      const card = cards[cat];
      const info = state.seats?.[cat];
      const seatsEl = $('[data-seats]', card);
      const choose = $('[data-choose]', card);
      if (!info) {
        seatsEl.replaceChildren(Object.assign(document.createElement('span'), { className: 'skeleton skeleton--text', textContent: R.seatsLoading }));
        choose.disabled = true;
        return;
      }
      const full = info.left <= 0;
      card.classList.toggle('is-full', full);
      $('[data-full]', card).hidden = !full;
      // Full only because families are paying right now: a seat may open soon.
      $('[data-held]', card).hidden = !(full && info.held > 0);
      const seatText = fill(R.seatsLeft, { n: Math.max(0, info.left), total: info.total });
      const changed = seatsEl.textContent !== seatText;
      seatsEl.textContent = seatText;
      if (changed) sweep(seatsEl);
      seatsEl.classList.toggle('is-low', info.left <= 5);
      choose.disabled = full;
    });
    if (state.seats) document.dispatchEvent(new CustomEvent('wc:seats', { detail: state.seats }));
  }

  async function loadSeats() {
    state.seats = null;
    $('#seats-error').hidden = true;
    renderSeats();
    try {
      state.seats = await fetchSeats();
      renderSeats();
      dlg.setAttribute('aria-busy', 'false');
    } catch (err) {
      console.warn(err);
      $('#seats-error').hidden = false;
      ['kids', 'youth'].forEach((c) => $('[data-seats]', cards[c]).replaceChildren());
    }
  }
  $('#seats-retry').addEventListener('click', loadSeats);
  $$('[data-recheck]', dlg).forEach((b) => b.addEventListener('click', loadSeats));

  function choose(cat, { force = false, step = 0 } = {}) {
    if (!force && (!state.seats || state.seats[cat].left <= 0)) return;
    state.cat = cat;
    if (!state.started) state.started = Date.now();
    dlg.classList.add('has-choice');
    Object.entries(cards).forEach(([k, c]) => {
      c.classList.toggle('is-chosen', k === cat);
      $('[data-chosen]', c).hidden = k !== cat;
    });
    form.hidden = false;
    audio.play('expand');
    if (!reduced()) {
      gsap.fromTo(cards[cat], { scale: 0.96 }, { scale: 1, duration: 0.48, ease: 'big', clearProps: 'transform' });
      gsap.fromTo(form, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.64, delay: 0.08, clearProps: 'all' });
    }
    if (state.touched.has('dob')) check('dob');
    goStep(step, { focus: true });
    saveDraft();
  }
  Object.entries(cards).forEach(([cat, card]) => {
    $('[data-choose]', card).addEventListener('click', () => choose(cat));
    $('[data-change]', card).addEventListener('click', () => {
      const prev = state.cat;
      releaseHold();
      clearDraft();
      state.cat = null;
      dlg.classList.remove('has-choice');
      Object.values(cards).forEach((c) => { c.classList.remove('is-chosen'); $('[data-chosen]', c).hidden = true; });
      form.hidden = true;
      sendError.hidden = true;
      $('[data-choose]', cards[prev]).focus();
    });
  });

  // ---------- Steps ----------
  function goStep(n, { focus = true } = {}) {
    state.step = n;
    steps.forEach((s, i) => { s.hidden = i !== n; });
    dots.forEach((d, i) => {
      d.classList.toggle('is-current', i === n);
      d.classList.toggle('is-done', i < n);
      if (i === n) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    $('#step-status').textContent = fill(R.stepOf, { n: n + 1, total: steps.length, name: R.steps[n] });
    btnBack.hidden = n === 0;
    btnNext.hidden = n === steps.length - 1;
    btnSubmit.hidden = n !== steps.length - 1;
    summary.hidden = true;
    sendError.hidden = true;
    $('#step-blocked').hidden = true;
    updateGate();
    if (!reduced()) gsap.fromTo(steps[n], { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.48, clearProps: 'all' });
    const scroller = $('.reg__scroll', dlg);
    const top = form.offsetTop - 16;
    if (scroller.scrollTop > top) panelTo(top);
    if (n === 2) requestAnimationFrame(() => signature.resize());
    if (n === 3) checkBeforePay();
    saveDraft();
    if (focus) {
      const first = { 0: f.name, 1: f.parent, 2: consentInputs[0], 3: $('#pay-checking') }[n];
      if (n === 3) $('#pay-checking').setAttribute('tabindex', '-1');
      setTimeout(() => first?.focus({ preventScroll: n === 3 }), reduced() ? 0 : 80);
    }
  }

  btnNext.addEventListener('click', () => {
    if (!validateStep(state.step)) { audio.play('low'); return; }
    goStep(state.step + 1);
  });
  btnBack.addEventListener('click', () => goStep(state.step - 1));

  // Before anyone is asked to pay, the server holds a seat for 5 minutes. The
  // same submission ID is used for the hold and the registration, so a retry,
  // a reload (draft) or "Hold my seat again" never takes a second seat.
  function ensureId() {
    if (!state.submissionId) state.submissionId = newId();
    const code = regCode(state.submissionId);
    $('#pay-code').textContent = code;
  }

  function showPanel() {
    const first = $('#pay-panel').hidden;
    state.payOk = true;
    state.panelShown = true;
    $('#pay-panel').hidden = false;
    if (first) {
      if (!reduced()) gsap.fromTo('#pay-panel', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.48, clearProps: 'all' });
      $('#pay-panel .pay__title').setAttribute('tabindex', '-1');
      $('#pay-panel .pay__title').focus({ preventScroll: true });
    }
    saveDraft();
    updateSubmit();
  }

  function showFull(reason) {
    $('#pay-full').hidden = false;
    $('#pay-held').hidden = reason !== 'held';
    $('#pay-full').setAttribute('tabindex', '-1');
    $('#pay-full').focus();
    audio.play('low');
  }

  async function checkBeforePay({ again = false } = {}) {
    if (!state.cat) return;
    ensureId();
    const paid = state.panelShown; // the payment details were shown: keep them, the family may have paid
    if (!paid) { state.payOk = false; $('#pay-panel').hidden = true; }
    $('#pay-checking').hidden = paid;
    $('#pay-full').hidden = true;
    $('#pay-dup').hidden = true;
    updateSubmit();
    const p = payload({ forHold: true });
    let res;
    try {
      res = await sendHold({ action: 'hold', submissionId: state.submissionId, category: state.cat, name: p.name, dob: p.dob });
    } catch {
      $('#pay-checking').hidden = true;
      if (paid) { holdEnded('offline'); return; }
      showSendError(fill(R.seatsError, { phone }), () => checkBeforePay({ again }));
      return;
    }
    if (state.step !== 3) return; // moved on meanwhile
    $('#pay-checking').hidden = true;
    if (res?.seats) { state.seats = res.seats; renderSeats(); }
    if (res?.ok && ['registered', 'last_seat', 'duplicate_paid'].includes(res.status)) { outcome(res); return; } // already sent earlier
    if (res?.error === 'duplicate') {
      stopHold(true);
      $('#pay-dup').hidden = false;
      $('#pay-dup').setAttribute('tabindex', '-1');
      $('#pay-dup').focus();
      audio.play('low');
      return;
    }
    if (res?.ok && res.status === 'held') {
      startHold(res);
      showPanel();
      announce(again ? R.hold.againDone : R.hold.start);
      return;
    }
    if (res?.ok && res.status === 'full') {
      stopHold(true);
      if (paid) holdEnded('full'); else showFull(res.reason);
      return;
    }
    if (res?.ok && res.status === 'limit') { stopHold(true); showPanel(); holdEnded('limit'); return; }
    if (res?.error === 'busy') { showSendError(E.busy, () => checkBeforePay({ again })); return; }
    // A backend without seat holds (before round 7): check the seats as before.
    await legacyCheck();
  }

  async function legacyCheck() {
    $('#pay-checking').hidden = false;
    try {
      state.seats = await fetchSeats();
      renderSeats();
    } catch {
      $('#pay-checking').hidden = true;
      showSendError(fill(R.seatsError, { phone }), checkBeforePay);
      return;
    }
    $('#pay-checking').hidden = true;
    if (state.seats[state.cat].left <= 0 && !state.panelShown) { showFull('taken'); return; }
    showPanel();
  }

  // ---------- Hold countdown ----------
  const announce = (msg) => { $('#hold-live').textContent = ''; requestAnimationFrame(() => { $('#hold-live').textContent = msg; }); };
  function startHold(res) {
    // The server's clock decides; the phone's clock may be wrong.
    state.hold.exp = Date.now() + (res.expiresAt - res.now);
    state.hold.warned = state.hold.exp - Date.now() <= 60000;
    $('#hold').hidden = false;
    $('#hold').classList.remove('is-ended');
    $('#hold-ended').hidden = true;
    $('.hold__bar', dlg).hidden = false;
    $('#hold-text').hidden = false;
    clearInterval(state.hold.timer);
    state.hold.timer = setInterval(tick, 1000);
    tick();
  }
  function tick() {
    if (!state.hold.exp) return;
    const left = state.hold.exp - Date.now();
    if (left <= 0) { stopHold(); holdEnded('time'); return; }
    const sec = Math.ceil(left / 1000);
    $('#hold-text').textContent = fill(R.hold.left, { time: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` });
    $('#hold-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, left / HOLD_MS))})`;
    $('#hold').classList.toggle('is-low', left <= 60000);
    if (!state.hold.warned && left <= 60000) { state.hold.warned = true; announce(R.hold.oneMin); }
  }
  function stopHold(hide = false) {
    clearInterval(state.hold.timer);
    state.hold.timer = 0;
    state.hold.exp = 0;
    if (hide) $('#hold').hidden = true;
  }
  function holdEnded(kind) {
    const msg = { time: R.hold.ended, full: R.hold.endedFull, limit: R.hold.limit, offline: R.hold.offline }[kind];
    $('#hold').hidden = false;
    $('#hold').classList.add('is-ended');
    $('.hold__bar', dlg).hidden = true;
    $('#hold-text').hidden = true;
    $('#hold-ended-text').textContent = msg;
    $('#hold-again .btn__label').textContent = kind === 'full' ? R.checkAgain : kind === 'offline' ? R.retry : R.hold.again;
    $('#hold-again').hidden = kind === 'limit';
    $('#hold-ended').hidden = false;
    announce(msg);
    audio.play('low');
    updateSubmit();
  }
  $('#hold-again').addEventListener('click', () => checkBeforePay({ again: true }));
  $('#pay-recheck').addEventListener('click', () => checkBeforePay());
  function releaseHold({ keepalive = false } = {}) {
    // Never give back the seat of a family who may have paid (screenshot attached).
    if (!state.submissionId || state.shot || state.sent || state.busy) return;
    if (!state.hold.exp) return;
    stopHold(true);
    sendRelease(state.submissionId, { keepalive });
  }
  // Only when the page really closes. Switching to a UPI app can fire pagehide on
  // iPhones (the page may be kept, persisted, or reloaded later): after the family
  // copied the UPI ID or phone number they are paying, so the hold stays (it ends
  // by itself after 5 minutes).
  window.addEventListener('pagehide', (e) => {
    if (e.persisted || Date.now() - (state.appOpenedAt || 0) < 15 * 60000) return;
    releaseHold({ keepalive: true });
  });

  // ---------- Payment ----------
  // Families pay in their own UPI app: they scan the QR code, or copy the UPI ID
  // or phone number (round 11: the UPI app buttons were removed, apps blocked them).
  for (const btn of document.querySelectorAll('#pay-panel [data-copy]')) {
    btn.addEventListener('click', async () => {
      const src = $(btn.dataset.copy);
      const text = src.textContent.trim();
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const range = document.createRange();
        range.selectNodeContents(src);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { ok = document.execCommand('copy'); } catch { ok = false; }
      }
      if (!ok) return;
      // They are about to switch to their UPI app: keep the seat hold through that.
      state.appOpenedAt = Date.now();
      const label = $('[data-copy-label]', btn);
      label.textContent = R.pay.copied;
      btn.classList.add('is-done');
      $('#copy-status').textContent = R.pay.copied;
      audio.play('copy');
      setTimeout(() => { label.textContent = R.pay.copy; btn.classList.remove('is-done'); $('#copy-status').textContent = ''; }, 2000);
    });
  }

  async function setShot(file) {
    if (!file) return;
    clearError('shot');
    try {
      const img = await prepareScreenshot(file);
      if (state.shotUrl) URL.revokeObjectURL(state.shotUrl);
      state.shot = img;
      state.shotUrl = URL.createObjectURL(img.blob);
      $('#shot-img').src = state.shotUrl;
      $('#shot-preview').hidden = false;
      $('[data-shot-label]').textContent = R.pay.shotReplace;
      audio.play('copy');
      if (!reduced()) gsap.fromTo('#shot-img', { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.48, clearProps: 'all' });
    } catch (err) {
      setError('shot', E[err.code] || E.shotRead);
      f.shot.value = '';
    }
    updateSubmit();
  }
  function removeShot() {
    if (state.shotUrl) URL.revokeObjectURL(state.shotUrl);
    state.shot = null;
    state.shotUrl = null;
    $('#shot-img').removeAttribute('src');
    $('#shot-preview').hidden = true;
    $('[data-shot-label]').textContent = R.pay.shotChoose;
    f.shot.value = '';
    updateSubmit();
  }
  f.shot.addEventListener('change', () => setShot(f.shot.files?.[0]));
  $('#shot-remove').addEventListener('click', () => { removeShot(); f.shot.focus(); });

  function updateSubmit() {
    const ready = Boolean(state.shot) && state.payOk && !state.busy;
    btnSubmit.disabled = !ready;
    $('#submit-hint').hidden = Boolean(state.shot);
  }

  // ---------- Submit ----------
  function showSendError(msg, retry) {
    sendError.replaceChildren();
    const span = document.createElement('span');
    span.textContent = msg;
    sendError.append(span);
    if (retry) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = ` ${R.retry}`;
      b.addEventListener('click', () => { sendError.hidden = true; retry(); });
      sendError.append(' ', b);
    }
    sendError.hidden = false;
    sendError.setAttribute('tabindex', '-1');
    sendError.focus();
  }

  function lock(on) {
    state.busy = on;
    form.classList.toggle('is-locked', on);
    form.setAttribute('aria-busy', String(on));
    steps.forEach((s) => { s.disabled = on; });
    btnBack.disabled = on;
    btnSubmit.classList.toggle('is-loading', on);
    submitLabel.textContent = on ? R.pay.submitting : R.pay.submit;
    updateSubmit();
  }

  function payload({ forHold = false } = {}) {
    const iso = isoDate(f.dobY.value, f.dobM.value, f.dobD.value);
    if (forHold) return { name: text(f.name), dob: iso };
    return {
      action: 'register',
      submissionId: state.submissionId,
      category: state.cat,
      name: text(f.name),
      dob: iso,
      parent: text(f.parent),
      address: text(f.address),
      phones: phones().map(normPhone),
      medical: text(f.medical),
      dietary: text(f.dietary),
      consent: consentInputs.find((i) => i.checked)?.value || '',
      agree: f.agree.checked,
      refundAck: f.refund.checked,
      signature: typedMode ? '' : signature.toDataURL(),
      // How many points were drawn: the server refuses an empty pad, as the form does.
      signaturePoints: typedMode ? 0 : signature.points(),
      signatureTyped: typedMode ? typedInput.value.trim() : '',
      signDate: f.signDate.value,
      screenshot: state.shot ? { type: state.shot.type, data: state.shot.dataUrl } : null,
      paymentRef: text(f.ref).replace(/[\s-]/g, ''),
      lang: T.lang,
      website: f.website.value,
      elapsedMs: Date.now() - (state.started || Date.now()),
    };
  }

  let busyTries = 0;
  let busyTimer = 0;
  async function submit({ auto = false } = {}) {
    if (state.busy || state.sent) return;
    if (!auto && !validateStep(3)) { audio.play('low'); return; }
    if (!state.shot) return;
    ensureId();
    clearTimeout(busyTimer);
    sendError.hidden = true;
    lock(true);
    let res;
    try {
      res = await sendRegistration(payload());
    } catch (err) {
      console.warn(err);
      lock(false);
      // The family has paid: keep everything and send again when the connection returns.
      state.pending = true;
      showSendError(fill(E.sendAuto, { phone }), () => submit());
      return;
    }
    lock(false);
    state.pending = false;
    if (res?.ok && ['registered', 'last_seat', 'duplicate_paid'].includes(res.status)) { busyTries = 0; outcome(res); return; }
    if (res?.error === 'duplicate') { showSendError(fill(E.duplicate, { phone })); return; } // a backend before round 7
    if (res?.error === 'busy') {
      // Safe to repeat (same submission ID): try again by itself, a few times.
      const waits = [5, 10, 20];
      if (busyTries < waits.length) {
        const s = waits[busyTries++];
        showSendError(fill(E.busyAuto, { s }), () => submit());
        busyTimer = setTimeout(() => submit({ auto: true }), s * 1000);
      } else {
        busyTries = 0;
        showSendError(E.busy, () => submit());
      }
      return;
    }
    if (res?.error === 'validation' && Array.isArray(res.fields)) {
      const known = res.fields.filter((x) => x.field in STEP_OF);
      if (known.length) {
        const first = Math.min(...known.map((x) => STEP_OF[x.field]));
        goStep(first, { focus: false });
        known.forEach((x) => setError(x.field, E[x.code] || E.server));
        showSummary(known.filter((x) => STEP_OF[x.field] === first).map((x) => [x.field, E[x.code] || E.server]));
        return;
      }
    }
    showSendError(fill(E.server, { phone }), () => submit());
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (state.step === 3) submit(); else if (!btnNext.disabled) btnNext.click(); });

  // A send that failed on the network goes again by itself when the phone is back online.
  const resendSoon = () => { if (state.pending && !state.busy && !state.sent && navigator.onLine !== false) submit({ auto: true }); };
  window.addEventListener('online', resendSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { resendSoon(); tick(); } });
  // Warn before leaving with a payment screenshot that has not been sent.
  window.addEventListener('beforeunload', (e) => {
    if ((state.shot && !state.sent) || state.copySaving) { e.preventDefault(); e.returnValue = ''; }
  });

  function outcome(res) {
    state.sent = true;
    state.pending = false;
    stopHold(true);
    clearDraft();
    // Make the registration PDF from what was sent, before the form is cleared.
    if (state.shot) startPdf(record(res.submittedAt));
    if (res.status === 'registered') success();
    else if (res.status === 'duplicate_paid') duplicatePaid();
    else lastSeat();
  }

  // ---------- Outcomes ----------
  function resetForm() {
    form.reset();
    signature.clear();
    removeShot();
    phoneList.replaceChildren();
    addPhone();
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    $$('.is-valid', form).forEach((el) => el.classList.remove('is-valid'));
    $$('.field__error', form).forEach((p) => { p.hidden = true; p.textContent = ''; });
    f.signDate.value = todayIso();
    setSignMode(false, { focus: false });
    state.touched.clear();
    state.submissionId = null;
    state.started = 0;
    state.payOk = false;
    state.panelShown = false;
    stopHold(true);
    $('#pay-code').textContent = '';
    $('#draft-note').hidden = true;
    $('#pay-dup').hidden = true;
  }

  function showOutcome(view) {
    pick.hidden = true;
    form.hidden = true;
    view.hidden = false;
    panelTo(0, true);
    view.focus();
  }

  function success() {
    const cat = state.cat;
    const name = text(f.name);
    const category = `${R[cat]} (${R[`${cat}Age`]})`;
    $('#done-text').textContent = fill(R.done.text, { name });
    $('#done-name').textContent = name;
    $('#done-category').textContent = category;
    $('#done-dates').textContent = R[`${cat}Dates`];
    prepareShare();
    $('#done-status').textContent = '';
    resetForm();
    showOutcome(doneView);
    doneView.classList.add('is-shown');
    audio.play('chime');
    if (!reduced()) {
      gsap.fromTo('.done__ring', { scale: 0, opacity: 1 }, { scale: 2.4, opacity: 0, duration: 1.2, ease: 'big' });
      gsap.fromTo('.done__check', { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.64, ease: 'big' });
      burst($('.done__burst'));
      gsap.fromTo('#reg-done > :not(.done__burst)', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.64, delay: 0.24, clearProps: 'all' });
    }
  }

  function duplicatePaid() {
    resetForm();
    showOutcome(dupView);
    audio.play('low');
    if (!reduced()) gsap.fromTo('#reg-dup > *', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.64, clearProps: 'all' });
  }

  function lastSeat() {
    resetForm();
    showOutcome(lastView);
    audio.play('low');
    if (!reduced()) gsap.fromTo('#reg-last > *', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.64, clearProps: 'all' });
  }

  // ---------- Registration PDF: download, share, and a copy for the organisers ----------
  // Everything here is kept only in memory, until the view closes.
  const fmtDate = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  function record(submittedAt) {
    const p = payload();
    const P = R.pdf;
    const cat = state.cat;
    const none = (v) => v || P.none;
    const local = (key) => (R.f[`${key}Local`] ? `${R.f[`${key}Local`]}\n${R.f[key]}` : R.f[key]);
    const agreeText = R.f.agreeOriginal ? `${R.f.agree}\n${R.f.agreeOriginal}` : R.f.agree;
    const at = submittedAt || new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '');
    const code = String(p.submissionId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
    return {
      lang: T.lang,
      name: p.name,
      submissionId: p.submissionId,
      ref: `${P.reference} ${code}`,
      signature: p.signature || '',
      labels: { title: P.title, page: P.page, contact: P.contact, screenshot: P.screenshot, signature: P.signature, signatureTyped: P.signatureTyped },
      sections: [
        { title: P.child, rows: [[P.name, p.name], [P.dob, fmtDate(p.dob)], [P.age, String(ageOn(p.dob, T.cats[cat].start))], [P.group, `${R[cat]} (${R[`${cat}Age`]})`], [P.dates, R[`${cat}Dates`]]] },
        { title: P.family, rows: [[P.parent, p.parent], [P.address, p.address], [P.phones, p.phones.join(', ')], [P.medical, none(p.medical)], [P.dietary, none(p.dietary)]] },
        {
          title: P.consent,
          rows: [[`${P.consentQ}: ${local('consentStatement')}`, p.consent === 'yes' ? R.f.yes : R.f.no], [P.agreed, agreeText], [P.signDate, fmtDate(p.signDate)]],
          signature: true,
          typed: p.signatureTyped,
        },
      ],
      payment: {
        title: P.payment,
        rows: [[P.amount, `${T.pay.amount} (${R.pay.nonRefundableShort})`], [P.payee, T.pay.payee], [P.upiId, T.pay.upiId], [P.ref, none(p.paymentRef)], [P.submitted, `${at} IST`]],
        screenshot: p.screenshot.data,
      },
    };
  }

  let pdf = null; // { name, promise: Promise<File> }
  function startPdf(rec) {
    const safe = rec.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'registration';
    const name = `Winter-Camp-2027-${safe}-registration.pdf`;
    const promise = import('./registration-pdf.js')
      .then(({ buildRegistrationPdf }) => buildRegistrationPdf(rec))
      .then((blob) => new File([blob], name, { type: 'application/pdf' }));
    pdf = { name, promise };
    // A copy for the organisers' private Drive. It is kept in this browser until the
    // server confirms it, so closing the page or switching app doesn't lose it.
    copyNote('saving');
    let kept = false;
    promise
      .then((file) => readDataUrl(file))
      .then(async (dataUrl) => {
        kept = Boolean(await keepPdf(rec.submissionId, dataUrl) !== null);
        return uploadPdf(rec.submissionId, dataUrl);
      })
      // A final refusal is not "sent later": the copy was dropped, so say nothing.
      .then((res) => copyNote(res?.ok ? 'saved' : res?.refused ? 'none' : kept ? 'later' : 'none'))
      .catch((err) => { console.warn('registration PDF', err); copyNote(kept ? 'later' : 'none'); });
  }
  const readDataUrl = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  // Answers that end the matter: saved, or refused for a reason a retry can't fix.
  const FINAL = ['pdf', 'not_found', 'too_late', 'bad_request'];
  const uploading = new Set();
  async function uploadPdf(submissionId, dataUrl, waits = [0, 2000, 6000, 15000]) {
    if (uploading.has(submissionId)) return null;
    uploading.add(submissionId);
    try {
      for (const waitMs of waits) {
        if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
        try {
          const res = await sendPdf({ action: 'pdf', submissionId, pdf: dataUrl });
          if (res?.ok || FINAL.includes(res?.error)) {
            await dropPdf(submissionId);
            if (!res.ok) console.warn('registration PDF refused:', res.error);
            return res.ok ? res : { refused: res.error };
          }
        } catch { /* network: try again */ }
      }
      return null; // still kept: sent again on the next visit
    } finally {
      uploading.delete(submissionId);
    }
  }
  // PDFs from earlier visits that never reached the server: one try each, now.
  async function sendWaitingPdfs() {
    if (navigator.onLine === false) return;
    for (const item of await waitingPdfs()) {
      if (typeof item.id === 'string' && typeof item.dataUrl === 'string') await uploadPdf(item.id, item.dataUrl, [0]);
    }
  }
  document.addEventListener('wc:ready', () => setTimeout(sendWaitingPdfs, 1500), { once: true });
  window.addEventListener('online', sendWaitingPdfs);
  function copyNote(kind) {
    const el = $('#done-copy');
    if (!el) return;
    state.copySaving = kind === 'saving';
    el.textContent = { saving: R.done.copySaving, saved: R.done.copySaved, later: R.done.copyLater }[kind] || '';
    el.hidden = !el.textContent;
    el.classList.toggle('is-saving', kind === 'saving');
  }
  async function pdfFile() {
    if (!pdf) return null;
    const btn = $('#done-save');
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('is-loading');
    $('#done-status').textContent = R.done.preparing;
    try {
      return await pdf.promise;
    } catch (err) {
      console.warn(err);
      $('#done-status').textContent = R.done.pdfError;
      $('#done-error').hidden = false;
      return null;
    } finally {
      btn.removeAttribute('aria-busy');
      btn.classList.remove('is-loading');
    }
  }
  function prepareShare() {
    $('#done-error').hidden = true;
    const probe = new File([new Blob(['%PDF-'], { type: 'application/pdf' })], 'probe.pdf', { type: 'application/pdf' });
    let ok = false;
    try { ok = Boolean(navigator.canShare && navigator.canShare({ files: [probe] })); } catch { ok = false; }
    $('#done-share').hidden = !ok;
  }
  $('#done-save').addEventListener('click', async () => {
    const file = await pdfFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    doneView.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('#done-status').textContent = R.done.downloaded;
    audio.play('copy');
  });
  $('#done-share').addEventListener('click', async () => {
    const file = await pdfFile();
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: R.done.shareText });
    } catch (err) {
      if (err?.name !== 'AbortError') $('#done-save').click();
    }
  });

  function resetView() {
    pdf = null;
    $('#done-copy').hidden = true;
    doneView.hidden = true;
    doneView.classList.remove('is-shown');
    lastView.hidden = true;
    dupView.hidden = true;
    state.sent = false;
    ['#done-text', '#done-name', '#done-category', '#done-dates'].forEach((s) => { $(s).textContent = ''; });
    pick.hidden = false;
    state.cat = null;
    dlg.classList.remove('has-choice');
    Object.values(cards).forEach((c) => { c.classList.remove('is-chosen'); $('[data-chosen]', c).hidden = true; });
    form.hidden = true;
  }

  // ---------- Open and close ----------
  function open(trigger) {
    if (dlg.open) return;
    if (!panel) panel = smoothPanel(scrollerEl, $('.reg__inner', dlg));
    panel?.start();
    panelTo(0, true);
    const finished = !doneView.hidden || !lastView.hidden || !dupView.hidden;
    if (finished) resetView();
    if (!f.signDate.value) f.signDate.value = todayIso();
    f.signDate.max = todayIso();
    openModal(dlg, {
      trigger,
      onClose: () => {
        audio.duck(false);
        if (!doneView.hidden || !lastView.hidden || !dupView.hidden) resetView();
        else releaseHold();
        loadSeatsQuietly();
      },
    });
    audio.duck(true);
    audio.play('whoosh');
    $('#reg-title').setAttribute('tabindex', '-1');
    $('#reg-title').focus();
    if (!reduced()) gsap.fromTo(dlg, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'big', clearProps: 'clipPath' });
    if (!state.cat) {
      const draft = readDraft();
      if (draft) { loadSeats(); restoreDraft(draft); } else loadSeats();
    } else if (state.step === 3 && !state.sent) checkBeforePay(); // hold again after closing
  }
  let closing = false;
  function close() {
    if (state.busy || closing) return;
    if (reduced()) { dlg.close(); return; }
    closing = true;
    const finish = () => { closing = false; gsap.set(dlg, { clearProps: 'clipPath' }); if (dlg.open) dlg.close(); };
    gsap.to(dlg, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.64, ease: 'big', onComplete: finish });
    setTimeout(() => { if (closing) finish(); }, 1200); // in case animation frames are paused
  }
  // Only Escape / the back gesture on the dialog itself closes it. Chrome also fires
  // a bubbling "cancel" from <input type=file> when the picker is dismissed, which
  // must not start closing the registration view.
  dlg.addEventListener('cancel', (e) => {
    if (e.target !== dlg) return;
    e.preventDefault();
    close();
  });
  // Phones pause animations while the photo picker is open; never leave the view half-drawn.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && dlg.open && !closing) gsap.set(dlg, { clearProps: 'clipPath' });
  });
  $$('[data-close-register]', dlg).forEach((b) => b.addEventListener('click', close));
  $$('[data-open-register]').forEach((b) => b.addEventListener('click', () => {
    // Opened from the phone menu: wait for the menu to close first.
    const fromMenu = b.closest('#menu');
    if (fromMenu) setTimeout(() => open($('#menu-open')), 0);
    else open(b);
  }));
  document.addEventListener('wc:ready', () => {
    // Back from the UPI app with the tab reloaded: open the form where it was.
    const draft = readDraft();
    if (location.hash === '#register' || (draft && draft.step === 3)) open(null);
  });
  f.signDate.value = todayIso();

  // Seats for the line under the hero's Register button (see seats-line.js).
  async function loadSeatsQuietly() {
    try { state.seats = await fetchSeats(); renderSeats(); } catch { /* the line keeps its last value */ }
  }

  // ---------- Draft (sessionStorage) ----------
  let draftTimer = 0;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 250);
  }
  function writeDraft() {
    if (!state.cat || state.sent) return;
    const d = {
      v: 1, at: Date.now(), cat: state.cat, step: state.step, id: state.submissionId, started: state.started, panelShown: state.panelShown,
      fields: Object.fromEntries(['name', 'dobD', 'dobM', 'dobY', 'parent', 'address', 'medical', 'dietary', 'signDate', 'ref'].map((k) => [k, f[k].value])),
      phones: $$('.phone input', phoneList).map((i) => i.value),
      consent: consentInputs.find((i) => i.checked)?.value || '',
      agree: f.agree.checked, refund: f.refund.checked,
      typedMode, typed: typedInput.value, strokes: signature.strokes(),
    };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage full or blocked: memory only */ }
  }
  function readDraft() {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (!d || d.v !== 1 || !['kids', 'youth'].includes(d.cat) || Date.now() - d.at > DRAFT_HOURS * 3600000) return null;
      return d;
    } catch { return null; }
  }
  function clearDraft() {
    clearTimeout(draftTimer);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing kept */ }
  }
  function restoreDraft(d) {
    Object.entries(d.fields || {}).forEach(([k, v]) => { if (f[k] && typeof v === 'string') f[k].value = v; });
    phoneList.replaceChildren();
    const list = (d.phones || []).filter((x) => typeof x === 'string').slice(0, MAX_PHONES);
    (list.length ? list : ['']).forEach((v) => addPhone(v));
    consentInputs.forEach((i) => { i.checked = i.value === d.consent; });
    f.agree.checked = d.agree === true;
    f.refund.checked = d.refund === true;
    setSignMode(d.typedMode === true, { focus: false });
    typedInput.value = typeof d.typed === 'string' ? d.typed : '';
    signature.setStrokes(d.strokes);
    if (typeof d.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(d.id)) state.submissionId = d.id;
    state.started = Number(d.started) || Date.now();
    state.panelShown = d.panelShown === true;
    const step = Math.max(0, Math.min(3, Number(d.step) || 0));
    choose(d.cat, { force: true, step });
    const note = $('#draft-note');
    note.textContent = step === 3 && state.panelShown ? `${R.draftRestored} ${R.draftShot}` : R.draftRestored;
    note.hidden = false;
  }
  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);
  $('#f-sign').addEventListener('pointerup', saveDraft);
}
