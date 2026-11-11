# Winter Camp 2027 Website Plan

Status: v3, ready to build. The build prompt is in `BUILD_PROMPT.md`.

## 1. Decisions made on Paul's behalf (change any of these)

| # | Decision | Why |
|---|----------|-----|
| 1 | Registration opens as a full-screen view from "REGISTER NOW" and the menu, rather than sitting between sections | The page order given is hero, activities, gallery, footer; the form is long and needs room |
| 2 | Age is checked against the first day of that category's camp (Youth: 4 Jan 2027, Kids: 11 Jan 2027) | The form needs one rule to match date of birth to Kids or Youth |
| 3 | A seat is taken when the form is submitted, not when payment is confirmed | The site cannot verify a UPI payment |
| 4 | An optional "UPI transaction reference" field is added after payment details | Lets organisers match payments to registrations |
| 5 | A typed-name alternative sits beside the signature canvas | A drawn signature cannot be made with a keyboard or screen reader |
| 6 | A short "Camp facts and FAQ" block sits above the footer | Needed for answer engines and for parents; see section 9 |
| 7 | Tibetan has its own address (`/bo/`) as well as the toggle | Search and AI engines can only index Tibetan if it has a URL |

## 2. Camp facts

| | |
|---|---|
| Name | Winter Camp 2027 |
| Theme | Illuminate: Light of the World |
| Organiser | Kid's Happy Club |
| Youth (10 to 18) | 4 to 6 January 2027, 30 seats |
| Kids (under 10) | 11 to 13 January 2027, 30 seats |
| Venue | Snow View Residency, Jogiwara Road, McLeodganj, Dharamshala, Himachal Pradesh, India, 176219 |
| Fee | ₹500, paid by UPI |
| UPI | QR code (`assets/payment/upi-qr.jpg`), UPI ID `achuisr1985.27-1@okhdfcbank`, or phone number 8219012669. Payee name on the QR: Achui Sareo |
| Contact | +91-8219012669 |
| Seats | First come, first served. When full: "Seats are full. Kindly contact +91-8219012669." |
| Staff ratio | 1 staff member to 7 children |
| Languages | English (default), Tibetan (toggle), reviewed by native speakers |
| Photo consent | Approved |
| Hosting | GitHub Pages, repo `Paulzhub/wintercamp` |

**Goal:** get children registered. **Audience:** parents (Kids) and youth, mostly Tibetan families, mostly on phones.

## 3. Design system

### Colour

| Role | Hex | Share | Use |
|------|-----|-------|-----|
| Dominant | `#1C1C1C` | 60% | Loader, hero, gallery, footer |
| Secondary | `#E9ECEF` | 30% | Activities, registration view, FAQ, cards |
| Accent | `#E3171A` | 10% | Register buttons, active states, highlights, cursor |
| Text on dark | `#F5F5F5` | | |
| Text on light | `#111111` | | |

Red is used only for large text, icons and button fills (about 3.6:1 on dark, 4:1 on light). Button labels are `#F5F5F5` on red (about 4.8:1).

### Type

- **English headings:** Anton (uppercase display).
- **English body and UI:** Poppins 400, 500, 600.
- **Tibetan (headings and body):** Jomolhari. It has one weight, so Tibetan emphasis comes from size and colour; never apply synthetic bold or italic.
- Tibetan rules: line height about 1.8, no uppercase transform, no letter-spacing, animate by line or word (split at the tsheg), never by letter. `lang="bo"` on Tibetan text.
- Fonts are self-hosted WOFF2 (no third-party requests), `font-display: swap`, Jomolhari loaded only for Tibetan.

### Spacing, radii, shadows, motion

- **Spacing:** multiples of 8 only: 8, 16, 24, 32, 48, 64, 96, 128.
- **Concentric radii:** inner radius = outer radius minus padding.
- **Shadows:** three depth levels; on dark 40/50/60% black, on light 8/12/16%.
- **Easing:** everything eases in and out. Standard `cubic-bezier(0.65, 0, 0.35, 1)`; large reveals `cubic-bezier(0.76, 0, 0.24, 1)`.
- **Durations:** micro 160 to 240ms, UI 320 to 480ms, reveals 640 to 960ms, view transitions 800ms. Stagger 64 to 96ms.
- **Reduced motion:** movement becomes short fades, the 3D scene holds a still frame, cursor trail and parallax are off.

## 4. Theme treatment: Illuminate

The site starts dark and light arrives. Light is white with red as the accent. The pointer (or device tilt on phones) acts as a light source. Imagery is neutral: dawn light over a Himalayan ridge, rays, glowing snow.

## 5. Page structure

Order: loader, hero, activities, gallery, camp facts and FAQ, footer. Registration is a full-screen view.

### 5.1 Menu bar
- Links: Home, Activities, Gallery, FAQ, Contact, plus a red "Register" button, language toggle (EN / བོད) and sound toggle.
- Sits over the hero at first. On scroll it sticks to the top and becomes translucent (frosted glass blur, hairline border, soft shadow).
- Clear active state for the section in view. Hover text interaction on links.
- Phones: hamburger opens a full-screen menu with staggered links; focus is trapped while open.

### 5.2 Loading screen
- The letters of **ILLUMINATE** sit unlit and light up one by one as assets load. **Light of the World** fades and lifts in at the end.
- "Enter with sound" and "Enter silently" buttons.
- Exit: light expands from the word as a clip reveal into the hero. Capped at about 2.5 seconds.

### 5.3 Hero
- Label "Winter Camp 2027", headline **ILLUMINATE**, sub-line **Light of the World**.
- Dates for both groups, venue, "Limited seats, first come first served".
- **REGISTER NOW** magnetic button opens the registration view. Secondary: "See what we do".
- 3D scene (three.js): layered mountain ridge, light rising behind it with rays, glowing snow particles; headline letters brighten where the pointer passes.
- Headline reveal, staggered; sticky transform shrinks the headline into the menu bar wordmark on scroll.

### 5.4 Activities (light, playful)
Heading: "Three days of fun". Six cards with animated icons, staggered in on scroll, with lift and tilt on hover.

| Card | Text |
|------|------|
| Games | Games that get everyone moving, laughing and making new friends. |
| Craft | Make something with your own hands and take it home. |
| Storytelling | Stories that light up the imagination. |
| Music time | Sing, clap and make a joyful noise together. |
| Snacks and lunch | Tasty snacks and a hot lunch, provided every day. |
| Day 3 picnic | A day out with a treasure hunt, team challenges that build team spirit, and exciting prizes to win. |

The picnic card is larger, with a sticky "Day 3" badge. Below the cards: a strip with dates, venue, fee and a second register button.

### 5.5 Gallery (dark)
- One mixed set of photos and videos, not grouped by year.
- **Liquid glass carousel:** centre item sharp and large, side items scaled and tilted in 3D; glass panels carry captions and controls.
- **Slider:** a glass thumb that scrubs through the items; also drag, swipe, arrow keys, prev/next buttons.
- Videos show a poster frame with a play icon and play muted inline; full sound in the lightbox.
- Hover: image zoom, caption text interaction, cursor label "Drag", "View" or "Play". Lightbox with shared-element transition.
- Skeletons while loading, lazy loading.
- **Source:** files Paul drops into `gallery/photos/` and `gallery/videos/`. The build step reads the folders, creates optimised sizes and a manifest, so no code changes are needed. Optional `gallery/captions.json` for captions and alt text in both languages.
- Glass refraction (SVG displacement) in Chromium; frosted blur elsewhere.

### 5.6 Camp facts and FAQ (light)
Plain-text answers to the questions parents and answer engines ask: who is it for, when, where, how much, how to pay, what is provided, how to register, what if seats are full, who to contact. Accordion with expand-and-confirm motion; all answers are in the HTML whether open or closed.

### 5.7 Footer (dark)
- Oversized **Kid's Happy Club** wordmark with clip reveal; small line "Winter Camp 2027 · Illuminate: Light of the World".
- Venue, phone +91-8219012669 (tap to call), privacy notice link, language toggle, magnetic back-to-top.

## 6. Registration

### Flow
1. **Open:** "REGISTER NOW" or the menu button opens the registration view with a page transition.
2. **Pick a category:** Kids (under 10, 11 to 13 Jan) or Youth (10 to 18, 4 to 6 Jan). Each card shows seats left (skeleton while loading). The form does not appear until one is chosen.
3. **Seats full:** a full category shows "Seats are full. Kindly contact +91-8219012669." with a tap-to-call link, and cannot be selected.
4. **Expand and confirm:** the chosen card expands with a clear active state; "Change" goes back.
5. **Form** (below), in three short steps with a progress indicator: child, parent and health, consent and signature.
6. **Submit:** loading state on the button; the form locks; data is kept if sending fails, with a retry button.
7. **Success and payment:** burst of light, check mark, chime. Then payment instructions: ₹500 by UPI using the QR code, the UPI ID (with a copy button) or the phone number, plus a "Pay ₹500 with UPI" button on phones that opens the UPI app with the amount filled in. Optional field to enter the UPI transaction reference afterwards.

### Fields

| # | Field | Type | Required | Notes |
|---|-------|------|----------|-------|
| 0 | Category | Set by the picker | Yes | Kids or Youth |
| 1 | Name | Text | Yes | Child's full name |
| 2 | Date of birth | Day / month / year selects | Yes | Must match the category's age range on the camp's first day |
| 3 | Parent/Guardian's Name(s) | Text | Yes | |
| 4 | Address | Multi-line text | Yes | |
| 5 | Contact Number(s) of Parent/Guardian/Caregiver to be used in case of emergency | Phone, with "add another number" | Yes | At least one valid number |
| 6 | Any medical conditions or concerns we need to be aware of? | Multi-line text | No | "None" accepted |
| 7 | Any special dietary requirements or allergies we need to be aware of? | Multi-line text | No | "None" accepted |
| 8 | Medical emergency consent | Radio: YES / NO | Yes | Shown with the full statement below |
| 9 | "I have read and understood the above and am happy for my child to be involved in Winter Camp 2027." | Checkbox | Yes | |
| 10 | Signed | Signature canvas with the prompt "Sign here", a Clear button, and a "Type your name instead" option | Yes | Works with finger, stylus or mouse |
| 11 | Date of signing | Date | Yes | Filled with today's date, editable |

Statement shown above field 8, word for word:

> Please read carefully and sign below: We will be enjoying a range of activities during our Winter Camp. We aim to provide a ratio of 1:7 staff to children throughout our sessions to optimise learning and ensure your child's safety. Accidents can happen, however. In a medical emergency would you be happy for us to take action (e.g. Take the child to a clinic/hospital) if this was necessary?

### Backend: Google Apps Script and Google Sheet
- GitHub Pages is static, so the form posts to a Google Apps Script web app bound to a private Google Sheet.
- One row per registration: timestamp, category, all fields, language, signature link, payment reference.
- The signature image is saved to a private Google Drive folder and linked from the sheet.
- The script returns seats left per category, and uses a lock so two people cannot take the last seat. It rejects a submission once a category has 30.
- The script source lives in the repo under `apps-script/`; Paul deploys it from his Google account and puts the web app URL in the site config. Setup steps go in the README.

## 7. Effects map

| Effect | Where | Touch / mobile |
|--------|-------|----------------|
| Loading screen, loading motion | Loader letters lighting up | Same |
| Headline reveal, clip reveal | Hero, section titles, footer wordmark | Same |
| Magnetic buttons / magnetic CTA | Register buttons, gallery arrows, back to top | Press-scale feedback |
| Button feedback | All buttons: press scale 0.96, ripple, click sound | Same |
| Staggered scroll, staggered appearance | Activity cards, gallery items, FAQ items, menu links | Same |
| Scroll reveal, content reveal, fade and lift | Every section | Same |
| Sticky transform | Menu bar turning translucent; hero headline into wordmark; "Day 3" badge; form progress indicator | Same |
| Page transitions, smooth page transitions | Loader to hero, opening and closing registration, menu jumps, lightbox, success view | Same |
| Cursor with context | Glowing cursor with labels: "Register", "Drag", "View", "Play" | Hidden |
| Subtle cursor trail | Faint trail of light | Hidden |
| Micro interactions, interactive icons | Activity icons, toggles, copy button, form fields | Tap-triggered |
| Hover: image zoom, text interaction, hover preview | Gallery, menu links, category cards | Tap or in-view |
| Layered depth, shadows | Hero parallax, cards, glass panels | Fewer layers |
| Concentric radii | All nested rounded elements | Same |
| Clear state change, clear active state | Menu, category choice, form steps, field validity, toggles | Same |
| Expand and confirm | Category cards, FAQ items | Same |
| Loading states, skeleton screens | Seat counts, submit, gallery media | Same |
| Success feedback | After submission; UPI ID copied | Same |
| Tooltips | Help icons, toggles, slider thumb | Tap to show |
| Liquid glass carousel and slider | Gallery | Simplified blur |

## 8. Audio

Opt-in from the loader, since browsers block sound until the visitor interacts.
- Ambient loop at low volume, pausing when the tab is hidden.
- UI sounds: hover tick, click, card expand, carousel whoosh, rising tone as loader letters light, success chime.
- Always-visible sound toggle; choice remembered. No sound while typing in the form.
- Sounds are generated in the browser or use properly licensed files.

## 9. GEO, AEO and AIO readiness

So that search engines, answer engines and AI assistants can read and quote the site correctly:
- All key facts (who, when, where, fee, how to register, contact) are plain text in the HTML that is delivered, not text that only appears after scripts or animations run.
- Semantic structure: one `h1`, ordered headings, `header`, `nav`, `main`, `section`, `footer`.
- Structured data (JSON-LD): two `Event` entries (Youth and Kids) with dates, venue, price in INR and organiser; `Organization` for Kid's Happy Club; `FAQPage` for the FAQ.
- FAQ written as direct question and answer pairs, each answer complete in one or two sentences.
- `robots.txt` that allows search and AI crawlers, `sitemap.xml`, `llms.txt` with a plain summary of the camp.
- Title, meta description, canonical URL, Open Graph and Twitter card image.
- English at `/` and Tibetan at `/bo/`, linked with `hreflang`.
- Descriptive alt text on every image; captions on videos.
- Fast loading (see section 12), since speed affects ranking.

## 10. Accessibility (WCAG 2.2 AA)

- Colour contrast at least 4.5:1 for text and 3:1 for large text and controls.
- Everything works by keyboard; visible focus rings; skip-to-content link; focus trapped in the menu, registration view and lightbox, and returned on close.
- Form: every field has a visible label; errors are described in text, linked to the field and announced; required fields marked; no time limits.
- Signature: typed-name alternative; Clear button; canvas has an accessible name.
- Carousel: buttons and arrow keys, pause control for any auto-motion, slide position announced.
- Motion: honours reduced-motion; nothing flashes more than three times a second; the custom cursor never replaces the system cursor for keyboard or assistive users.
- Audio: off by default, with a visible toggle.
- Touch targets at least 48px; layout works at 200% zoom and 320px width.
- `lang` attributes for English and Tibetan; decorative 3D canvas hidden from screen readers.

## 11. Security and privacy

The form collects children's personal and medical details, so this matters.
- HTTPS only (enforced in GitHub Pages).
- Content Security Policy that allows only the site itself and the Apps Script endpoint; no third-party scripts, fonts or trackers; all libraries bundled and pinned.
- No secrets in the repo. The Apps Script URL is public by nature, so the script validates everything again on the server: types, lengths, allowed values, age against category, seat limit.
- Text is cleaned before it is written to the sheet so that entries cannot run as spreadsheet formulas, and all text is escaped when shown on the page.
- Spam control: hidden honeypot field, minimum fill time, per-submission rate limit in the script.
- The Google Sheet and signature folder stay private to the organisers; nothing personal is stored in the repo or in the browser after a successful submission.
- Privacy notice linked from the form and footer: what is collected, why, who sees it, how long it is kept, and how to ask for deletion. Parental consent is captured by fields 8 to 11.
- Dependency updates and code scanning switched on in the GitHub repo; branch protection on `main`.
- External links use `rel="noopener noreferrer"`.

## 12. Technical approach

- **Stack:** Vite, vanilla JS, three.js, GSAP with ScrollTrigger, Lenis, Web Audio. Google Apps Script backend.
- **Repo layout:** `src/` site code, `gallery/photos/` and `gallery/videos/` for Paul's media, `assets/payment/upi-qr.jpg`, `apps-script/` backend, `docs/` plan and prompt.
- **Deploy:** GitHub Actions builds and publishes to GitHub Pages on push to `main`.
- **Config:** one file with dates, venue, fee, seat limits, UPI details, phone, Apps Script URL.
- **Languages:** strings in `en.json` and `bo.json`; pages pre-rendered for `/` and `/bo/`; toggle remembers the choice.
- **Media limits:** photos are resized and converted at build time. Keep each video under 25 MB (GitHub's browser upload limit) and short; the whole site must stay under 1 GB.
- **Performance budget:** first load under about 1.5 MB on mobile, hero interactive within 3 seconds on 4G; pixel ratio capped at 2; 3D paused off screen; gallery and audio lazy loaded.
- **Fallbacks:** no WebGL gives a static layered image; no `backdrop-filter` gives solid translucent panels; no JavaScript still shows all content and the contact number.
- **Breakpoints:** 360, 768, 1024, 1440.

## 13. Build order

1. Repo setup, config, tokens, base layout, menu bar, language toggle.
2. Static responsive sections in both languages, with structured data.
3. Apps Script backend; registration view, form, signature, seats, payment and success states.
4. Scroll, reveal and transition animation.
5. Loader and hero 3D scene.
6. Gallery build step, liquid glass carousel, lightbox.
7. Cursor, magnetic and micro interactions; audio.
8. Accessibility, security, performance and device testing; deploy.

## 14. Needed from Paul

- Photos and videos in `gallery/`.
- Deploying the Apps Script from his Google account (steps will be in the README).
- Tibetan review by native speakers once draft text is in place.
