# Build prompt: Winter Camp 2027 website

Use this prompt, together with `docs/winter-camp-website-plan.md` in the repo `Paulzhub/wintercamp`, to build the site. The plan is the full specification; where this prompt and the plan differ, the plan wins.

---

Build a responsive, interactive, 3D single-page website for **Winter Camp 2027**, run by **Kid's Happy Club**, and deploy it to GitHub Pages from the repo `Paulzhub/wintercamp`. Read `docs/winter-camp-website-plan.md` first and follow it section by section.

## What the site is for

The site exists to register children for the camp. Most visitors are Tibetan parents and young people on phones, so build mobile first and keep the path to registration short. The camp has two groups, each with 30 seats, first come first served:

- **Youth (10 to 18):** 4 to 6 January 2027
- **Kids (under 10):** 11 to 13 January 2027

Venue: Snow View Residency, Jogiwara Road, McLeodganj, Dharamshala, Himachal Pradesh, India, 176219. Fee: ₹500 by UPI. Contact: +91-8219012669. Theme: **Illuminate: Light of the World**.

## Stack and structure

- Vite, vanilla JavaScript, three.js, GSAP with ScrollTrigger, Lenis, Web Audio API. No UI framework.
- Bundle and pin every dependency; self-host fonts as WOFF2. The built site makes no third-party requests except to the Google Apps Script endpoint.
- Repo layout: `src/` (site), `gallery/photos/` and `gallery/videos/` (media added by the owner), `assets/payment/upi-qr.jpg`, `apps-script/` (backend), `docs/`.
- One config file holds dates, venue, fee, seat limits, UPI details, phone number and the Apps Script URL.
- GitHub Actions workflow builds and publishes to GitHub Pages on push to `main`.
- Pre-render the page in English at `/` and Tibetan at `/bo/` so all content is in the delivered HTML. Strings live in `en.json` and `bo.json`. Write draft Tibetan and mark it clearly for native-speaker review.

## Design rules (do not deviate)

- **Colour:** `#1C1C1C` dominant (60%), `#E9ECEF` secondary (30%), `#E3171A` accent (10%). Text is `#F5F5F5` on dark and `#111111` on light. Red is only for large text, icons and button fills.
- **Fonts:** Anton for English headings, Poppins for English body, Jomolhari for all Tibetan text. Jomolhari has one weight: no synthetic bold or italic, no uppercase, no letter-spacing, line height about 1.8, and animate Tibetan by line or word, never by letter.
- **Spacing:** multiples of 8 only.
- **Radii:** concentric; inner radius equals outer radius minus padding.
- **Motion:** every animation eases in and out. Use `cubic-bezier(0.65, 0, 0.35, 1)` as standard and `cubic-bezier(0.76, 0, 0.24, 1)` for large reveals. Honour `prefers-reduced-motion`.
- **Shadows:** three depth levels, as in the plan.

## Sections, in order

1. **Loading screen.** Dark. The letters of ILLUMINATE light up one by one with real loading progress, then "Light of the World" fades and lifts in. Offer "Enter with sound" and "Enter silently". Exit with light expanding as a clip reveal. Cap at about 2.5 seconds.
2. **Menu bar.** Links to Home, Activities, Gallery, FAQ and Contact, a red Register button, language toggle (EN / བོད) and sound toggle. On scroll it sticks to the top and becomes translucent frosted glass. Clear active state. Full-screen menu on phones.
3. **Hero.** Label "Winter Camp 2027", headline ILLUMINATE, sub-line "Light of the World", both date ranges, venue, and a magnetic **REGISTER NOW** button that opens the registration view. Behind it, a three.js scene: layered mountain ridge, light rising with soft rays, glowing snow particles, and headline letters that brighten under the pointer (device tilt or scroll on phones). On scroll the headline shrinks into the menu bar wordmark.
4. **Activities.** Light, playful section titled "Three days of fun" with six animated cards, using the card text in the plan (Games, Craft, Storytelling, Music time, Snacks and lunch, Day 3 picnic). The picnic card is larger with a sticky "Day 3" badge. End with a strip of dates, venue, fee and a second register button.
5. **Gallery.** Dark. A liquid glass carousel and slider of photos and videos from `gallery/`, not grouped by year. Write a build step that reads the folders, generates optimised sizes and a manifest, and reads optional captions from `gallery/captions.json`. Include drag, swipe, arrow keys, buttons, image zoom on hover, and a lightbox. Use SVG displacement for glass refraction where supported and frosted blur elsewhere. Show a tasteful placeholder state while the folders are empty.
6. **Camp facts and FAQ.** Light. Direct question and answer pairs covering who, when, where, fee, payment, what is provided, how to register, what happens when seats are full, and contact.
7. **Footer.** Dark. Oversized "Kid's Happy Club" wordmark with clip reveal, a small "Winter Camp 2027 · Illuminate: Light of the World" line, venue, tap-to-call phone number, privacy notice link.

## Registration view

Opens full screen from REGISTER NOW and the menu button.

1. Ask the visitor to choose **Kids** or **Youth** before any form is shown. Show seats left on each card, with a skeleton while loading.
2. If a category has 30 registrations, show exactly: "Seats are full. Kindly contact +91-8219012669." and prevent selection.
3. Expand the chosen card with a clear active state, then show the form in three steps with a progress indicator.
4. Fields, with these labels:
   - Name
   - Date of birth (validated against the category's age range on that camp's first day)
   - Parent/Guardian's Name(s)
   - Address
   - Contact Number(s) of Parent/Guardian/Caregiver to be used in case of emergency
   - Any medical conditions or concerns we need to be aware of?
   - Any special dietary requirements or allergies we need to be aware of?
   - The consent statement from the plan, word for word, followed by a YES / NO radio group
   - Required checkbox: "I have read and understood the above and am happy for my child to be involved in Winter Camp 2027."
   - Signed: a canvas the visitor draws on by finger, stylus or mouse, showing the prompt "Sign here" until they start, with a Clear button and a "Type your name instead" alternative
   - Date of Signing (today's date by default)
5. Validate inline with clear messages. On submit, show a loading state and lock the form; on failure keep the data and offer retry.
6. On success, play the success animation and show payment instructions: ₹500 by UPI via the QR image at `assets/payment/upi-qr.jpg`, the UPI ID `achuisr1985.27-1@okhdfcbank` with a copy button, or phone number 8219012669; on phones add a button that opens the UPI app with the amount filled in. Offer an optional field for the UPI transaction reference.

**Backend.** Write a Google Apps Script web app in `apps-script/` that: appends each registration as a row in a private Google Sheet; saves the signature image to a private Drive folder and stores the link; returns seats left per category; uses a lock so the 30-seat limit cannot be exceeded; validates every field again on the server; and neutralises text that could run as a spreadsheet formula. Write README steps for the owner to deploy it and paste the URL into the config.

## Effects

Implement every effect in the plan's effects map in the place it names: loading screen and loading motion, headline reveal, clip reveal, magnetic buttons, button feedback, staggered scroll and appearance, scroll and content reveal, fade and lift, sticky transform, page transitions, contextual cursor with a subtle trail, micro interactions, interactive icons, image zoom, text interaction, hover preview, layered depth, shadows, clear state changes and active states, expand and confirm, loading states, skeleton screens, success feedback, tooltips, and the liquid glass carousel. Cursor, trail and magnetic effects are desktop only; touch devices get press feedback.

**Audio.** Opt-in ambient loop and short UI sounds, generated with the Web Audio API, with a visible toggle that remembers the choice. No sound during form typing.

## Standards the site must meet

- **GEO, AEO, AIO:** key facts as plain text in the delivered HTML; semantic headings and landmarks; JSON-LD for two `Event` items, `Organization` and `FAQPage`; `robots.txt` that allows search and AI crawlers; `sitemap.xml`; `llms.txt`; canonical, `hreflang`, meta description, Open Graph image; descriptive alt text.
- **Accessibility:** WCAG 2.2 AA. Keyboard access throughout, visible focus, skip link, focus management in overlays, labelled fields with announced errors, signature alternative, carousel controls, reduced motion, 48px touch targets, correct `lang` attributes.
- **Security and privacy:** HTTPS; strict Content Security Policy; no third-party scripts or trackers; no secrets in the repo; server-side validation; honeypot and rate limiting; output escaping; nothing personal left in browser storage after submission; a privacy notice page; Dependabot and code scanning enabled.
- **Performance:** first load under about 1.5 MB on mobile and interactive within 3 seconds on 4G; pixel ratio capped at 2; 3D paused when off screen; lazy loaded gallery and audio; fallbacks for no WebGL, no `backdrop-filter` and no JavaScript.

## How to work

Follow the build order in the plan. Work on a branch and open a pull request. Before calling it done, run the build, test at 360, 768, 1024 and 1440 widths, check keyboard-only use and reduced motion, run an automated accessibility check and Lighthouse, and test a full registration against a test sheet, including the seats-full case. Report anything that could not be verified.
