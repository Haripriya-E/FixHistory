# FixHistory - Architecture

## 1. Overview

FixHistory is a three-tier MERN application:

| Tier | Technology | Responsibility |
| --- | --- | --- |
| Presentation | React 19 single-page app built with Vite | Screens, forms, client-side validation, charts, routing |
| Application | Node.js + Express 5 REST API | Authentication, authorisation, validation, business rules, files, QR codes, PDFs |
| Data | MongoDB via Mongoose 8 | Persistent storage of users, assets, records, ownership, transfers, notifications |

```
┌──────────────────────────── Browser ─────────────────────────────┐
│ React SPA                                                         │
│  pages/ ──▶ hooks/useApi ──▶ services/api.js (Axios, /api, cookie)│
│  context/AuthContext (who is logged in)   context/ToastContext    │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP JSON  (dev: Vite proxy :5173 → :5000)
┌───────────────────────────────▼──────────────────────────────────┐
│ Express app (server/app.js)                                        │
│  helmet → cors → json/urlencoded → cookie-parser → strip $-keys    │
│  routes/                                                          │
│    └─ middleware: protect | optionalAuth → rate limit → multer     │
│                   upload → file signature check → Zod validate     │
│  controllers/  (thin: read request, call services/models, respond) │
│  services/     (assetService, statsService, reminderService,       │
│                 reportService, pdfService, qrService)              │
│  models/       (Mongoose schemas, indexes)                         │
│  errorHandler  (every error → consistent JSON)                     │
└──────────────┬──────────────────────────────┬────────────────────┘
               │ Mongoose                      │ fs
        ┌──────▼──────┐                 ┌──────▼─────────────────┐
        │  MongoDB    │                 │ server/uploads/        │
        │  (local or  │                 │  assets/   invoices/   │
        │   Atlas)    │                 │ (served only via API)  │
        └─────────────┘                 └────────────────────────┘
```

## 2. Backend layers

| Folder | Role | Example |
| --- | --- | --- |
| `config/` | Load `.env`, validate configuration, connect to MongoDB | `env.js` refuses to start without a strong `JWT_SECRET` |
| `routes/` | Map URLs and HTTP methods to middleware and controllers | `router.post('/', uploadInvoice, validate({ body }), createRecord)` |
| `middleware/` | Cross-cutting concerns | `auth.js`, `validate.js`, `upload.js`, `rateLimiters.js`, `errorHandler.js` |
| `validators/` | Zod schemas describing valid input | dates in order, enums, lengths, numbers ≥ 0 |
| `controllers/` | Handle one request each | `assetController.getAsset` |
| `services/` | Reusable business logic | `reminderService.syncReminders`, `statsService.getDashboardStats` |
| `models/` | Data structure, constraints and indexes | `Asset`, `MaintenanceRecord` |
| `utils/` | Small helpers | `dates.js` (warranty status), `codes.js` (asset IDs, transfer codes) |

Express 5 forwards errors thrown inside `async` handlers to the error handler automatically, so
controllers simply `throw ApiError.notFound(...)`.

## 3. Frontend structure

| Folder | Role |
| --- | --- |
| `pages/` | One component per screen (Dashboard, Assets, AssetPassport, Maintenance, ...) |
| `components/ui/` | Generic building blocks: Modal, ConfirmDialog, Field, FileDrop, Switch, Pagination, StatCard, badges, empty/error/loading states |
| `components/layout/` | Sidebar, Topbar (search, notifications, user menu), route guards |
| `components/passport/` | Passport header (the "data page" with the machine-readable strip), QR sharing panel |
| `components/maintenance/` | Timeline |
| `components/charts/` | Recharts wrappers (bar, horizontal bar, donut) |
| `context/` | `AuthContext` (current user), `ToastContext` (messages) |
| `hooks/` | `useApi` (loading/error/data), `useDebounce`, `useDocumentTitle` |
| `services/api.js` | The only place that knows API URLs |
| `utils/` | Formatting (INR currency, dates in UTC, "Due in 5 days") and shared constants |

Routing (`App.jsx`): public routes (`/`, `/login`, `/register`, `/p/:token`) and protected routes inside
`AppLayout` (`/dashboard`, `/assets`, `/assets/:id`, `/maintenance`, `/warranty`, `/reminders`,
`/transfers`, `/reports`, `/profile`). App pages are lazy-loaded so the landing page loads quickly.

## 4. Authentication flow

```
Register / Login form
   │ POST /api/auth/login { email, password }
   ▼
Server: find user (+password), bcrypt.compare
   │ success → sign JWT { sub: userId } with JWT_SECRET (expires 7d)
   │ Set-Cookie: fh_token=<jwt>; HttpOnly; SameSite=Lax; Path=/
   ▼
Browser stores cookie (JavaScript cannot read it)
   │ every /api request sends the cookie automatically
   ▼
protect middleware: verify JWT → load user from DB → req.user
   │ invalid/expired → 401 → frontend clears user and shows the login page
```

- On page load the app calls `GET /api/auth/session`, which returns `{ user }` or `{ user: null }`.
- `ProtectedRoute` waits for that answer, then shows the page or redirects to `/login`
  (remembering the page the user wanted).
- Logout clears the cookie on the server.

## 5. Authorisation model

Ownership is the single source of truth: `Asset.currentOwner`.

- Assets are always queried with `{ _id, currentOwner: req.user._id }`.
- Maintenance records, invoices and reports first resolve the user's owned asset IDs, then query records
  for those assets only.
- Notifications are filtered by `user`.
- Anything not owned returns **404 Not Found** (not 403) so other users' IDs cannot be probed.
- The authenticated user always comes from the verified cookie, never from a user ID in the request.

Because access follows the asset, an ownership transfer automatically gives the new owner the entire
service history and removes the previous owner's access, without copying records.

## 6. Key workflows

### 6.1 Warranty status (calculated, never stored)

`utils/dates.js → getWarrantyInfo(expiry)`:

| Condition | Status |
| --- | --- |
| no expiry date | `none` (No warranty) |
| expiry before today | `expired` |
| 0 to 30 days left (`REMINDER_WINDOW_DAYS`) | `expiring` (still valid) |
| more than 30 days left | `active` |

The same rules exist as MongoDB filters (`warrantyStatusFilter`) for list filtering. "Active warranties"
on the dashboard counts every warranty that is still valid (active + expiring).

### 6.2 Reminders (generated from stored dates)

`services/reminderService.js → syncReminders(userId)` runs whenever reminders or dashboard activity are
requested:

1. For each owned asset, take the **latest** service record (newer records replace older advice).
   If its `nextServiceDate` is overdue or within 30 days, a `SERVICE_DUE` reminder should exist.
2. For each warranty that ends within 30 days, a `WARRANTY_EXPIRY` reminder should exist.
3. Each reminder has a stable key such as `service:<recordId>:<date>` and is **upserted**, so a
   reminder the user marked *Completed* or *Dismissed* keeps that status.
4. *Pending* reminders whose condition no longer applies (date edited, record deleted) are removed.

"Overdue by 12 days" / "Due in 5 days" is calculated at read time, so it is always current.
Email/SMS sending is not configured; the same function could be called by a daily scheduler that sends
messages for new reminders.

### 6.3 Ownership transfer

```
Current owner                         Server                                   New owner
─────────────                         ──────                                   ─────────
POST /transfers {asset, email}  ──▶  check ownership, not self,
                                     one pending per asset (unique partial index)
                                     code = 12 random chars (XXXX-XXXX-XXXX)
                                     store HMAC(code) + expiry (72 h)
                                ◀──  code shown ONCE
shares code in person/phone   ─────────────────────────────────────────────▶
                                                                    POST /transfers/preview {code}
                                     find by HMAC; must be Pending, not expired,
                                     addressed to this user's email      ──▶ asset summary
                                                                    POST /transfers/confirm {code}
                                     1. atomically set request Pending→Completed
                                     2. atomically move asset (only if sender still owns it)
                                        and switch public QR sharing off
                                     3. add OwnershipHistory "Transferred"
                                     4. clear old owner's reminders, notify both users
```

The sender can cancel and the recipient can decline while the transfer is pending. A used, cancelled,
declined or expired code never works again. Codes are rate-limited per user.

### 6.4 QR passport

- Every asset has an unguessable `publicPassport.token` (24 random bytes, base64url).
- `GET /api/assets/:id/qr` returns a PNG QR code (data URL) for `PUBLIC_APP_URL/p/<token>`.
- The public page calls `GET /api/public/passport/:token`. If sharing is off or the token is unknown, the
  same 404 message is returned.
- The owner chooses which sections are visible (photo, warranty, service history, service costs, purchase
  date/seller). Owner identity, invoices, notes, technician names, problem descriptions and the full serial
  number are **never** included.
- "New QR code" replaces the token so previously printed codes stop working.

### 6.5 Reports and PDFs

`services/reportService.js` gathers the data (assets, per-asset totals, monthly totals, warranty status,
spending by type, full history); `services/pdfService.js` draws an A4 PDF with PDFKit (header band, summary
boxes, paginated tables with repeated headers, monthly bar chart, page numbers). The single-asset PDF
includes the QR code when public sharing is on.

## 7. File uploads

1. Multer stores the file in `server/uploads/assets` or `server/uploads/invoices` with a random UUID name.
2. Size (5 MB) and declared type are checked by Multer; the **first bytes of the file** are then checked
   against the real JPEG/PNG/WEBP/PDF signature.
3. Only metadata (random name, original name, type, size) is saved in MongoDB; the random disk name is
   hidden from API responses.
4. Files are sent only through `GET /api/assets/:id/image` and `GET /api/maintenance/:id/invoice` after an
   ownership check (or the public image route when the owner allowed the photo).
5. Replacing or deleting an image, record or asset deletes the old file; a failed request deletes the file
   it uploaded.

## 8. Dates and time zones

Calendar dates (purchase, service, warranty) are stored as midnight UTC of that day and always displayed
in UTC, so "31 Oct 2026" never shows as "30 Oct" in India. "Today" is taken from the server's local calendar
date.

## 9. Error handling and responses

- Success: `{ "success": true, "message"?: "...", "data": ... }`
- Error: `{ "success": false, "message": "...", "errors"?: [{ "field": "...", "message": "..." }] }`
- `errorHandler.js` converts Zod, Mongoose, Multer, duplicate-key and JSON errors into the right status
  code (400, 401, 404, 409, 422) with a readable message; unexpected errors become 500 and are logged.
- The frontend shows field errors next to inputs, other errors in alerts or toasts, and every list has
  loading, empty and error states.

## 10. Configuration and environments

| Mode | Command | Ports |
| --- | --- | --- |
| Development | `npm run dev` | React on 5173 (Vite, hot reload) → proxy → API on 5000 (`node --watch`) |
| Production | `npm start` | Express serves `client/dist` and `/api` on 5000 |
| Test | `npm test` | In-process server on a random port, database `fixhistory_test` |

All settings come from `FixHistory/.env` (see `.env.example`).
