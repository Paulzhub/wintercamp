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
3. When it finishes, the sheet has two tabs, **Registrations** and **Paid, no seat**. Your Drive has these folders:

```
Winter Camp 2027/
  Kids/  Signatures/  Payment screenshots/
  Youth/ Signatures/  Payment screenshots/
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

- a row appears in **Registrations**, and
- the signature and screenshot links in that row open the files in your Drive.

Then delete the test row, and the two test files in Drive, so the seat is freed. The seat count is simply the number of rows in **Registrations** for each group.

## Day-to-day

- **Check payments.** The site cannot verify a UPI payment. Open each **Payment screenshot** link and compare it with your UPI app.
- **Paid, no seat.** These people paid just after the last seat went. Call them to refund, or move their row into **Registrations** if you add seats.
- **Free a seat.** Delete the row from **Registrations**. The seat appears on the website straight away.
- **Change the number of seats or the dates.** Edit `CONFIG` at the top of `Code.gs`, and `site.config.js` in the repo. Keep the two the same. Then redeploy the script as below.
- **Updating the script.** After editing `Code.gs`, use **Deploy → Manage deployments → (pencil) → Version: New version → Deploy**. This keeps the same URL. A *New deployment* would make a new URL that you would have to paste into `site.config.js` again.

## Privacy

- Keep the sheet and the `Winter Camp 2027` folder shared with **named organisers only**, never "anyone with the link".
- The privacy notice on the site says registrations are deleted within 90 days of the end of camp. Put a reminder in your calendar for **13 April 2027**.

## What the script checks

The script checks everything again, because anyone can call the web app address directly:

- every field: length, allowed values, real dates, age on the camp's first day, and phone format
- the screenshot: JPG, PNG or WebP only, recognised by its content rather than its name, and up to 5 MB; the signature must be a PNG
- a lock, so two people can never take the last seat at the same moment
- spam protection: a hidden field, a minimum time to fill the form, and a limit of 30 registrations per minute
- duplicates: the same child in the same group is refused, and a retried submission never takes a second seat
- formulas: text beginning with `=`, `+`, `-` or `@` is stored as plain text, so it cannot run as a spreadsheet formula

The tests in `tests/backend.test.mjs` run this same `Code.gs` against stand-ins for the Google services (`npm test`).
