# Registration backend (Google Apps Script)

The website is static (GitHub Pages), so registrations go to this small Google Apps Script web app. It saves each registration as a row in a private Google Sheet. It saves signatures and payment screenshots to private Google Drive folders, never to GitHub.

It takes about 10 minutes, once, from the Google account that should own the registrations.

## 1. Create the sheet and paste the script

1. Go to [sheets.new](https://sheets.new) and name the sheet **Winter Camp 2027 registrations**.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete what is in `Code.gs`, then paste in the whole of [`Code.gs`](Code.gs) from this folder. Save.
4. Click the gear icon (**Project Settings**) and set the time zone to **(GMT+05:30) India Standard Time**.

## 2. Run setup once

1. In the editor's function menu choose **setup**, then click **Run**.
2. Google asks for permission. Choose your account. You may see **Google hasn't verified this app**: choose **Advanced → Go to (project name)**, then **Allow**. The script asks for your Sheets and Drive because it writes to them; it cannot read anything else of yours unless you share it.
3. When it finishes, the sheet has three tabs: **Kids registrations**, **Youth registrations** and **Paid, no seat**. Your Drive has these folders:

```
Winter Camp 2027/
  Kids/  Signatures/  Payment screenshots/  Registration PDFs/
  Youth/ Signatures/  Payment screenshots/  Registration PDFs/
```

## 3. Deploy it as a web app

1. Click **Deploy → New deployment**. Click the gear next to *Select type* and choose **Web app**.
2. Set **Execute as: Me**. Set **Who has access: Anyone**. "Anyone" is needed so parents can submit without a Google account. They can only send registrations and read the seat counts; they cannot see the sheet or the files.
3. Click **Deploy**. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.

## 4. Connect the website

1. In the repo, open `site.config.js` and paste the URL into `appsScriptUrl`.
2. Commit to `main`. The site rebuilds and deploys by itself in a few minutes.
3. Open the site and press **Register now**. Both groups should show **30 of 30 seats left**.

## 5. Test it, then clean up

Make one test registration with a real screenshot. Check that:

- a row appears in **Kids registrations** or **Youth registrations**, and
- the signature and screenshot links in that row open the files in your Drive.

Then delete the test row, and the test files in Drive, so the seat is freed. The seat count for each group is simply the number of rows in its tab.

## Updating from the first version (one "Registrations" tab)

1. In the Apps Script editor, replace all of `Code.gs` with the new [`Code.gs`](Code.gs) and save.
2. Click **Deploy → Manage deployments**, then the pencil icon. Set **Version** to **New version** and click **Deploy**. The web app URL stays the same.
3. Any rows already in the old **Registrations** tab are moved into **Kids registrations** and **Youth registrations** automatically the next time someone opens the registration view. Running **setup** once does the same straight away. The old tab is then renamed "Registrations (old, moved …)". You can delete it once you've checked the move.

## Day-to-day

- **Check payments.** The site cannot verify a UPI payment. Open each **Payment screenshot** link and compare it with your UPI app or bank statement. Families are asked to type their **Registration code** (an 8-character code, also in its own column) in the UPI payment note, and may give the 12-digit **UPI transaction reference** (UTR): search your UPI history for either. Then set **Payment check** on the row:
  - **Received**: the money arrived.
  - **Not received**: no matching payment. The seat goes back on the website straight away; call the family first.
  - **Refund due** / **Refunded**: for "Paid, no seat" rows and cancellations. **Refunded** also gives the seat back.
  - New rows start as **Not checked**.
- **Possible duplicate payment.** Filled in when a row's screenshot or UPI reference was already used on another row (for example "Same screenshot as Kids row 5 (Tenzin)"). Nothing is refused: one ₹1,000 payment for two siblings is fine. Check that the amount covers every child.
- **Summary tab.** Live totals per tab: rows, seats taken, payment checks, money expected and money received (₹500 × rows). It is made once; you can format or move it.
- **Seat holds.** When a family reaches the payment step, their seat is held for 5 minutes (they can hold it again, up to 15 minutes in all). Held seats count as taken, so the website can show a group as full for a few minutes. Holds are kept in the script's properties (**Project Settings → Script properties → holds**), not in the sheet; you never need to touch them.
- **Signatures.** Most parents draw a signature, which is saved as an image and linked in the **Signature** column. Anyone who can't draw one types their full name instead; it appears in the **Typed signature** column.
- **Registration PDFs.** After each registration the parent's phone draws the whole registration (every field, the signature, the payment details and the screenshot) as a PDF. They can download or share it, and a copy is saved to that group's **Registration PDFs** folder and linked in the **Registration PDF** column (the last column). If the column is empty for a row, the phone could not send the copy (for example it went offline straight after registering); everything is still in the row and its other links. The script only accepts a real PDF, once per registration, within 30 minutes of it.
- **Paid, no seat.** These people paid just after the last seat went. The website told them to contact the organisers for a refund (the one exception to the non-refundable fee). Refund them, or move their row into that group's tab if you add seats.
  - Rows with status **Paid, duplicate** are a second registration of a child already in that group, sent after paying. The family was told to call you with the screenshot. Usually a refund.
- **Fee non-refundable (agreed).** Every registration sent from round 6 on has **Yes** here: the parent ticked "I understand that the ₹500 registration fee is non-refundable" before paying. Older rows are blank.
- **Ages.** Kids are 11 and under on 11 Jan 2027; Youth are 11 and over on 4 Jan 2027, with no upper limit. 11-year-olds may choose either.
- **Free a seat.** Set **Payment check** to **Not received** or **Refunded**, or delete the row from that group's tab. The seat appears on the website straight away.
- **Change the number of seats or the dates.** Edit `CONFIG` at the top of `Code.gs`, and `site.config.js` in the repo. Keep the two the same. Then redeploy the script as below.
- **Updating the script.** After editing `Code.gs`, use **Deploy → Manage deployments → (pencil) → Version: New version → Deploy**. This keeps the same URL. A *New deployment* would make a new URL that you would have to paste into `site.config.js` again.

## Privacy

- Keep the sheet and the `Winter Camp 2027` folder shared with **named organisers only**, never "anyone with the link".
- The privacy notice on the site says registrations are deleted within 90 days of the end of camp. Put a reminder in your calendar for **13 April 2027**.

## What the script checks

The script checks everything again, because anyone can call the web app address directly:

- every field: length, allowed values, real dates, age on the camp's first day, 10-digit phone numbers, medical emergency consent YES, and a 12-digit UPI reference when given
- the screenshot: JPG, PNG or WebP only, recognised by its content rather than its name, and up to 5 MB
- the signature: a drawn PNG or a typed full name
- a lock, so two people can never take the last seat at the same moment
- spam protection: a hidden field, a minimum time to fill the form, and limits of 120 registrations a minute in all and 10 a minute per submission
- duplicates: the same child in the same group never takes a second seat. Before payment the family is told; after payment the submission is saved as "Paid, duplicate" so no payment is lost. A retried submission never takes a second seat
- seat holds: 5 minutes, counted as taken, at most 15 minutes per submission, kept under the same lock
- formulas: text beginning with `=`, `+`, `-` or `@` is stored as plain text, so it cannot run as a spreadsheet formula

The tests in `tests/backend.test.mjs` run this same `Code.gs` against stand-ins for the Google services (`npm test`).
