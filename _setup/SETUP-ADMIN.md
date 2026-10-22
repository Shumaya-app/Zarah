# Control sheet setup

Twenty minutes, once. After this you run the site from a spreadsheet.

## 1. Make the sheet

New Google Sheet, name it **Zarah Express Control**. Create five tabs with these exact headers in row 1.

**Fleet**

| id | name | available | day | deposit |
| --- | --- | --- | --- | --- |
| c200 | Mercedes-Benz C200 | yes | 1650 | |
| 3ser | BMW 3 Series | yes | 1650 | |
| x3 | BMW X3 | yes | 2300 | |
| e220 | Mercedes-Benz E-Class E220d | yes | 3200 | |
| vclass | Mercedes-Benz V-Class V300d | yes | 6500 | |
| 7ser | BMW 750Li | yes | 8000 | |
| cayenne | Porsche Cayenne GTS | yes | 10000 | |
| maybach | Mercedes-Maybach S-Class | yes | | |

The `id` values must match exactly — that's how the site finds each car. Set `available` to `no` and the car still appears on the site, marked "Out on rental", with Select replaced by Enquire. Leave `deposit` blank and the site works it out from the vehicle class, which is what you want in most cases:

| Class | With insurance | Without |
| --- | --- | --- |
| Day rate up to R1 700 | R3 000 | R4 500 |
| up to R2 500 | R4 000 | R6 000 |
| up to R4 000 | R5 000 | R7 500 |
| up to R7 000 | R8 000 | R12 000 |
| above that | R10 000 | R15 000 |

Filling in `deposit` pins that car to one fixed figure and switches off the insurance adjustment, so only use it for an exception.

**Chauffeur**

| id | cls | base | km | min | hr | day |
| --- | --- | --- | --- | --- | --- | --- |
| c200 | Executive sedan | 190 | 16 | 500 | 100 | 2450 |
| 3ser | Executive sedan | 190 | 16 | 500 | 100 | 2450 |
| x3 | Executive SUV | 220 | 18 | 550 | 100 | 3100 |
| e220 | Luxury sedan | 250 | 20 | 600 | 100 | 4000 |
| vclass | Luxury van | 300 | 27 | 750 | 100 | 7300 |
| 7ser | First class sedan | 400 | 34 | 950 | 100 | 8800 |

`base` is the dispatch fee, `km` the per-kilometre rate, `min` the minimum fare, `hr` the overtime rate per hour. `day` is the ten-hour chauffeured day. Set it to the self-drive day rate + R800 driver. Fuel is charged at the end (full tank out, full tank back). The driver add-on for self-drive is a flat R800 a day.

**Discounts**

| days | off | label |
| --- | --- | --- |
| 14 | 5 | 2 weeks |
| 21 | 15 | 3 weeks |
| 28 | 30 | 4 weeks or longer |

**Blackouts**

| from | to | note |
| --- | --- | --- |
| 2026-12-20 | 2027-01-05 | Fully booked over the festive period. Message us and we will look for an alternative. |

The note appears in the search panel when a customer picks overlapping dates.

**Specials**

| title | body | from | to |
| --- | --- | --- | --- |
| Three days, pay for two | On any sedan collected before the end of the month. | 2026-09-01 | 2026-09-30 |

The first special whose dates cover today shows on the home page. Leave the tab empty for none.

Bookings and Customers tabs are created for you on the first enquiry. Don't rename their headers.

The Bookings tab carries a **ref** (like ZX-260912-001), a **status** with a dropdown (enquiry, confirmed, cancelled, completed, no-show), an **email**, **passengers**, and a **payStatus** dropdown (unpaid, deposit paid, paid, refunded). Every booking starts as enquiry. Only confirmed and completed hold their dates on the calendar, so cancelling releases the car. You can set the status from the dropdown in the sheet or from the control room, and either way it writes to the same cell.

If you already have a Bookings tab from before this change, the script adds any missing columns on the next enquiry and fills in the ones it can. Existing columns are never reordered or deleted.

## 1a. Turn on the emails

In `apps-script.gs`, fill in the settings block near the top — `OFFICE_EMAIL` for your own new-enquiry alert, `REPLY_TO` for where customer replies land. Then run `testEmail` from the editor once and check what arrives. Set `SEND_CONFIRMATIONS` or `SEND_STATUS_EMAILS` to `false` to switch either off while you test.

Mail is sent by the Google account that owns the sheet, so if that is not `bookings@zarahexpress.com` the `REPLY_TO` is what keeps replies going to the right place.

## 2. Add the script

In the sheet: **Extensions → Apps Script**. Delete what's there, paste the contents of `apps-script.gs`, and change this line to a long phrase of your own:

```
var ADMIN_KEY = 'CHANGE-ME-TO-A-LONG-PHRASE';
```

Save. Then **Deploy → New deployment → Web app**:

- Description: anything
- Execute as: **Me**
- Who has access: **Anyone**

Authorise when asked — Google will warn you about your own script, which is expected. Copy the **Web app URL**, ending in `/exec`.

"Anyone" sounds alarming but only exposes what the script chooses to return. Rates and availability are public anyway. Bookings and customers require your passphrase.

## 3. Point the site at it

Open `index.html` in a text editor, find:

```
sheetApiUrl
```

and set its default to your `/exec` URL. Or open the site in the design tool and paste it into the Tweaks panel, which rewrites the file for you.

Upload `index.html`, `admin.html` and the rest to the repo.

## 4. Check it

- Change a day rate in the sheet, reload the site — the new rate shows.
- Set a car to `no`, reload — it reads "Out on rental".
- Send a test enquiry — a row appears in Bookings, and in Customers.
- Check the email arrives, both to the customer address and to `OFFICE_EMAIL`.
- Set that booking to confirmed — the what-to-bring email goes out.
- Open `zarahexpress.com/admin.html`, paste the `/exec` URL and your passphrase.

## Staff access

Share the sheet with them in Google, as Editor. For the dashboard, give them the URL and passphrase. Both are held on their own device.

## What to know

The site keeps its own copy of every rate. If the sheet is unreachable the site still works on those built-in figures, so a Google outage or a broken formula can't take your prices down — it just means edits stop flowing until it recovers.

Bookings are logged as the customer presses Send on WhatsApp. If they change their mind in WhatsApp and never send, the enquiry is still logged. Treat Bookings as enquiries, not confirmed rentals.

The calendar draws on pick-up and return dates, so a chauffeur job shows as a single day.
