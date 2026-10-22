Zarah Express control sheet — starter tabs

Five CSV files, one per tab.

1. sheets.google.com, Blank spreadsheet, name it Zarah Express Control.
2. File > Import > Upload, choose Fleet.csv.
   Import location: "Insert new sheet(s)". Click Import data.
   The new tab is named Fleet automatically.
3. Repeat for Chauffeur.csv, Discounts.csv, Blackouts.csv, Specials.csv.
4. Delete the empty "Sheet1" tab that Google made at the start.
5. Check the tab names read exactly: Fleet, Chauffeur, Discounts, Blackouts, Specials.
   If Google appended anything, rename them by double-clicking the tab.
6. Extensions > Apps Script, paste apps-script.gs, set your ADMIN_KEY, deploy as a
   Web app (Execute as Me, Access Anyone), copy the /exec URL.

Notes on the starter data

Fleet: deposit is deliberately blank so the site works it out per vehicle class and
adjusts for the insurance choice. Only fill it in for an exception.

Blackouts and Specials hold example rows with 2026 dates. Edit or clear them —
an empty tab simply means no blackouts and no promotion.

Bookings and Customers tabs are created for you on the first enquiry. Do not add
them by hand and do not rename their headers.
