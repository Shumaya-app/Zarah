Zarah Express — what goes where

UPLOAD TO GITHUB (everything outside this _setup folder)

  index.html                     home, the two cards
  rent/index.html                self-drive flow, copy, FAQ
  chauffeur/index.html           chauffeur flow and copy
  fleet/index.html               fleet and rates
  airport-transfers/index.html   O.R. Tambo and Lanseria
  admin.html                     control room
  404.html  privacy.html
  CNAME  robots.txt  sitemap.xml
  favicon.png  apple-touch-icon.png  og-image.png

  Keep the folder structure. The four folders are what make
  zarahexpress.com/rent, /chauffeur, /fleet and /airport-transfers work.

DO NOT UPLOAD THIS _setup FOLDER

  sheet-tabs/           five CSVs, import one per tab into a new Google Sheet
  apps-script.gs        paste into Extensions > Apps Script, then deploy
  SETUP-ADMIN.md        tab structure, deploy steps, what each column does
  AUTOMATION.md         Zapier and HubSpot setup, four Zaps, where Claude fits

ORDER

  1. Make the Google Sheet, import the five tabs from sheet-tabs/.
  2. Paste apps-script.gs, set ADMIN_KEY to your own phrase, deploy as a
     Web app (Execute as Me, Access Anyone). Copy the /exec URL.
  3. Send me the /exec URL and I will put it into the site files.
  4. Upload everything outside _setup to the repo.
  5. Open zarahexpress.com/admin.html, paste the /exec URL and your passphrase.

  The site works before step 3 on its built-in rates. What it cannot do
  until then is record enquiries, which is why the control room is empty.

WHAT THE SHEET HOLDS

  Fleet        id, name, available, day, deposit
               Availability and day rates. Leave deposit blank so the
               class tiers apply and adjust for the insurance choice.
  Chauffeur    id, cls, base, km, min, hr
               Per-kilometre and hourly rates by vehicle class.
  Discounts    days, off, label
               Long-rental percentages.
  Blackouts    from, to, note
               Dates nothing can be booked, with the message shown.
  Specials     title, body, from, to
               Promotion on the home page, first live row wins.
  Bookings     created for you on the first enquiry
               ref, received, status, then the booking detail.
  Customers    created for you on the first enquiry
               One row per phone number, with a running count.
