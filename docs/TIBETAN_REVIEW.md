# Tibetan review

All Tibetan text on the site is in `src/i18n/bo.json`. It is a **draft written without a native speaker** and must be checked before the site is announced.

## How to review

1. Open the Tibetan page at <https://paulzhub.github.io/wintercamp/bo/>, and open `src/i18n/bo.json` next to the English file `src/i18n/en.json`. Each key matches.
2. Correct the text directly in `bo.json`, on GitHub (pencil icon) or in an editor. Keep the quotes, commas and `{curly}` placeholders exactly as they are: `{n}`, `{total}`, `{phone}`, `{name}`, `{category}`.
3. Commit to `main`. The site updates in a few minutes.
4. When the review is done, change the `"_review"` line at the top of `bo.json` to say who reviewed it and when.

## Please check especially

- **Camp name and theme.** We used དགུན་ཁའི་སྒར། for "Winter Camp" and འཇིག་རྟེན་གྱི་འོད། for "Light of the World".
- **Group names.** We used བྱིས་པ། for Kids and གཞོན་སྐྱེས། for Youth.
- **Dates.** We wrote them as `2027 ཕྱི་ཟླ་ 1 ཚེས་ 4`. Decide whether to keep Western digits (0 to 9) or use Tibetan digits (༠ to ༩) throughout.
- **The consent statement** (`reg.f.consentStatementLocal`). This is a translation of the legal wording. The original English statement is always shown beneath it, and it is the English that the parent signs.
- **Questions and answers** (`faq.items`) and the **privacy notice** (`privacy.sections`).
- **Round 4 additions:** the registration PDF labels (`reg.pdf`), the new success-screen text (`reg.done.download`, `preparing`, `downloaded`, `private`, `pdfError`, `shareText`), the loader's `loader.soundLabel`, the language question "སྐད་ཡིག་འདེམས།" on the loading screen, and the new last paragraph of the privacy section on what is stored on your device. If the loading-screen question changes, run `node scripts/subset-toggle-font.mjs` so the English page has its letters.

## Kept in English on purpose

These messages must read exactly as written, so they always appear in English, with a Tibetan line beside them:

- "Seats are full. Kindly contact +91-8219012669."
- "Oh No Someone booked the last seat just before you! Kindly contact +91-8219012669"
- the YES / NO choice and the "I have read and understood…" agreement

The venue address, the payee name and the UPI ID also stay in English.

## Gallery alt text

`gallery/captions.json` has English descriptions of each photo for screen readers. Tibetan descriptions can be added in each `"alt": { "bo": "" }`. Until they are, the Tibetan page uses the English description.
