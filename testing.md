# FixHistory - Testing

## 1. Automated API tests

File: `server/tests/api.test.js` (Node.js built-in test runner, no extra libraries).

Run from the `FixHistory` folder (MongoDB must be running):

```bat
npm test
```

The tests start the Express app in the same process on a random port and use a separate database named
`fixhistory_test`, which is deleted before and after the run. Uploaded test files are removed afterwards.
Your normal `fixhistory` data is not touched.

### What is covered (49 tests)

| Area | Checks |
| --- | --- |
| Health and authentication | health endpoint reports DB connection; registration validation; HTTP-only cookie; password never returned; duplicate email `409`; wrong password `401`; session endpoint; protected routes `401` without login |
| Assets | create with image; unique `FH-` asset ID; warranty status from dates (active, expiring, expired); fake image rejected by content check; unsupported file type rejected; required fields; date order rules; search; category filter; warranty filter; pagination; PUT clears emptied fields; image served only to owner |
| Authorisation | another user gets `404` for read, edit, delete, QR, image, records and invoices of someone else's asset; lists never include other users' data |
| Maintenance | create with PDF invoice; parts list parsing; disk file name hidden; future service date rejected; next service before service date rejected; filters (type, date range, asset, search including asset name); sorting by cost; total cost; invoice download; passport totals and next service date from latest record |
| Dashboard | totals, expenses, upcoming/overdue services, active/expiring/expired/no warranty counts; 12-month chart adds up; category and type breakdown |
| Warranty | status per asset; status filter |
| Reminders | generated from next service dates and warranty expiry; overdue days; completed status persists after refresh; other users cannot change reminders; editing a record replaces its reminder; invoice kept when editing without a new file |
| QR / public passport | QR data URL; private until enabled; public data hides full serial, owner name/email, notes, technician, invoices, purchase info and costs when disabled; owner detection; regenerating the link invalidates the old one |
| Ownership transfer | cannot transfer to yourself or someone else's asset; one-time code format; hash never returned; only one pending transfer per asset; recipient notification; wrong code, wrong account and sender cannot confirm; preview accepts lowercase and spaces without changing ownership; confirm moves asset and full history, previous owner loses access, history shows Registered → Transferred, public sharing reset; used code rejected; cancel and decline |
| Reports | summary totals; full PDF; single-asset PDF only for the owner |
| Deletion and logout | record and asset deletion update statistics; logout ends the session; unknown routes return JSON `404` |

Result in the development environment (MongoDB 8.0.23, Node.js 22): **49 passed, 0 failed**.

## 2. Browser end-to-end check

During development the main user journeys were also driven through a real Chrome browser (Playwright)
against the running app. This script is not part of the project because it needs extra tools, but the
journey can be repeated manually with the checklist below. All 17 checks passed:

1. Registration form shows client-side validation, then registers and opens the empty dashboard.
2. Asset form shows required-field errors, then creates an asset with a photo and opens its passport.
3. Service record with a PDF invoice appears in the passport timeline with the correct cost.
4. A reminder appears ("Due in 7 days") and can be marked completed.
5. Dashboard cards show the new totals.
6. Public QR passport opens without login and hides owner, technician and invoice; turning sharing off hides it.
7. Demo owner creates a transfer code; a wrong code is rejected; the correct code (typed in lower case) shows a preview; acceptance requires the confirmation checkbox; the asset moves with its history and ownership log.
8. Sender sees the transfer as Completed.
9. Asset edit and delete (with confirmation dialog).
10. Full PDF report downloads.
11. Logout blocks access to app pages.

Layouts were checked at 390 px (phone), 1024 px (tablet) and 1440 px (desktop) on every page with no
horizontal overflow. The production build (`npm start`) was checked with Helmet's Content-Security-Policy
and showed no browser console errors.

## 3. Manual test checklist (for the demonstration)

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open http://localhost:5173 | Landing page |
| 2 | Register with a short password | "Password must be at least 8 characters" |
| 3 | Register correctly | Dashboard with "Add your first asset" |
| 4 | Add asset with warranty expiry before start | Field error on warranty expiry |
| 5 | Add asset correctly with a photo | Passport with `FH-XXXXXXXX` ID and photo |
| 6 | Add service record with next service in 10 days | Timeline entry; reminder "Due in 10 days"; dashboard totals change |
| 7 | Upload a `.txt` renamed to `.pdf` as invoice | "The uploaded file is damaged or is not the type it claims to be." |
| 8 | Copy a passport URL, log in as another user, open it | "Asset not found." |
| 9 | Turn on public passport, open the link in a private window | Limited public view without owner details |
| 10 | Create a transfer code, accept it as the buyer | Asset moves; ownership history shows both owners |
| 11 | Use the same code again | "This transfer is no longer open" |
| 12 | Download full report and passport PDF | PDFs open with correct data |
| 13 | Log out and open /dashboard | Redirected to login |
