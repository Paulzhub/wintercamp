# Winter Camp 2027 · Illuminate: Light of the World

The registration website for **Winter Camp 2027** by **Kid's Happy Club**, at Snow View Residency, McLeodganj.

- Site: <https://paulzhub.github.io/wintercamp/> (English only; old `/bo/` links go here)

The full specification is [`docs/winter-camp-website-plan.md`](docs/winter-camp-website-plan.md).

## Everyday changes (no coding)

| To change | Edit |
|---|---|
| Dates, venue, fee, seats, UPI details, phone, backend URL | `site.config.js` (keep seats and dates in step with `CONFIG` in `apps-script/Code.gs`) |
| Any text | `src/i18n/en.json` |
| Gallery | add photos to `gallery/photos/` and videos to `gallery/videos/` |
| Gallery captions and alt text | `gallery/captions.json` (keyed by file name) |
| UPI QR code | replace `assets/payment/upi-qr.jpg` |

Commit to `main` and the site rebuilds and deploys itself in a few minutes (see the **Actions** tab).

Gallery tips:

- Files show in file-name order.
- Keep each video short and under 25 MB.
- Only add media that has consent to be published.

## One-time setup

1. **Backend.** Follow [`apps-script/README.md`](apps-script/README.md), then paste the web app URL into `site.config.js`. Until you do, the registration view says seats cannot be checked and gives the phone number.
2. **GitHub Pages.** In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Then tick **Enforce HTTPS**.
3. **Protect the QR code.**
   - Turn on two-factor sign-in on the GitHub account.
   - Add a branch protection rule for `main` (**Settings → Branches**) that blocks force pushes and deletion.
   - Do not add collaborators you don't need.
4. **Security alerts.** Under **Settings → Code security**, turn on Dependabot alerts and security updates. Code scanning (CodeQL) runs from `.github/workflows/codeql.yml`.

## For developers

Requires Node 20.19 or later. Gallery videos are converted with `ffmpeg` when it is installed.

```bash
npm install
npm run dev            # http://localhost:5173/wintercamp/
npm run build          # writes dist/
npm test               # backend tests (apps-script/Code.gs against in-memory Google services)
```

To try the whole registration flow locally, use the mock backend. It runs the real `Code.gs`:

```bash
npm run mock-backend                                       # http://127.0.0.1:8787/exec
WC_APPS_SCRIPT_URL=http://127.0.0.1:8787/exec npm run dev
```

To run the end-to-end browser checks (needs Chrome; set `CHROME_PATH` if it is not at `/usr/bin/google-chrome`):

```bash
WC_APPS_SCRIPT_URL=http://127.0.0.1:8787/exec npm run build && npm run test:e2e
```

These checks cover:

- page layout at 360, 768, 1024 and 1440 widths
- axe WCAG 2.2 AA
- keyboard use and reduced motion
- the no-JavaScript fallback
- the Content Security Policy and third-party requests
- a full registration, the seats-full case, the last-seat case and a failed send with retry

Screenshots go to `test-results/`.

### How it fits together

- **Stack.** Vite, vanilla JavaScript, three.js (loaded on demand for the hero), GSAP with ScrollTrigger, Lenis and the Web Audio API. All dependencies are bundled and pinned, and fonts are self-hosted. The built site makes no third-party requests except to the Apps Script endpoint.
- **`scripts/render-pages.mjs`** pre-renders `/` and `/privacy/` with every word in the HTML, plus small `/bo/` pages that send old Tibetan links to English. It also writes:
  - structured data (two `Event`s, `Organization` and `FAQPage`)
  - a strict Content Security Policy
  - `robots.txt`, `sitemap.xml` and `llms.txt`

  These generated files are git-ignored.
- **`scripts/build-gallery.mjs`** reads `gallery/` and writes WebP sizes, H.264 videos with poster frames, and a manifest.
- **`src/js/`** holds the browser code:
  - `loader`, `hero` and `hero3d`
  - `music`: the background music, composed in code and rendered once into a seamless loop
  - `nav`, `carousel` and `lightbox`
  - `register`, `signature`, `image` and `api`
  - `audio` and `pointer`: cursor, magnetic buttons, tooltips and ripples
- **`apps-script/Code.gs`** is the backend.

### Notes

- **Content Security Policy.** GitHub Pages cannot set HTTP headers, so the policy is a `<meta>` tag. `frame-ancestors` (clickjacking protection) can only be set by a header, so it is not included.
- **Button text.** Labels on pink buttons are pure white (`#FFFFFF`) on `#D1146C` (5.2:1). The poster's brighter pink `#E61E7B` is only 4.3:1 with white, so it is kept for glows and large decoration.
- **Signature.** Parents draw a signature, or choose "Type your name instead" and type their full name, which is stored in the **Typed signature** column. Having the typed option means the form meets WCAG.
