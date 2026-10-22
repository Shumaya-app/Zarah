/**
 * Zarah Express — control sheet backend.
 * Paste this into Extensions > Apps Script on your Google Sheet, then deploy as a
 * Web App (Execute as: Me, Who has access: Anyone). Copy the /exec URL.
 *
 * Required tabs, with these exact headers in row 1:
 *
 *   Fleet        id | name | available | day | deposit
 *   Chauffeur    id | cls | base | km | min | hr
 *   Discounts    days | off | label
 *   Blackouts    from | to | note
 *   Specials     title | body | from | to
 *   Bookings     (created automatically — do not edit the headers)
 *   Customers    (created automatically — do not edit the headers)
 */

var ADMIN_KEY = 'CHANGE-ME-TO-A-LONG-PHRASE';

/* ---------------------------------------------------------------------------
   SETTINGS — the four lines to fill in
   --------------------------------------------------------------------------- */

/* Zapier "Catch Hook" URL. Every new booking and every status change is posted
   to it as JSON. Leave blank to switch the HubSpot side off. */
var ZAPIER_HOOK = '';

/* Where your own new-enquiry alert goes. Comma-separate for several people. */
var OFFICE_EMAIL = 'bookings@zarahexpress.com';

/* What the customer sees as the sender, and where their reply lands.
   Mail is sent by the Google account that owns this sheet, so REPLY_TO matters
   if that account is not the address you want replies on. */
var FROM_NAME = 'Zarah Express';
var REPLY_TO = 'bookings@zarahexpress.com';

/* Switches. Turn either off while you are testing. */
var SEND_CONFIRMATIONS = true;   /* customer gets an email on every new enquiry */
var SEND_STATUS_EMAILS = true;   /* and on confirmed / cancelled / completed */

var OFFICE_HOURS = 'Monday to Friday 8am to 6pm, Saturday 9am to 1pm';
var OFFICE_PHONE = '+27 63 291 0989';
var SITE_URL = 'https://zarahexpress.com';

/* ------------------------------------------------------------------------- */

var STATUSES = ['enquiry', 'confirmed', 'cancelled', 'completed', 'no-show'];

var BOOKING_HEADERS = ['ref', 'received', 'status', 'kind', 'name', 'phone', 'email', 'vehicle',
  'journey', 'from', 'to', 'pickup', 'dropoff', 'dateOut', 'timeOut', 'dateIn', 'timeIn',
  'days', 'passengers', 'total', 'payStatus', 'extras', 'notes', 'statusChanged'];

var CUSTOMER_HEADERS = ['phone', 'name', 'email', 'firstSeen', 'lastSeen', 'enquiries'];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'config';
  if (action === 'bookings') {
    if ((e.parameter.key || '') !== ADMIN_KEY) return json({ error: 'unauthorised' });
    return json({
      bookings: rows('Bookings'),
      customers: rows('Customers'),
      fleet: rows('Fleet'),
      statuses: STATUSES
    });
  }
  return json({
    fleet: rows('Fleet'),
    chauffeur: rows('Chauffeur'),
    discounts: rows('Discounts'),
    blackouts: rows('Blackouts'),
    specials: rows('Specials'),
    updated: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);

    /* Writes from the control room. All of them need the passphrase. */
    if (b.action) {
      if ((b.key || '') !== ADMIN_KEY) return json({ error: 'unauthorised' });
      if (b.action === 'setStatus') return json(setStatus(b.ref, b.status));
      if (b.action === 'setAvailable') return json(setAvailable(b.id, b.available));
      if (b.action === 'setPayStatus') return json(setPayStatus(b.ref, b.payStatus));
      return json({ error: 'unknown action' });
    }

    /* A new enquiry from the site. */
    var sheet = bookingsTab();
    var ref = nextRef();
    var now = new Date();
    var row = {
      ref: ref, received: now, status: 'enquiry', kind: b.kind || '', name: b.name || '',
      phone: b.phone || '', email: String(b.email || '').trim(), vehicle: b.vehicle || '',
      journey: b.journey || '', from: b.from || '', to: b.to || '',
      pickup: b.pickup || '', dropoff: b.dropoff || '',
      dateOut: b.dateOut || '', timeOut: b.timeOut || '', dateIn: b.dateIn || '', timeIn: b.timeIn || '',
      days: b.days || '', passengers: b.passengers || '', total: b.total || '',
      payStatus: 'unpaid', extras: b.extras || '', notes: b.notes || '',
      statusChanged: now
    };
    appendByHeader(sheet, row);
    applyStatusRule(sheet);
    upsertCustomer(b);

    /* Email first, webhook second. A Zapier outage must not cost the customer
       their confirmation, and neither failure may lose the row. */
    if (SEND_CONFIRMATIONS) safely(function () { sendConfirmation(row); });
    safely(function () { sendOfficeAlert(row); });
    notify('booking.created', { ref: ref, status: 'enquiry' }, row);

    return json({ ok: true, ref: ref });
  } catch (err) {
    return json({ error: String(err) });
  }
}

/* --- bookings --- */

function bookingsTab() {
  var sheet = tab('Bookings', BOOKING_HEADERS);
  var head = headerRow(sheet);

  /* Sheets created before ref and status existed are migrated in place.
     Columns are inserted and backfilled; no existing row is touched. */
  if (head.indexOf('ref') < 0) {
    sheet.insertColumnsBefore(1, 1);
    sheet.getRange(1, 1).setValue('ref');
    var last = sheet.getLastRow();
    if (last > 1) {
      var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd');
      var refs = [];
      for (var i = 2; i <= last; i++) refs.push(['ZX-' + stamp + '-' + ('00' + (i - 1)).slice(-3)]);
      sheet.getRange(2, 1, refs.length, 1).setValues(refs);
    }
    head = headerRow(sheet);
  }

  if (head.indexOf('status') < 0) {
    var at = head.indexOf('received') >= 0 ? head.indexOf('received') + 2 : 2;
    sheet.insertColumnsBefore(at, 1);
    sheet.getRange(1, at).setValue('status');
    var rowsNow = sheet.getLastRow();
    if (rowsNow > 1) sheet.getRange(2, at, rowsNow - 1, 1).setValue('enquiry');
  }

  /* email, passengers, payStatus and anything added later are appended on the
     right, so the column order of an older sheet is left exactly as it is. */
  ensureHeaders(sheet, BOOKING_HEADERS);

  sheet.setFrozenRows(1);
  return sheet;
}

/* Appends any header in the list that the sheet does not already have. */
function ensureHeaders(sheet, headers) {
  var head = headerRow(sheet);
  var missing = [];
  for (var i = 0; i < headers.length; i++) {
    if (head.indexOf(headers[i]) < 0) missing.push(headers[i]);
  }
  if (!missing.length) return;
  var startCol = head.length + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
}

function headerRow(sheet) {
  var cols = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, cols).getValues()[0].map(function (h) { return String(h).trim(); });
}

/* Writes by column name, so a migrated sheet with its own column order still works. */
function appendByHeader(sheet, obj) {
  var head = headerRow(sheet);
  var row = head.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
}

/* ZX-YYMMDD-NNN, unique and readable. Used as the key for HubSpot and Zapier. */
function nextRef() {
  var sheet = bookingsTab();
  var n = Math.max(sheet.getLastRow() - 1, 0) + 1;
  var d = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd');
  return 'ZX-' + d + '-' + ('00' + n).slice(-3);
}

function setStatus(ref, status) {
  if (STATUSES.indexOf(status) < 0) return { error: 'bad status' };
  var sheet = bookingsTab();
  var data = sheet.getDataRange().getValues();
  var cRef = data[0].indexOf('ref') + 1;
  var cStatus = data[0].indexOf('status') + 1;
  var cChanged = data[0].indexOf('statusChanged') + 1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cRef - 1]) === String(ref)) {
      sheet.getRange(i + 1, cStatus).setValue(status);
      if (cChanged) sheet.getRange(i + 1, cChanged).setValue(new Date());
      var row = rowObject(data[0], data[i]);
      row.status = status;
      if (SEND_STATUS_EMAILS) safely(function () { sendStatusEmail(row); });
      notify('booking.status', { ref: ref, status: status }, row);
      return { ok: true, ref: ref, status: status };
    }
  }
  return { error: 'not found' };
}

function setPayStatus(ref, payStatus) {
  var sheet = bookingsTab();
  var data = sheet.getDataRange().getValues();
  var cRef = data[0].indexOf('ref') + 1;
  var cPay = data[0].indexOf('payStatus') + 1;
  if (!cPay) return { error: 'no payStatus column' };
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cRef - 1]) === String(ref)) {
      sheet.getRange(i + 1, cPay).setValue(payStatus || '');
      var row = rowObject(data[0], data[i]);
      row.payStatus = payStatus || '';
      notify('booking.payment', { ref: ref, payStatus: row.payStatus }, row);
      return { ok: true, ref: ref, payStatus: row.payStatus };
    }
  }
  return { error: 'not found' };
}

/* A dropdown on the status column, so the sheet is as safe to edit as the dashboard. */
function applyStatusRule(sheet) {
  var head = headerRow(sheet);
  var last = Math.max(sheet.getLastRow(), 2);
  var col = head.indexOf('status') + 1;
  if (col) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
    sheet.getRange(2, col, last - 1, 1).setDataValidation(rule);
  }
  var payCol = head.indexOf('payStatus') + 1;
  if (payCol) {
    var payRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['unpaid', 'deposit paid', 'paid', 'refunded'], true).build();
    sheet.getRange(2, payCol, last - 1, 1).setDataValidation(payRule);
  }
}

/* --- fleet --- */

function setAvailable(id, available) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Fleet');
  if (!sheet) return { error: 'no Fleet tab' };
  var data = sheet.getDataRange().getValues();
  var cId = data[0].indexOf('id');
  var cAv = data[0].indexOf('available');
  if (cId < 0 || cAv < 0) return { error: 'Fleet needs id and available columns' };
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cId]).trim() === String(id).trim()) {
      sheet.getRange(i + 1, cAv + 1).setValue(available ? 'yes' : 'no');
      return { ok: true, id: id, available: !!available };
    }
  }
  return { error: 'car not found' };
}

/* --- customers --- */

/* A customer is one row per phone number, with a running count. */
function upsertCustomer(b) {
  if (!b.phone) return;
  var sheet = tab('Customers', CUSTOMER_HEADERS);
  ensureHeaders(sheet, CUSTOMER_HEADERS);
  var head = headerRow(sheet);
  var data = sheet.getDataRange().getValues();
  var cPhone = head.indexOf('phone');
  var key = String(b.phone).replace(/\D/g, '');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cPhone]).replace(/\D/g, '') === key) {
      setCell(sheet, head, i + 1, 'name', b.name || data[i][head.indexOf('name')]);
      if (b.email) setCell(sheet, head, i + 1, 'email', String(b.email).trim());
      setCell(sheet, head, i + 1, 'lastSeen', new Date());
      setCell(sheet, head, i + 1, 'enquiries', Number(data[i][head.indexOf('enquiries')] || 0) + 1);
      return;
    }
  }
  appendByHeader(sheet, {
    phone: b.phone, name: b.name || '', email: String(b.email || '').trim(),
    firstSeen: new Date(), lastSeen: new Date(), enquiries: 1
  });
}

function setCell(sheet, head, row, name, value) {
  var col = head.indexOf(name) + 1;
  if (col) sheet.getRange(row, col).setValue(value);
}

/* --- email --- */

function sendConfirmation(r) {
  if (!r.email) return;
  var title = r.kind === 'chauffeur' ? 'We have your chauffeur request' : 'We have your rental request';
  var intro = 'Thank you, ' + firstName(r.name) + '. We have your request and it is with our team now. ' +
    'We reply within 30 minutes during office hours, ' + OFFICE_HOURS + '.';
  var body =
    para(intro) +
    refBox(r) +
    table(quoteRows(r)) +
    para('The figure above is an estimate on the details you gave us. It is not yet a confirmed ' +
      'booking — we will come back to you in writing to confirm the car and the price.') +
    para('If anything here is wrong, reply to this email or WhatsApp us on ' + OFFICE_PHONE + '.');
  MailApp.sendEmail({
    to: r.email,
    replyTo: REPLY_TO,
    name: FROM_NAME,
    subject: title + ' — ' + r.ref,
    htmlBody: shell(title, body),
    body: plainText(title, r)
  });
}

function sendStatusEmail(r) {
  if (!r.email) return;
  var s = String(r.status || '').toLowerCase();

  if (s === 'confirmed') {
    return MailApp.sendEmail({
      to: r.email, replyTo: REPLY_TO, name: FROM_NAME,
      subject: 'Confirmed — ' + r.ref,
      htmlBody: shell('Your booking is confirmed', 
        para('Good news, ' + firstName(r.name) + '. Your booking is confirmed.') +
        refBox(r) + table(quoteRows(r)) +
        para('<strong>Please have these ready at collection:</strong>') +
        list(['Original ID or passport',
          'Valid driver\'s licence, held at least two years',
          'The deposit, refundable on return of the car',
          'A card in your own name for the deposit hold']) +
        para('Any change of plan, tell us as early as you can and we will do what we can.')),
      body: 'Your booking ' + r.ref + ' is confirmed. Please bring your original ID or passport, ' +
        'your driver\'s licence, and the deposit.'
    });
  }

  if (s === 'cancelled') {
    return MailApp.sendEmail({
      to: r.email, replyTo: REPLY_TO, name: FROM_NAME,
      subject: 'Cancelled — ' + r.ref,
      htmlBody: shell('Booking cancelled',
        para('We have cancelled ' + r.ref + ' as requested. Nothing further is owed.') +
        para('When you need us again, we are here — ' + SITE_URL + '.')),
      body: 'We have cancelled ' + r.ref + '. Nothing further is owed.'
    });
  }

  if (s === 'completed') {
    return MailApp.sendEmail({
      to: r.email, replyTo: REPLY_TO, name: FROM_NAME,
      subject: 'Thank you — ' + r.ref,
      htmlBody: shell('Thank you for travelling with us',
        para('Thank you, ' + firstName(r.name) + '. ' + r.ref + ' is closed off on our side.') +
        para('If the car and the service were what you expected, a short review helps us more than ' +
          'anything else we could do. If they were not, tell us directly and we will put it right.')),
      body: 'Thank you. ' + r.ref + ' is complete.'
    });
  }
  /* no-show sends nothing. */
}

function sendOfficeAlert(r) {
  if (!OFFICE_EMAIL) return;
  MailApp.sendEmail({
    to: OFFICE_EMAIL,
    name: FROM_NAME,
    replyTo: r.email || REPLY_TO,
    subject: 'New ' + (r.kind || 'booking') + ' — ' + r.ref + ' — ' + (r.name || 'no name'),
    htmlBody: shell('New enquiry',
      refBox(r) +
      table([['Name', r.name], ['Mobile', r.phone], ['Email', r.email]].concat(quoteRows(r))) +
      (r.notes ? para('<strong>Notes:</strong> ' + esc(r.notes)) : '')),
    body: r.ref + ' — ' + r.name + ' — ' + r.phone + ' — ' + r.email
  });
}

/* --- email building blocks --- */

function quoteRows(r) {
  var out = [];
  if (r.kind) out.push(['Service', r.kind === 'chauffeur' ? 'Chauffeured' : 'Self-drive rental']);
  if (r.journey) out.push(['Journey', r.journey]);
  if (r.vehicle) out.push(['Vehicle', r.vehicle]);
  if (r.from || r.to) out.push(['Route', join(r.from, r.to, ' to ')]);
  if (r.pickup) out.push(['Collection', r.pickup]);
  if (r.dropoff) out.push(['Return', r.dropoff]);
  if (r.dateOut) out.push(['Date out', join(r.dateOut, r.timeOut, ' at ')]);
  if (r.dateIn) out.push(['Date back', join(r.dateIn, r.timeIn, ' at ')]);
  if (r.days) out.push(['Days', String(r.days)]);
  if (r.passengers) out.push(['Passengers', String(r.passengers)]);
  if (r.extras) out.push(['Extras', r.extras]);
  out.push(['Estimate', r.total ? money(r.total) : 'On request']);
  return out;
}

function shell(heading, inner) {
  return '<div style="margin:0;padding:0;background:#f4f1ec">' +
    '<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Georgia,\'Times New Roman\',serif;color:#171614">' +
    '<div style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#8a6220;margin-bottom:26px">Zarah Express</div>' +
    '<h1 style="margin:0 0 20px;font-size:25px;line-height:1.25;font-weight:400">' + esc(heading) + '</h1>' +
    inner +
    '<div style="margin-top:32px;padding-top:20px;border-top:1px solid #ddd8d0;font-size:12.5px;line-height:1.7;color:#6f6a63;font-family:Helvetica,Arial,sans-serif">' +
    'Zarah Express &middot; Sandton, Johannesburg<br>' +
    esc(OFFICE_PHONE) + ' &middot; ' + esc(REPLY_TO) + ' &middot; ' + esc(SITE_URL) + '<br>' +
    esc(OFFICE_HOURS) +
    '</div></div></div>';
}

function para(html) {
  return '<p style="margin:0 0 16px;font-size:15.5px;line-height:1.65;color:#2c2a26">' + html + '</p>';
}

function list(items) {
  var li = items.map(function (t) {
    return '<li style="margin-bottom:7px">' + esc(t) + '</li>';
  }).join('');
  return '<ul style="margin:0 0 18px;padding-left:20px;font-size:15px;line-height:1.6;color:#2c2a26">' + li + '</ul>';
}

function refBox(r) {
  return '<div style="margin:0 0 22px;padding:14px 16px;background:#ffffff;border-left:3px solid #8a6220">' +
    '<div style="font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:#8a6220">Your reference</div>' +
    '<div style="font-size:19px;letter-spacing:0.04em;margin-top:5px">' + esc(r.ref) + '</div>' +
    '<div style="font-size:12.5px;color:#6f6a63;margin-top:5px;font-family:Helvetica,Arial,sans-serif">' +
    'Quote this in any message to us.</div></div>';
}

function table(pairs) {
  var body = pairs.filter(function (p) { return p[1] !== '' && p[1] !== undefined && p[1] !== null; })
    .map(function (p) {
      return '<tr>' +
        '<td style="padding:9px 14px 9px 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#8a6220;vertical-align:top;white-space:nowrap;font-family:Helvetica,Arial,sans-serif">' + esc(p[0]) + '</td>' +
        '<td style="padding:9px 0;font-size:15px;color:#171614;border-bottom:1px solid #e6e2db">' + esc(p[1]) + '</td>' +
        '</tr>';
    }).join('');
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 22px">' + body + '</table>';
}

function plainText(title, r) {
  var lines = [title, '', 'Reference: ' + r.ref, ''];
  quoteRows(r).forEach(function (p) { if (p[1]) lines.push(p[0] + ': ' + p[1]); });
  lines.push('', OFFICE_PHONE + ' · ' + REPLY_TO, OFFICE_HOURS);
  return lines.join('\n');
}

function money(n) {
  var v = Number(String(n).replace(/[^\d.]/g, ''));
  if (!v) return String(n);
  return 'R' + Math.round(v).toLocaleString('en-US').split(',').join(' ');
}

function join(a, b, sep) {
  a = a ? String(a) : ''; b = b ? String(b) : '';
  return a && b ? a + sep + b : (a || b);
}

function firstName(n) {
  return String(n || '').trim().split(/\s+/)[0] || 'there';
}

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}

/* --- outbound --- */

/* The payload Zapier receives. Field names map to HubSpot deal properties:
     ref        -> booking reference
     kind       -> service type
     dateOut    -> service date
     pickup/from-> pickup
     dropoff/to -> drop-off
     passengers -> passengers
     total      -> amount
     payStatus  -> payment status                                            */
function notify(event, meta, payload) {
  if (!ZAPIER_HOOK) return;
  var body = { event: event };
  for (var k in meta) body[k] = meta[k];
  for (var p in payload) if (body[p] === undefined) body[p] = payload[p];
  /* HubSpot matches the contact on email, so make sure it is always present. */
  if (body.email === undefined) body.email = '';
  try {
    UrlFetchApp.fetch(ZAPIER_HOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (err) { /* never let a webhook failure lose a booking */ }
}

/* Runs a side effect and swallows its failure, so a mail quota or a bad address
   can never stop the booking row being written. */
function safely(fn) {
  try { fn(); } catch (err) { Logger.log('side effect failed: ' + err); }
}

/* --- helpers --- */

function rows(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var head = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i].join('') === '') continue;
    out.push(rowObject(head, data[i]));
  }
  return out;
}

function rowObject(head, row) {
  var o = {};
  for (var j = 0; j < head.length; j++) {
    var h = String(head[j]).trim();
    if (!h) continue;
    var v = row[j];
    if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (h === 'available') v = !(String(v).toLowerCase() === 'no' || String(v).toLowerCase() === 'false' || v === false);
    o[h] = v;
  }
  if (o.status !== undefined) o.status = String(o.status || 'enquiry').toLowerCase().trim();
  return o;
}

function tab(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* --- run once, from the editor, to check your mail setup --- */

function testEmail() {
  sendConfirmation({
    ref: 'ZX-TEST-001', kind: 'chauffeur', name: 'Test Customer', email: REPLY_TO,
    phone: '082 000 0000', vehicle: 'Mercedes-Benz E-Class E220d', journey: 'Airport transfer',
    from: 'OR Tambo International', to: 'Sandton', dateOut: '2026-10-02', timeOut: '14:30',
    days: 1, passengers: 2, total: 1450, extras: 'Meet and greet'
  });
}
