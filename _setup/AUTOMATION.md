# Automating bookings with Zapier and HubSpot

The site already writes every enquiry into the Bookings tab. This turns that row into a CRM record and a sequence of messages, so the only thing you do by hand is decide whether to confirm.

## What the script now sends you

Every booking gets a reference like `ZX-260912-001` and a status. The status is set from the control room or from the dropdown in the sheet, and it is the trigger for everything below.

| Status | Meaning | Calendar |
| --- | --- | --- |
| enquiry | Came in from the site, not yet agreed | Dashed block |
| confirmed | You have agreed it with the customer | Solid block, dates held |
| cancelled | Called off by either side | Released |
| completed | Car returned, job done | Solid block, kept for history |
| no-show | Never collected | Released |

## What the script now sends itself

On HubSpot Starter, automated marketing emails are Professional-only, so the script sends the customer-facing mail directly and HubSpot holds the record. Fill in the settings block at the top of `apps-script.gs`:

```
var OFFICE_EMAIL = 'bookings@zarahexpress.com';   // your new-enquiry alert
var REPLY_TO     = 'bookings@zarahexpress.com';   // where replies land
var SEND_CONFIRMATIONS = true;                     // customer email on every enquiry
var SEND_STATUS_EMAILS = true;                     // and on confirmed / cancelled / completed
```

Mail is sent by the Google account that owns the sheet, which is why `REPLY_TO` matters if that account is not the address you want replies on. Run `testEmail` from the Apps Script editor once to see what the customer receives. Gmail sends 100 a day, Workspace 1 500 — both far above your volume.

The booking row now also carries **email**, **passengers** and **payStatus**, matching the deal properties you set up in HubSpot. Existing sheets get the three columns appended on the next enquiry; nothing is reordered or deleted.

## Connecting Zapier

Two routes. Pick one.

**Webhook, recommended.** In Zapier create a Zap with the trigger **Webhooks by Zapier → Catch Hook**. Copy the hook URL it gives you, open Apps Script, and paste it into this line near the top:

```
var ZAPIER_HOOK = 'https://hooks.zapier.com/hooks/catch/000000/abcdef/';
```

Save and redeploy the web app. Every new booking and every status change now posts immediately, carrying an `event` field of either `booking.created` or `booking.status`, plus the whole row.

**Google Sheets trigger, no code.** Trigger on **Google Sheets → New or Updated Spreadsheet Row**, worksheet Bookings. Simpler to set up, but it polls on a schedule rather than firing instantly, and it fires on every edit rather than only the ones you care about.

## Zap 1 — enquiry into HubSpot

Trigger: Catch Hook, filtered to `event` is `booking.created`.

1. **HubSpot → Find or Create Contact.** Match on `email`, which is now always present. Set first and last name from `name`, and phone from `phone`.
2. **HubSpot → Create Deal.**
   - Deal name: `{{ref}} — {{vehicle}}`
   - Amount: `total`
   - Pipeline stage: your equivalent of "enquiry"
   - Close date: `dateOut`
   - Associate with the contact from step 1
3. **HubSpot → Create Note** on the deal, holding the full detail: pickup, dropoff, dates, times, days, extras and notes. This keeps the deal clean while the specifics stay searchable.

The payload field names map onto the deal properties you already created:

| Deal property | Payload field |
| --- | --- |
| Booking reference | `ref` |
| Service type | `kind` |
| Service date | `dateOut` |
| Pickup | `pickup`, or `from` on a chauffeur job |
| Drop-off | `dropoff`, or `to` on a chauffeur job |
| Passengers | `passengers` |
| Amount | `total` |
| Payment status | `payStatus` |

Create a custom deal property called something like `zx_ref` and write the reference into it. Every later Zap finds the deal by that reference, which is what keeps the sheet and HubSpot from drifting apart.

## Zap 2 — WhatsApp, if you want it as well

The email confirmation is already handled by the script, so this Zap is now optional. If you want the same message on WhatsApp, use the same trigger with a **Delay For** of two minutes so your own reply has a chance to land first, then a WhatsApp Business API step.

Suggested copy, in your voice:

> Thanks {{name}}, we have your request for the {{vehicle}} from {{dateOut}} to {{dateIn}}. Your reference is {{ref}}. We reply within 30 minutes during office hours, Monday to Friday 8am to 6pm and Saturday 9am to 1pm.

## Zap 3 — status changes drive everything else

Trigger: Catch Hook, filtered to `event` is `booking.status`. Then a **Paths** step, one path per status.

On Starter the branching lives in Zapier rather than in a HubSpot workflow. That costs you nothing here — Zapier does the paths, HubSpot receives stage updates.

**confirmed** — move the HubSpot deal to your confirmed stage. The what-to-bring email is already sent by the script, so add only a **Schedule by Zapier** step for a reminder the day before `dateOut`.

**cancelled** — move the deal to closed lost. The acknowledgement email is sent by the script. If you had marked the car out, this is your prompt to set it back to available.

**completed** — move the deal to closed won. The script thanks the customer and asks for a review, so nothing further is needed here.

A fourth event, `booking.payment`, fires when you change `payStatus`. Route it to a HubSpot deal update if you want payment state visible in the pipeline.

**no-show** — closed lost with a reason, so your reporting can tell it apart from a cancellation.

## Zap 4 — the day-before reminder

If you would rather not nest a schedule inside Zap 3, run this separately. Trigger: **Schedule by Zapier**, every day at 4pm. Then **Google Sheets → Lookup Spreadsheet Rows** on Bookings, and filter to rows where status is confirmed and `dateOut` is tomorrow. Send the reminder with the pickup time and address.

## Where Claude fits

The plumbing above is deterministic and belongs in Zapier. Claude is worth adding where judgement or wording is involved:

**Drafting the quote reply.** Add a Claude step after Zap 1 that takes the booking details and drafts your reply, then have Zapier send it to you rather than the customer. You read it, adjust, send. Once the drafts stop needing edits you can consider sending directly.

**Summarising the week.** A Monday morning Zap that reads the Bookings tab and asks Claude for a short brief: which cars are out, what is unconfirmed, which enquiries went cold. Delivered to your inbox or WhatsApp.

**Reading free text.** The notes field is where customers say the useful things. Claude can pull out the ones that need action, such as a child seat, an invoice for a company, or an airport pickup at an odd hour, and flag them.

## Order to build in

1. Fill in the settings block and run `testEmail`. The customer stops waiting in silence, with no Zapier at all.
2. Zap 1, so HubSpot fills itself. Removes double entry immediately.
3. Zap 3 on the confirmed and cancelled paths only.
4. The reminder.
5. Claude drafting, once you know what your standard replies look like.

Each one is useful on its own, so there is no need to build them all before switching any on.

## Two things to watch

The webhook fires on status changes made anywhere, including a manual edit in the sheet — and so does the status email. That is deliberate, but it means an accidental edit can send a customer a message. Set `SEND_STATUS_EMAILS` to `false` if you would rather send those by hand, or take the status change Zap off webhooks and run it on a schedule so you have a window to correct mistakes.

Bookings are logged when the customer presses send in WhatsApp, which means some rows are people who never actually followed through. Treat `enquiry` as a lead rather than a booking, and let your HubSpot pipeline reflect that.
