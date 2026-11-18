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
| 7 | ~~Tibetan has its own address (`/bo/`)~~ Round 6: the site is English only. Old `/bo/` links go to the English page | Paul's decision in round 6 |

## 2. Camp facts

| | |
|---|---|
| Name | Winter Camp 2027 |
| Theme | Illuminate: Light of the World |
| Organiser | Kid's Happy Club |
| Youth (11 and over, no upper limit) | 4 to 6 January 2027, 30 seats |
| Kids (11 and under) | 11 to 13 January 2027, 30 seats |
| Age 11 | may join either group (age counted on the first day of that group's camp) |
| Venue | Snow View Residency, Jogiwara Road, McLeodganj, Dharamshala, Himachal Pradesh, India, 176219 |
| Fee | ₹500, paid by UPI, non-refundable. Exception: a family that paid but lost the last seat while paying is told to contact the organisers for a refund |
| UPI | QR code (`assets/payment/upi-qr.jpg`), UPI ID `achuisr1985.27-1@okhdfcbank`, or phone number 8219012669. Payee name on the QR: Achui Sareo |
| Contact | +91-8219012669 |
| Seats | First come, first served. When full: "Seats are full. Kindly contact +91-8219012669." |
| Staff ratio | 1 staff member to 7 children |
| Language | English only (round 6) |
| Photo consent | Approved |
| Hosting | GitHub Pages, repo `Paulzhub/wintercamp` |

**Goal:** get children registered. **Audience:** parents (Kids) and youth, mostly Tibetan families, mostly on phones.

## 3. Design system

### Colour

| Role | Hex | Share | Use |
|------|-----|-------|-----|
| Dominant | `#180E55` deep indigo | 60% | Loader, hero, gallery, footer, menu bar |
| Secondary | `#F4F1FB` pale lavender | 30% | Activities, registration view, FAQ |
| Accent | `#D1146C` pink | 10% | Register buttons, active states, highlights, cursor on light. Hover: deeper pink `#B8105F` (white 6.4:1, round 8) |
| Glow | `#E61E7B` (the poster's pink) | | Glows, large decoration |
| Text on dark | `#F5F5F5` | | Small pink text on indigo uses `#FF6FB0` (6.6:1) |
| Text on light | `#180E55` | | |
| Spectrum (decoration only) | `#0CAAE4` `#FCF128` `#91EA43` `#F89C38` `#EF3D2C` `#8319D1` | | Particles, hero light rays and a few snowflakes, success burst, loader bar, section markers |

Taken from the official camp poster (round 6). White labels on the pink accent are 5.2:1; pink text on lavender is 4.7:1. Pink on indigo (3.3:1) is used only for large text and icons.

### Type

- **English headings:** Anton (uppercase display).
- **English body and UI:** Poppins 400, 500, 600.
- Fonts are self-hosted WOFF2 (no third-party requests), `font-display: swap`.

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
- Phones: hamburger opens a full-screen menu with staggered links; focus is trapped while open. **Round 14 (Paul's request):** closing is the exact reverse of opening: the links lower and fade out (0.64 s) while the menu rolls back up (0.8 s, `big`), 0.88 s in all, for the close button, Esc and tapping a link. **Register** closes it at once (Paul's decision: the registration view opens over it). Reduced motion: no slide.
- **Curtain (round 16, Paul's request):** a menu link (menu bar, phone menu, or the wordmark) plays a curtain: an indigo layer and then a pink-to-purple layer wipe across (0.5 s each, `big`, the second 0.1 s behind), the section's name shows in Anton with a spectrum line, the page jumps to the section underneath, and the layers wipe off the other side (about 1.6 s in all). Going down the page they rise from the bottom; going up, from the top. In the phone menu the curtain covers the open menu, which shuts under it. The curtain is a manual popover so it sits above the menu. Not on ordinary scrolling or other in-page links (they glide); none with reduced motion or without popover support (old behaviour). (Round 16 B: the plain cross-page wipe between home and privacy page from part A was removed: with the 3D page, Chrome kept aborting it with a console error.)
- **Curtain between pages (round 17, Paul's choice, both ways):** a same-tab link from the home page to the privacy notice (footer link) plays the curtain's first half with "Privacy notice"; once covered the privacy page loads, opens covered and uncovers when its fonts are in (at most 0.8 s). Back to the home page (the back link, the wordmark, the sub-page menu links) the curtain comes down from the top with "Home" (or the section's name); with the sound choice remembered the loading screen is skipped: the page gets ready under the curtain (same 2.5 s cap) and uncovers at the linked section; otherwise it uncovers onto the loading screen. How: `page-curtain.js` (shared `#curtain`), a short-lived `wc-arrive` flag in sessionStorage (8 s, same tab, matching path), and `public/arrive.js`, a tiny plain script in `<head>` that sets `html.wc-arrive` before the first paint (CSS covers the page in the curtain's pink-to-purple until the real curtain shows; fades by itself after 3 s if scripts fail). No curtain for links opening a new tab (the registration form's privacy link), direct visits, framed pages, reduced motion or browsers without popovers. A page restored by the Back button is uncovered at once. No View Transitions API (see round 16 B).
- **Section progress (round 16):** a 3 px spectrum line under the menu bar (home page), shown once the bar is frosted. It fills with the scroll position; each of the five sections has a dot where its top lands: white once passed, larger and glowing for the section in view.
- **Sub-pages (round 9, Paul's decision):** every page other than the home page (the privacy notice now; any future page, made with `subPage()` in `render-pages.mjs`) starts with an indigo title band, a small hero with the page title. The menu bar is see-through over it, as over the home page's hero, and frosts once the page scrolls. No page starts light under the bar.

### 5.2 Loading screen
- The letters of **ILLUMINATE** sit unlit and light up one by one as assets load. **Light of the World** fades and lifts in at the end.
- "Enter with sound" and "Enter silently" buttons.
- Exit: light expands from the word as a clip reveal into the hero. Capped at about 2.5 seconds.

### 5.3 Hero
- Label "Winter Camp 2027", headline **ILLUMINATE**, sub-line **LIGHT OF THE WORLD** (capitals by CSS, round 8).
- Countdown "N days to camp" is the most prominent small text in the hero: large number (56 to 80 px) in bright pink with a glow (round 8).
- Dates for both groups, venue, "Limited seats, first come first served".
- **REGISTER NOW** magnetic button opens the registration view. Secondary: "See what we do".
- 3D scene (three.js): layered mountain ridge, light rising behind it with rays, glowing snow particles; headline letters brighten where the pointer passes.
- **Round 16 (B), Paul's choices: one continuous 3D world behind the whole home page, on desktop and phones, with the Lantern Star.** `world3d.js` draws a fixed full-screen canvas (`.world`) behind `main` and the footer. The page scroll scrubs one camera path through four scenes: **1 Hero** (low-poly ridges, the Lantern Star rising behind them, snow, the round 5 sky rays following the star), **2 Activities** (the light glides down into a campfire circle of low-poly children), **3 Gallery** (the camera tilts up: lanterns rise, photo frames float), **4 Footer** (pull back to a quiet starry ridge; the light settles as a star above the venue). Anchors: the top, the middle of Activities, the middle of the Gallery, the bottom; between them the camera eases in and out (smoothstep) and follows with a damped glide (0.28 s, real time). Parallax with the scroll and the pointer; haze (fog) stands in for depth of field; soft light from the star, the fire and a moon light. Hold to illuminate (F) and snow settling (I) work as before.
  - **Activities and FAQ become frosted lavender** (Paul's choice) over the scene. **Round 17 (Paul's option B, thinner so the scene shows):** 60% lavender with a 24 px blur on tablets and desktops; 68% and no blur on phones and slow devices (a blur over a moving canvas is costly). Muted text on these sections is `#281F60` (4.6:1 even with black behind); headings `#180E55` 5.4:1. The activity cards' indigo is 72% with a 12 px blur (80%, no blur on phones/slow devices; photos stay solid; card text 90% white; the icon's ring became a fine line and shadow); the FAQ questions are 70% white with a 12 px blur (78% on phones/slow devices). Text stays 4.5:1 or more whatever glows behind (checked in 28a). Hero transparent; Gallery and Explore 30% indigo with their headings on a frosted indigo panel (`.glass-head`, round 17: 45%, was 62%; its small text full white); footer fades from 20% to 72% indigo. The 2D snow in the Gallery and footer steps aside for the 3D scene (`data-world-off`).
  - Pauses (and is hidden) while a dialog is open (registration, menu, full-screen view); pauses while the tab is hidden. **Round 17:** it no longer pauses under the Explore panel (it shows through it); while the Explore model draws, phones (under 768 px) run the world at half frame rate and at most 1× resolution (`share()`), back to normal when the model is off screen. Lambert shading (cheap per pixel). When frames average over 30 ms for a second it steps down one level at a time: no blur behind the frosted sections (`world-lite`), resolution 1×, half the lanterns and snow, resolution 0.75×, 30 fps, resolution 0.5×. Slow phones (4 cores or less, 4 GB memory or less, or Data Saver) start two steps down, with fewer stars, lanterns and snow and no antialiasing.
  - Reduced motion: a still frame of scene 1 and today's solid sections (no `has-world`). No WebGL: the still layered image and solid sections, as before.
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

The picnic card is larger, with a sticky "Day 3" badge. **Round 13:** every card shows a gallery photo. The five small cards have it as a strip on top (16:9, 8 px inset, 24 px corners; the icon overlaps its bottom edge; text stays dark on the light card); the picnic card keeps its photo behind the text. The photo ids are in `site.config.js` (`activityPhotos`), one per card, so a photo is swapped by changing one id: Games #18 hoops game, Craft #20 tote bags, Storytelling #19 leader with children on the floor, Music time #4 session in the hall, Snacks and lunch #16 picnic lunch (Paul's picks). The small cards' images have `alt=""`; all load lazily with `srcset`. **Round 14:** all six cards are indigo (`#180E55`, class `dark`, `data-tone="dark"`) with light text (15.6:1); the icon tile is solid `#2E2565` with the `--accent-ink` pink icon (5.2:1) and an indigo ring (round 17: with the 3D world the cards are see-through, 72%, and the ring is a fine line and shadow). Each photo is a button ("Open photo: Games", etc.) that opens it in the full-screen view **on its own** (Paul: not a gallery; no previous/next, no swipe), with the same view transition, pinch, Esc and backdrop close; the caption is the photo's gallery description. The picnic card's whole photo area is the button. Below the cards: a strip with dates, venue, fee and a second register button.

### 5.4b Explore (round 16 B, dark)
- Between Activities and the Gallery: eyebrow "Explore", title "Find your way around", a framed 360° model (Paul's choice: the McLeodganj ridge with **Snow View Residency**, pines, the picnic sheet and a sign, and **the Lantern floating above it**, lighting it). **Round 17 (Paul's request):** no solid fill: the section is 30% indigo like the Gallery, the frame is almost clear (a hairline edge, the spectrum line, the shadow) and the model's canvas is transparent, so the page's 3D world shows behind the model (both scenes draw; see 5.3 for phones). The frame keeps its place while the model loads (`is-wait`), so the page doesn't change height. The Lantern shines: a warm inner glow and a wide soft halo drawn over the paper panels, which flicker with the flame (light 30 ± 11%, flame size and panel glow follow; `flicker()` in `explore3d.js`). The hint is a small frosted pill. Without the 3D world the section stays solid indigo. `explore3d.js` loads after the loading screen, when the panel comes within 600 px of the screen.
- Drag to turn it (OrbitControls, no zoom or pan); it keeps turning a little after letting go (inertia) and turns slowly by itself after 3 s alone. On phones only sideways drags turn it; up-and-down drags scroll the page (`touch-action: pan-y`).
- Five numbered hotspots, real buttons in the HTML (`aria-expanded`, 48 px, kept 56 px apart): 1 Illuminate (theme), 2 Dates, 3 Venue, 4 Day 3 picnic, 5 Fee and seats. Each opens one tip card at a time, placed in the half of the frame away from its number; the other numbers step back while it is open; Esc or × closes it and focus returns to the number. Numbers hidden behind the model fade (a ray test).
- "Tilt to turn" on touch devices: the phone's tilt turns the model only after a tap (iPhone asks for permission then); the same button turns it off.
- Reduced motion, no WebGL or no JavaScript: the same five facts as cards.

### 5.5 Gallery (dark)
- One mixed set of photos and videos, not grouped by year.
- **Liquid glass carousel:** centre item sharp and large, side items scaled and tilted in 3D; glass panels carry captions and controls.
- **Slider:** a glass thumb that scrubs through the items; also drag, swipe, arrow keys, prev/next buttons.
- Videos show a poster frame with a play icon and play muted inline; full sound in the lightbox.
- Hover: image zoom, caption text interaction, cursor label "Drag", "View" or "Play". Lightbox with shared-element transition.
- **Full-screen view (round 8):** translucent indigo background (`rgb(24 14 85 / 0.7)` with a 16 px blur), so the page shows through softly. Dragging with a finger or the mouse moves the item with the pointer while the next or previous item slides in alongside it, a 32 px gap apart; on release the move finishes (past a quarter of the way, or a quick flick) or springs back. Buttons and arrow keys make the same full-width slide. **Round 14 (Paul's pick, "depth slide"):** the item moving out drifts a quarter of the distance, shrinks to 86% and fades, while the incoming item slides over it at full size; while dragging, the current item moves a quarter as far as the pointer. `html { scrollbar-gutter: stable }` keeps the viewport the same size when a dialog opens; without it, Windows' classic scrollbar disappeared and Chrome cancelled the view transition ("Viewport size changed"), so the view opened with no motion on desktop.
- **Round 10 (Paul's requests):**
  - **Rounded corners all the way:** the open and close transitions move the thumbnail's rounded wrapper (`.car__media`), not its image (which has no corners of its own and is scaled by the slow pan). The moving box is clipped, and its corners ease from the thumbnail's 32 px to the view's 24 px, and back on close. The GSAP fallback (browsers without view transitions) counter-scales the corner radius so it looks the same.
  - **Fade while sliding:** the item moving out fades out and the one moving in fades in. While dragging, opacity follows the distance moved (outgoing `1 − p`, incoming `p`); finishing the move or springing back eases opacity with the movement. Buttons and arrow keys fade both items during the full-width slide (round 8 had no fade). With reduced motion the item changes at once.
- Skeletons while loading, lazy loading.
- **Source:** files Paul drops into `gallery/photos/` and `gallery/videos/`. The build step reads the folders, creates optimised sizes and a manifest, so no code changes are needed. Optional `gallery/captions.json` for captions and alt text in both languages.
- Glass refraction (SVG displacement) in Chromium; frosted blur elsewhere.

### 5.6 Camp facts and FAQ (light)
Plain-text answers to the questions parents and answer engines ask: who is it for, when, where, how much, how to pay, what is provided, how to register, what if seats are full, who to contact. Accordion with expand-and-confirm motion; all answers are in the HTML whether open or closed.

### 5.7 Footer (dark)
- Oversized **Kid's Happy Club** wordmark with clip reveal (round 17: the reveal always ends by the bottom of the page, and scroll effects are measured again whenever the page changes height; on phones the name used to stay hidden after the Explore model made the page ~450 px shorter); small line "Winter Camp 2027 · Illuminate: Light of the World".
- **Marquee (round 16, Paul's request):** the wordmark moves sideways at a steady speed (about 4% of the screen width per second, at least 40 px/s) with a small spectrum star between copies. The name is read once by screen readers (the copies are `aria-hidden`). Starting, stopping and pausing ease in and out (0.8 s). A visible pause/play button (48 px) sits on the line under it, beside the rights line ("Pause the moving name" / "Play the moving name", WCAG 2.2.2); it also pauses while the mouse is over it or keyboard focus is on its button, and stops off screen or when the tab is hidden. Reduced motion: the still, centred wordmark and no button.
- Venue, phone +91-8219012669 (tap to call), privacy notice link, language toggle, magnetic back-to-top.
- Rights line: "© Kid's Happy Club" (round 14: no year).

## 6. Registration

### Flow
1. **Open:** "REGISTER NOW" or the menu button opens the registration view with a page transition.
2. **Pick a category:** Kids (11 and under, 11 to 13 Jan) or Youth (11 and over, 4 to 6 Jan). The Kids card's icon is a child holding a balloon (round 14; the earlier figure's head lines read as horns). Each card shows seats left (skeleton while loading). The form does not appear until one is chosen.
3. **Seats full:** a full category (seats taken plus seats held) shows "Seats are full. Kindly contact +91-8219012669." with a tap-to-call link, and cannot be selected. When it is full only because families are paying right now, the card adds "Some seats are held by families who are paying right now. If they don't finish, a seat may open within 5 minutes." with **Check again** (round 7). Above the cards: "When you reach payment, your seat is held for 5 minutes." A live seat line under the hero's Register button and in the phone menu shows seats left per group, "Seats are full" per group, and "Seats are full. Kindly contact +91-8219012669." with tap-to-call when both are full.
4. **Expand and confirm:** the chosen card expands with a clear active state; "Change" goes back.
5. **Form** (below), in four short steps with a progress indicator: child, parent and health, consent and signature, payment. On the consent step, **Next** stays disabled until medical emergency consent is YES, the agreement box is ticked (round 7, Paul's decision) and there is a signature: drawn on the pad (at least 4 points; a tap or a cleared pad doesn't count) or a typed full name (round 9). The note by the buttons lists only what is still missing. The server refuses an empty drawn signature too. NO shows "Medical emergency consent must be YES for your child to take part in Winter Camp 2027."
   - **Draft (round 7, Paul's decision):** what the family types (never the payment screenshot) is kept in the tab's `sessionStorage`, so the form survives the tab reloading while they pay in their UPI app. Back on the page, the form reopens at the payment step with the same registration code. The draft is deleted when the registration is sent, and ends with the tab.
6. **Payment step:** before this step is shown the server **holds a seat for 5 minutes** (round 7). If the group has filled, or its last seats are held, the seats-full message appears and nobody is asked to pay; (round 12: there is no longer an "already registered" check before paying, because it let anyone test a child's name and birth date; a second registration of the same child is caught when the form is sent and saved as "Paid, duplicate"; holds keep at most 8 seats a group at a time, and past that, or when the organisers set the `holds_off` script property, the family goes on to pay without a hold). Otherwise the step shows a countdown ("Your seat is held for 4:32"). When it runs out: "Hold my seat again" (a tap, so an idle tab cannot keep the last seat; at most 15 minutes in all). If the seats have gone by then, the family is told not to pay, or, if they already paid, to send the form anyway so the payment is recorded and refunded. The step then shows "If anything goes wrong after you pay, call +91-8219012669 with your payment screenshot.", a **registration code** to type in the UPI payment note, and: ₹500 by UPI using the QR code, the UPI ID or the phone number, each with a copy button. **Round 11 (Paul's decision):** the red warning and the "Pay ₹500 with UPI" button with its list of UPI apps (rounds 7 to 9) were removed, because UPI apps blocked those links; families scan the QR code (on the same phone: a screenshot of it, chosen from the gallery in their UPI app's scanner, as the help under the QR code says) or copy the UPI ID or phone number. Copying either one counts as starting to pay: a `pagehide` within 15 minutes of it (iPhones may fire it when Safari goes to the background) does not release the hold. The payee name "Achui Sareo" is shown with the instruction to check that name in the UPI app before paying.
7. **Payment screenshot (required):** JPG, PNG or WebP; resized in the browser; preview, replace and remove controls. Optional UPI transaction ID (UTR): 12 digits when given. The submit button stays disabled until a screenshot is attached **and the WhatsApp confirmation button has been tapped** (round 14). **Round 14 (replaces round 13's button):** once a screenshot is attached, a pink button "CLICK HERE TO SEND PAYMENT CONFIRMATION DETAILS TO ACHUI +91-8219012669" appears **after the UTR field** (Paul's choice). It opens `https://wa.me/918219012669?text=…` (new tab) with this message, built at the moment of the tap so a UTR typed before it is included (Paul approved the text; text only, a wa.me link cannot carry the screenshot):

    Winter Camp 2027 – payment confirmation
    Child: {child's name}
    Parent/guardian: {parent's name}
    Group: Kids (11 to 13 January 2027)
    Amount: ₹500 by UPI to Achui Sareo (achuisr1985.27-1@okhdfcbank)
    Registration code: {code}
    UTR: {only if typed}
    Screenshot attached in the registration form.

  The site knows only that the button was **tapped**, not that the message was sent. The tap is remembered for that group and registration code (`state.waKey`); it is kept in the draft (so a family who reloads need not message Achui twice), and reset when the screenshot is replaced or removed (Paul's decision). Until it is tapped, the hint under the form says "Tap the pink button above to send your payment details to Achui on WhatsApp, then submit." Tapping keeps the seat hold, like the copy buttons. The privacy notice says the message goes to WhatsApp only if the family taps and sends it.
8. **Submit:** everything is sent in one go. Loading state on the button; the form locks; data and screenshot are kept if sending fails, with a retry button. After a network failure it is sent again automatically when the connection returns; when the server is busy it retries by itself after 5, 10 and 20 seconds. Leaving the page with an unsent screenshot asks for confirmation.
9. **Seat given:** burst of light, check mark, chime, and a confirmation with the child's name, category, dates and venue. **Download registration details** downloads a PDF of the whole registration (every field, signature, payment details and screenshot, time of submission), and **Share** shares that PDF where the phone allows it. The PDF is drawn in the browser (so Tibetan is shaped correctly with Jomolhari), and a copy is sent to the organisers' private Drive. **Round 9:** the copy is kept in the browser (IndexedDB) until the server confirms it, and sent again on the next visit if the upload failed (for at most 7 days); the success screen says "Saving a copy…", then whether it was saved or will be sent next time. **Round 10:** if the server refuses the copy for good (too late, not a valid PDF, unknown registration) the screen no longer says it will be sent next time.
10. **Already registered, found after paying:** the payment is saved in "Paid, no seat" with status "Paid, duplicate", and the family sees "This child is already registered for this group. We have saved this payment and your details for the organisers. Please call +91-8219012669 with your payment screenshot."
11. **Last seat just taken:** if the category filled between paying and submitting, show exactly: "Oh No Someone booked the last seat just before you! Kindly contact +91-8219012669" with a tap-to-call link. The submission is saved in the "Paid, no seat" tab.

### Fields

| # | Field | Type | Required | Notes |
|---|-------|------|----------|-------|
| 0 | Category | Set by the picker | Yes | Kids or Youth |
| 1 | Name | Text | Yes | Child's full name |
| 2 | Date of birth | Day / month / year selects | Yes | Must match the category's age range on the camp's first day |
| 3 | Parent/Guardian's Name(s) | Text | Yes | |
| 4 | Address | Multi-line text | Yes | |
| 5 | Contact Number(s) of Parent/Guardian/Caregiver to be used in case of emergency | Phone, with "add another number" | Yes | 10 digits each, numbers only; at least one. Round 14 (Paul's wording): the error, and the warning when an 11th digit is typed, say "Phone numbers up to 10 digits only." |
| 6 | Any medical conditions or concerns we need to be aware of? | Multi-line text | No | "None" accepted |
| 7 | Any special dietary requirements or allergies we need to be aware of? | Multi-line text | No | "None" accepted |
| 8 | Medical emergency consent | Radio: YES / NO | Yes, must be YES | Shown with the full statement below; NO blocks Next (round 7) |
| 9 | "I have read and understood the above and am happy for my child to be involved in Winter Camp 2027." | Checkbox | Yes | |
| 10 | Signed | Signature canvas with the prompt "Sign here" and a Clear button, or a typed full name | Yes | Works with finger, stylus or mouse |
| 11 | Date of signing | Date | Yes | Filled with today's date, editable. **Cannot be a future date** (round 15, Paul's request): the picker's latest date is today; a future date shows "The date of signing cannot be a future date. Choose today or an earlier date." at once and keeps Next disabled (the note by the buttons says "choose a date of signing that is today or earlier"); it is checked again on submit; the server refuses it too (one day of slack for time zones). |
| 12 | Payment screenshot | Image upload | Yes | Saved to Google Drive, not GitHub |
| 13 | UPI transaction ID (UTR) | Text | No | 12 digits when given |

Statement shown above field 8, word for word:

> Please read carefully and sign below: We will be enjoying a range of activities during our Winter Camp. We aim to provide a ratio of 1:7 staff to children throughout our sessions to optimise learning and ensure your child's safety. Accidents can happen, however. In a medical emergency would you be happy for us to take action (e.g. Take the child to a clinic/hospital) if this was necessary?

### Backend: Google Apps Script and Google Sheet
- GitHub Pages is static, so the form posts to a Google Apps Script web app bound to a private Google Sheet.
- One row per registration, in a tab for each group (**Kids registrations**, **Youth registrations**): timestamp, category, all fields, language, signature link or typed signature, payment reference.
- Files go to private Google Drive folders, never to GitHub, and are linked from the sheet row:
  - `Winter Camp 2027/Kids/Payment screenshots/` and `Winter Camp 2027/Kids/Signatures/`
  - `Winter Camp 2027/Youth/Payment screenshots/` and `Winter Camp 2027/Youth/Signatures/`
  - `Winter Camp 2027/{Kids,Youth}/Registration PDFs/`: a PDF of each full registration (round 4), linked in the **Registration PDF** column. Round 9: accepted within 7 days; the **PDF status** column says Waiting for PDF, Saved, or why it was refused. The folder is made with the first registration. Round 9 fixed a bug that refused every PDF on the live Sheet: it stores timestamps as dates, and the script read them as a day without a time. **Round 10:** that fix only took effect once the round 9 script was deployed as a new version (Version 6, 13 Nov 2026); until then the web app still ran Version 5 (12 Nov), which refused every PDF as too late, and families' browsers dropped those copies.
- Files are named with the category, child's name and timestamp.
- Uploads are checked on the server: images only (verified by file content, not just the name), 5 MB maximum, and a registration without a valid screenshot is rejected.
- The script returns seats left per category, and uses a lock so two people cannot take the last seat. Once a category has 30, further submissions get the "last seat" response and are written to the "Paid, no seat" tab with their screenshot instead of the main list.
- **Seat holds (round 7):** `hold` and `release` actions. Holds live in Script Properties (one small JSON value, read and written under the lock); a hold counts as a taken seat for 5 minutes or until the form is sent. Chosen over CacheService (can drop entries early) and a hidden sheet (slower, editable by mistake).
- **Payment records (round 7):** new columns **Registration code**, **Payment check** (dropdown: Not checked / Received / Not received / Refund due / Refunded; "Not received" and "Refunded" give the seat back), **Possible duplicate payment** (same screenshot or UPI reference as another row; flagged, never refused) and **Screenshot fingerprint**. A **Summary** tab totals rows, checks and money per tab.
- The script source lives in the repo under `apps-script/`; Paul deploys it from his Google account and puts the web app URL in the site config. Setup steps go in the README.

## 7. Effects map

| Effect | Where | Touch / mobile |
|--------|-------|----------------|
| Loading screen, loading motion | Loader letters lighting up | Same |
| Headline reveal, clip reveal | Hero, section titles, footer wordmark | Same |
| Magnetic buttons / magnetic CTA | Register buttons, hero buttons, sound, gallery arrows, full-screen view's buttons, back to top, sub-page back link. Round 16: within 24 px a button leans towards the mouse (32% of the distance, at most 14 px, 0.48 s `std`) and springs home with a full elastic bounce (`elastic.out(1, 0.3)`, 1.2 s, Paul's choice). Uses the CSS `translate` property so the press scale still works. Never behind an open dialog; none with reduced motion | Press-scale feedback |
| Button feedback | All buttons: press scale 0.96, ripple, click sound | Same |
| Staggered scroll, staggered appearance | Activity cards, gallery items, FAQ items, menu links | Same |
| Scroll reveal, content reveal, fade and lift | Every section | Same |
| Sticky transform | Menu bar turning translucent; hero headline into wordmark; "Day 3" badge; form progress indicator | Same |
| Page transitions, smooth page transitions | Loader to hero, opening and closing registration, menu jumps, lightbox, success view | Same |
| Cursor with context | Glowing cursor with labels: "Drag", "View", "Play" (photos and the carousel). Round 16, sticky cursor: over a button or menu link the orb becomes a ring in the button's shape (its size plus 6 px each side, its own corner radius), white on dark and pink on light; it follows the button (and the magnet), leans 8% towards the mouse and lets go when the mouse leaves. Replaces the old "Register" label pill | Hidden |
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
- English at `/`. Old `/bo/` links redirect to it (keeping `#section`), marked `noindex`.
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
- `lang="en"`; decorative 3D canvas hidden from screen readers.

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
- Privacy notice linked from the form and footer: what is collected, why, who sees it, how long it is kept, and how to ask for deletion. **Retention (round 12, Paul's decision, replacing round 8's "no set end date"):** registration data is kept for 6 months after the camp ends and deleted by 13 July 2027, for Kid's Happy Club to look back on the camp and plan future ones; until then it stays confidential to the organisers and is deleted sooner on request unless a law requires keeping something. The draft in the browser lasts at most 2 hours. (Noted for Paul: the DPDP Act's erasure duty, s.8(7), and the DPDP Rules' notice and children's-data rules apply in full from 13 May 2027.) Parental consent is captured by fields 8 to 11.
- Dependency updates and code scanning switched on in the GitHub repo; branch protection on `main`.
- External links use `rel="noopener noreferrer"`.

## 12. Technical approach

- **Stack:** Vite, vanilla JS, three.js, GSAP with ScrollTrigger, Lenis, Web Audio. Google Apps Script backend.
- **Repo layout:** `src/` site code, `gallery/photos/` and `gallery/videos/` for Paul's media, `assets/payment/upi-qr.jpg`, `apps-script/` backend, `docs/` plan and prompt.
- **Deploy:** GitHub Actions builds and publishes to GitHub Pages on push to `main`.
- **Config:** one file with dates, venue, fee, seat limits, UPI details, phone, Apps Script URL.
- **Language:** strings in `en.json`; pages pre-rendered for `/` and `/privacy/`.
- **Media limits:** photos are resized and converted at build time. Keep each video under 25 MB (GitHub's browser upload limit) and short; the whole site must stay under 1 GB.
- **Performance budget:** first load under about 1.5 MB on mobile, hero interactive within 3 seconds on 4G; pixel ratio capped at 2 (1.5 on phones, 1 in lite mode); 3D paused when hidden or behind a dialog (round 17: both scenes draw while Explore is on screen; phones run the world at half rate then); gallery and audio lazy loaded. Round 16 B: the 3D world chunk is 143 KB compressed (it was 140 KB for the hero alone, three.js included); the Explore model is a separate 7 KB chunk loaded near view. Everything is drawn in code from low-poly shapes: no model or texture files.
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
