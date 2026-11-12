# Winter Camp 2027 Website Plan

Status: v6, ready to build. The build prompt is in `BUILD_PROMPT.md`.

## 1. Decisions made on Paul's behalf (change any of these)

| # | Decision | Why |
|---|----------|-----|
| 1 | Registration opens as a full-screen view from "REGISTER NOW" and the menu, rather than sitting between sections | The page order given is hero, activities, gallery, footer; the form is long and needs room |
| 2 | Age is checked against the first day of that category's camp (Youth: 4 Jan 2027, Kids: 11 Jan 2027) | The form needs one rule to match date of birth to Kids or Youth |
| 3 | A seat is given only when the form is submitted together with a payment screenshot. The site cannot verify the payment itself, so organisers check the screenshots | Paul's decision: no unpaid registrations hold seats |
| 4 | If someone pays but the last seat goes before they submit, their details and screenshot are still saved in a separate "Paid, no seat" tab | Organisers can refund them or make room when they call |
| 5 | The signature is drawn on the canvas, with a "Type your name instead" option for anyone who can't draw one. A typed name is stored in its own sheet column | Paul's decision (November 2026; previously drawn only) |
| 6 | A short "Camp facts and FAQ" block sits above the footer | Needed for answer engines and for parents; see section 9 |
| 8 | The UPI QR image stays in the repo rather than on Google Drive, and the payee name "Achui Sareo" and UPI ID are shown as text beside it | Drive would not make it harder to replace; see section 11 |
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
5. **Form** (below), in four short steps with a progress indicator: child, parent and health, consent and signature, payment.
6. **Payment step:** seats are checked again before this step is shown; if the category has filled in the meantime, the seats-full message appears and nobody is asked to pay. Otherwise it shows: ₹500 by UPI using the QR code, the UPI ID (with a copy button) or the phone number, plus a "Pay ₹500 with UPI" button on phones that opens the UPI app with the amount filled in. The payee name "Achui Sareo" is shown with the instruction to check that name in the UPI app before paying.
7. **Payment screenshot (required):** JPG, PNG or WebP; resized in the browser; preview, replace and remove controls. Optional UPI transaction reference. The submit button stays disabled until a screenshot is attached.
8. **Submit:** everything is sent in one go. Loading state on the button; the form locks; data and screenshot are kept if sending fails, with a retry button.
9. **Seat given:** burst of light, check mark, chime, and a confirmation with the child's name, category, dates and venue. **Download registration details** downloads a PDF of the whole registration (every field, signature, payment details and screenshot, time of submission), and **Share** shares that PDF where the phone allows it. The PDF is drawn in the browser (so Tibetan is shaped correctly with Jomolhari), and a copy is sent to the organisers' private Drive.
10. **Last seat just taken:** if the category filled between paying and submitting, show exactly: "Oh No Someone booked the last seat just before you! Kindly contact +91-8219012669" with a tap-to-call link. The submission is saved in the "Paid, no seat" tab.

### Fields

| # | Field | Type | Required | Notes |
|---|-------|------|----------|-------|
| 0 | Category | Set by the picker | Yes | Kids or Youth |
| 1 | Name | Text | Yes | Child's full name |
| 2 | Date of birth | Day / month / year selects | Yes | Must match the category's age range on the camp's first day |
| 3 | Parent/Guardian's Name(s) | Text | Yes | |
| 4 | Address | Multi-line text | Yes | |
| 5 | Contact Number(s) of Parent/Guardian/Caregiver to be used in case of emergency | Phone, with "add another number" | Yes | 10 digits each, numbers only; at least one |
| 6 | Any medical conditions or concerns we need to be aware of? | Multi-line text | No | "None" accepted |
| 7 | Any special dietary requirements or allergies we need to be aware of? | Multi-line text | No | "None" accepted |
| 8 | Medical emergency consent | Radio: YES / NO | Yes | Shown with the full statement below |
| 9 | "I have read and understood the above and am happy for my child to be involved in Winter Camp 2027." | Checkbox | Yes | |
| 10 | Signed | Signature canvas with the prompt "Sign here" and a Clear button, or a typed full name | Yes | Works with finger, stylus or mouse |
| 11 | Date of signing | Date | Yes | Filled with today's date, editable |
| 12 | Payment screenshot | Image upload | Yes | Saved to Google Drive, not GitHub |
| 13 | UPI transaction reference | Text | No | |

Statement shown above field 8, word for word:

> Please read carefully and sign below: We will be enjoying a range of activities during our Winter Camp. We aim to provide a ratio of 1:7 staff to children throughout our sessions to optimise learning and ensure your child's safety. Accidents can happen, however. In a medical emergency would you be happy for us to take action (e.g. Take the child to a clinic/hospital) if this was necessary?

### Backend: Google Apps Script and Google Sheet
- GitHub Pages is static, so the form posts to a Google Apps Script web app bound to a private Google Sheet.
- One row per registration, in a tab for each group (**Kids registrations**, **Youth registrations**): timestamp, category, all fields, language, signature link or typed signature, payment reference.
- Files go to private Google Drive folders, never to GitHub, and are linked from the sheet row:
  - `Winter Camp 2027/Kids/Payment screenshots/` and `Winter Camp 2027/Kids/Signatures/`
  - `Winter Camp 2027/Youth/Payment screenshots/` and `Winter Camp 2027/Youth/Signatures/`
  - `Winter Camp 2027/{Kids,Youth}/Registration PDFs/`: a PDF of each full registration (round 4), linked in the **Registration PDF** column.
- Files are named with the category, child's name and timestamp.
- Uploads are checked on the server: images only (verified by file content, not just the name), 5 MB maximum, and a registration without a valid screenshot is rejected.
- The script returns seats left per category, and uses a lock so two people cannot take the last seat. Once a category has 30, further submissions get the "last seat" response and are written to the "Paid, no seat" tab with their screenshot instead of the main list.
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
| Cursor follows the background (round 5) | Red over light surfaces (activities, FAQ, registration view), white over dark ones (hero, gallery, full-screen view, menu bar); eases over 0.4 s | Hidden |
| Spotlight (round 5, A) | A soft light follows the mouse across activity cards and questions | Off |
| Countdown (round 5, B) | Hero: days to the first day of camp, rolling up once; "Camp is on now" during camp; hidden after | Same |
| Burst of light (round 5, C) | Registration success: lights travel out together and fade | Same |
| Seat sweep (round 5, D) | A light sweeps over a seat count when it appears or changes | Same |
| Slow pan (round 5, E) | The centre gallery photo zooms and drifts slowly | Same |
| Illuminate (round 5, F) | Hold the hero word: the light and snow brighten, a soft chord plays when full | Hold with a finger |
| Music follows scroll (round 5, G) | With sound on, the music opens up from muffled at the top to full at the bottom | Same |
| Section opening (round 5, H) | Sections open from a rounded inset as they scroll in | Off below 768 px (performance) |
| Settling snow (round 5, I) | Snow gathers along the hero ridges as the page scrolls | Same |

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
- Signature: drawn on the canvas, or typed as a full name for anyone who cannot draw one.
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
- **Payment screenshots are never stored on GitHub.** The repo and the website are public, the site has no safe way to write to the repo from a visitor's browser, and anything committed stays in the history permanently. Private Google Drive folders are the right place.
- **Payment QR:** kept in the repo. The QR has to be public to be shown, so the risk is someone replacing it, and that needs write access wherever it is stored. A Drive link would add a second place to protect, is unreliable for showing images on a website, and would weaken the Content Security Policy. Protection comes from: two-factor sign-in on the GitHub account, no extra collaborators, branch protection on `main`, and showing the payee name and UPI ID as text so parents can confirm the name their UPI app displays.
- The Google Sheet and the Drive folders (signatures, payment screenshots) stay private to the organisers, shared with named people only, never "anyone with the link"; nothing personal is stored in the repo or in the browser after a successful submission.
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
