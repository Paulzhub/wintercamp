// Registration view: choose Kids or Youth (with live seats), four short steps,
// hand-drawn signature, UPI payment with a required screenshot, one submission.
// Nothing typed here is written to browser storage.
import { gsap, reduced } from './motion.js';
import { T, $, $$, fill } from './i18n.js';
import { openModal } from './modal.js';
import { fetchSeats, sendRegistration } from './api.js';
import { initSignature } from './signature.js';
import { prepareScreenshot } from './image.js';
import { MAX, isoDate, dobProblem, todayIso, validPhone, normPhone } from './validate.js';

const STEP_OF = {
  name: 0, dob: 0,
  parent: 1, address: 1, phones: 1, medical: 1, dietary: 1,
  consent: 2, agree: 2, signature: 2, signDate: 2,
  shot: 3, ref: 3,
};
const MAX_PHONES = 4;

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
  };

  // ---------- Fields ----------
  const f = {
    name: $('#f-name'), dobD: $('#f-dob-d'), dobM: $('#f-dob-m'), dobY: $('#f-dob-y'),
    parent: $('#f-parent'), address: $('#f-address'), medical: $('#f-medical'), dietary: $('#f-dietary'),
    agree: $('#f-agree'), signDate: $('#f-signdate'), shot: $('#f-shot'), ref: $('#f-ref'), website: $('#f-website'),
  };
  const consentInputs = $$('input[name="consent"]', form);
  const phoneList = $('#phones-list');
  const signature = initSignature($('#f-sign'), $('#sign-wrap'), {
    onChange: (ink) => { if (ink) clearError('signature'); },
  });
  $('#f-sign-clear').addEventListener('click', () => signature.clear());

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
    Object.assign(input, { type: 'tel', id, name: 'phone', className: 'input', inputMode: 'tel', maxLength: 20, value });
    input.autocomplete = n === 1 ? 'tel' : 'off';
    input.setAttribute('aria-describedby', 'err-phones');
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

  // ---------- Errors ----------
  const targets = {
    name: () => f.name, dob: () => f.dobD, parent: () => f.parent, address: () => f.address,
    phones: () => $('.phone input', phoneList), medical: () => f.medical, dietary: () => f.dietary,
    consent: () => consentInputs[0], agree: () => f.agree, signature: () => $('#f-sign'),
    signDate: () => f.signDate, shot: () => f.shot, ref: () => f.ref,
  };
  const inputsFor = (key) => ({
    dob: [f.dobD, f.dobM, f.dobY],
    phones: $$('.phone input', phoneList),
    consent: consentInputs,
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
    consent: () => (consentInputs.some((i) => i.checked) ? '' : E.consent),
    agree: () => (f.agree.checked ? '' : E.agree),
    signature: () => (signature.hasInk() ? '' : E.signature),
    signDate: () => {
      const v = f.signDate.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return E.signDate;
      return v > todayIso() ? E.signDateFuture : '';
    },
    shot: () => (state.shot ? '' : E.shot),
    ref: () => (text(f.ref).length > MAX.ref ? E.tooLong : ''),
  };
  const STEP_FIELDS = [['name', 'dob'], ['parent', 'address', 'phones', 'medical', 'dietary'], ['consent', 'agree', 'signature', 'signDate'], ['shot', 'ref']];

  function check(key) {
    const msg = rules[key]();
    if (msg) setError(key, msg); else clearError(key);
    return msg;
  }

  function validateStep(n) {
    const errors = [];
    STEP_FIELDS[n].forEach((key) => {
      state.touched.add(key);
      const msg = check(key);
      if (msg) errors.push([key, msg]);
    });
    showSummary(errors);
    return errors.length === 0;
  }

  function showSummary(errors) {
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
        target?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      });
      li.append(a);
      ul.append(li);
    });
    summary.append(p, ul);
    summary.hidden = false;
    summary.focus();
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
  consentInputs.forEach((i) => i.addEventListener('change', () => { check('consent'); audio.play('tick'); }));
  f.agree.addEventListener('change', () => { if (state.touched.has('agree') || f.agree.checked) check('agree'); });

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
      seatsEl.textContent = fill(R.seatsLeft, { n: Math.max(0, info.left), total: info.total });
      seatsEl.classList.toggle('is-low', info.left <= 5);
      choose.disabled = full;
    });
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

  function choose(cat) {
    if (!state.seats || state.seats[cat].left <= 0) return;
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
    goStep(0, { focus: true });
  }
  Object.entries(cards).forEach(([cat, card]) => {
    $('[data-choose]', card).addEventListener('click', () => choose(cat));
    $('[data-change]', card).addEventListener('click', () => {
      const prev = state.cat;
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
    if (!reduced()) gsap.fromTo(steps[n], { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.48, clearProps: 'all' });
    const scroller = $('.reg__scroll', dlg);
    const top = form.offsetTop - 16;
    if (scroller.scrollTop > top) scroller.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
    if (n === 2) requestAnimationFrame(() => signature.resize());
    if (n === 3) checkBeforePay();
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

  // Seats are checked again before anyone is asked to pay.
  async function checkBeforePay() {
    state.payOk = false;
    $('#pay-checking').hidden = false;
    $('#pay-panel').hidden = true;
    $('#pay-full').hidden = true;
    updateSubmit();
    try {
      state.seats = await fetchSeats();
      renderSeats();
    } catch {
      $('#pay-checking').hidden = true;
      showSendError(fill(R.seatsError, { phone }), checkBeforePay);
      return;
    }
    $('#pay-checking').hidden = true;
    if (state.seats[state.cat].left <= 0) {
      $('#pay-full').hidden = false;
      $('#pay-full').setAttribute('tabindex', '-1');
      $('#pay-full').focus();
      audio.play('low');
      return;
    }
    state.payOk = true;
    $('#pay-panel').hidden = false;
    if (!reduced()) gsap.fromTo('#pay-panel', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.48, clearProps: 'all' });
    $('#pay-panel .pay__title').setAttribute('tabindex', '-1');
    $('#pay-panel .pay__title').focus({ preventScroll: true });
    updateSubmit();
  }

  // ---------- Payment ----------
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window);
  $('#upi-open').hidden = !mobile;

  const copyBtn = $('#upi-copy');
  copyBtn.addEventListener('click', async () => {
    const id = $('#upi-id').textContent.trim();
    let ok = false;
    try { await navigator.clipboard.writeText(id); ok = true; } catch {
      const range = document.createRange();
      range.selectNodeContents($('#upi-id'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    if (!ok) return;
    const label = $('[data-copy-label]', copyBtn);
    label.textContent = R.pay.copied;
    copyBtn.classList.add('is-done');
    $('#copy-status').textContent = R.pay.copied;
    audio.play('copy');
    setTimeout(() => { label.textContent = R.pay.copy; copyBtn.classList.remove('is-done'); $('#copy-status').textContent = ''; }, 2000);
  });

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

  function payload() {
    const iso = isoDate(f.dobY.value, f.dobM.value, f.dobD.value);
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
      signature: signature.toDataURL(),
      signDate: f.signDate.value,
      screenshot: { type: state.shot.type, data: state.shot.dataUrl },
      paymentRef: text(f.ref),
      lang: T.lang,
      website: f.website.value,
      elapsedMs: Date.now() - (state.started || Date.now()),
    };
  }

  async function submit() {
    if (state.busy) return;
    if (!validateStep(3)) { audio.play('low'); return; }
    if (!state.submissionId) state.submissionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    sendError.hidden = true;
    lock(true);
    let res;
    try {
      res = await sendRegistration(payload());
    } catch (err) {
      console.warn(err);
      lock(false);
      showSendError(fill(E.send, { phone }), submit);
      return;
    }
    lock(false);
    if (res?.ok && res.status === 'registered') { success(); return; }
    if (res?.ok && res.status === 'last_seat') { lastSeat(); return; }
    if (res?.error === 'duplicate') { showSendError(fill(E.duplicate, { phone })); return; }
    if (res?.error === 'busy') { showSendError(E.busy, submit); return; }
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
    showSendError(fill(E.server, { phone }), submit);
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (state.step === 3) submit(); else btnNext.click(); });

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
    state.touched.clear();
    state.submissionId = null;
    state.started = 0;
    state.payOk = false;
  }

  function showOutcome(view) {
    pick.hidden = true;
    form.hidden = true;
    view.hidden = false;
    $('.reg__scroll', dlg).scrollTo({ top: 0 });
    view.focus();
  }

  function success() {
    const cat = state.cat;
    $('#done-text').textContent = fill(R.done.text, { name: text(f.name) });
    $('#done-name').textContent = text(f.name);
    $('#done-category').textContent = `${R[cat]} (${R[`${cat}Age`]})`;
    $('#done-dates').textContent = R[`${cat}Dates`];
    resetForm();
    showOutcome(doneView);
    doneView.classList.add('is-shown');
    audio.play('chime');
    if (!reduced()) {
      gsap.fromTo('.done__ring', { scale: 0, opacity: 1 }, { scale: 2.4, opacity: 0, duration: 1.2, ease: 'big' });
      gsap.fromTo('.done__check', { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.64, ease: 'big' });
      gsap.fromTo('#reg-done > :not(.done__burst)', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.64, stagger: 0.08, delay: 0.24, clearProps: 'all' });
    }
  }

  function lastSeat() {
    resetForm();
    showOutcome(lastView);
    audio.play('low');
    if (!reduced()) gsap.fromTo('#reg-last > *', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.64, stagger: 0.08, clearProps: 'all' });
  }

  function resetView() {
    doneView.hidden = true;
    doneView.classList.remove('is-shown');
    lastView.hidden = true;
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
    const finished = !doneView.hidden || !lastView.hidden;
    if (finished) resetView();
    if (!f.signDate.value) f.signDate.value = todayIso();
    f.signDate.max = todayIso();
    openModal(dlg, { trigger, onClose: () => { audio.duck(false); if (!doneView.hidden || !lastView.hidden) resetView(); } });
    audio.duck(true);
    audio.play('whoosh');
    $('#reg-title').setAttribute('tabindex', '-1');
    $('#reg-title').focus();
    if (!reduced()) gsap.fromTo(dlg, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'big', clearProps: 'clipPath' });
    if (!state.cat) loadSeats();
  }
  function close() {
    if (state.busy) return;
    if (reduced()) { dlg.close(); return; }
    gsap.to(dlg, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.64, ease: 'big', onComplete: () => { dlg.close(); gsap.set(dlg, { clearProps: 'clipPath' }); } });
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  $$('[data-close-register]', dlg).forEach((b) => b.addEventListener('click', close));
  $$('[data-open-register]').forEach((b) => b.addEventListener('click', () => {
    // Opened from the phone menu: wait for the menu to close first.
    const fromMenu = b.closest('#menu');
    if (fromMenu) setTimeout(() => open($('#menu-open')), 0);
    else open(b);
  }));
  document.addEventListener('wc:ready', () => { if (location.hash === '#register') open(null); });
  f.signDate.value = todayIso();
}
