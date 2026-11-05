# FixHistory - REST API Documentation

Base URL: `http://localhost:5000/api` (in development the React app reaches it through `http://localhost:5173/api`).

## Conventions

**Authentication.** Log in with `POST /auth/login`; the server sets an HTTP-only cookie named `fh_token`.
Browsers send it automatically. In Postman or Thunder Client the cookie is stored after the login request.
Routes marked **Auth** return `401` without a valid cookie.

**Success response**

```json
{ "success": true, "message": "Asset added.", "data": { } }
```

**Error response**

```json
{
  "success": false,
  "message": "Please correct the highlighted fields.",
  "errors": [{ "field": "warrantyExpiry", "message": "Warranty expiry must be on or after the warranty start date" }]
}
```

**Status codes**

| Code | Meaning |
| --- | --- |
| 200 | OK |
| 201 | Created |
| 400 | Bad request (bad file, malformed JSON) |
| 401 | Not logged in / session expired / wrong password |
| 404 | Not found **or not yours** (other users' items are never revealed) |
| 409 | Conflict (email already registered, transfer already pending) |
| 422 | Validation failed (see `errors`) |
| 429 | Too many attempts (rate limit) |
| 500 | Unexpected server error |

**Dates** are sent as `YYYY-MM-DD` and returned as ISO strings (midnight UTC).
**File uploads** use `multipart/form-data`; other bodies use JSON.

---

## Health

### `GET /health`
```json
{ "success": true, "data": { "status": "ok", "database": "connected", "time": "2026-10-31T13:02:29.962Z" } }
```

---

## Authentication

### `POST /auth/register`
Body (JSON): `name` (2-60), `email`, `password` (8-72 chars, at least one letter and one number).
Response `201` with `{ user }` and the login cookie. `409` if the email exists.

```json
{ "name": "Priya Raman", "email": "priya@example.com", "password": "Secret123" }
```

### `POST /auth/login`
Body: `email`, `password`. Response `200` `{ user }` + cookie. `401` "Incorrect email or password." Rate limited (30 per 15 min per IP).

### `POST /auth/logout`
Clears the cookie.

### `GET /auth/me` - Auth
Returns `{ user: { _id, name, email, isDemo, createdAt } }`.

### `GET /auth/session`
Same as `/me` but returns `200 { user: null }` when not logged in (used by the React app on page load).

### `PUT /auth/profile` - Auth
Body: `{ "name": "New Name" }`.

### `PUT /auth/password` - Auth
Body: `{ "currentPassword": "...", "newPassword": "..." }`. `422` if the current password is wrong.

---

## Assets

### `GET /assets` - Auth
Query parameters:

| Name | Values | Default |
| --- | --- | --- |
| `search` | text matched against name, brand, model, asset ID, serial number | |
| `category` | `Vehicle`, `Electronic Device`, `Home Appliance`, `Industrial Equipment`, `Other` | all |
| `warranty` | `active`, `expiring`, `expired`, `none` | all |
| `sort` | `newest`, `oldest`, `name`, `purchaseDate`, `price_desc`, `price_asc` | `newest` |
| `page`, `limit` | numbers (limit 1-100) | 1, 12 |

Response:

```json
{
  "success": true,
  "data": {
    "items": [{
      "_id": "6ae5e73e00300ccb19eb1d9a",
      "assetId": "FH-8JW5EUHD",
      "name": "Honda City ZX",
      "category": "Vehicle",
      "brand": "Honda",
      "hasImage": false,
      "warranty": { "status": "active", "label": "Active", "remainingDays": 335 },
      "maintenance": { "recordCount": 5, "totalCost": 23960, "lastServiceDate": "2026-05-14T00:00:00.000Z", "nextServiceDate": "2026-11-10T00:00:00.000Z" }
    }],
    "pagination": { "page": 1, "limit": 12, "total": 8, "pages": 1 }
  }
}
```

### `GET /assets/options` - Auth
Short list `[{ _id, name, assetId, category, brand, model }]` for drop-down menus.

### `POST /assets` - Auth (multipart/form-data)

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | max 100 |
| `category` | yes | see list above |
| `brand`, `model`, `serialNumber`, `seller`, `description` | no | |
| `purchaseDate` | no | not in the future |
| `purchasePrice` | no | number ≥ 0 |
| `warrantyStart`, `warrantyExpiry` | no | expiry ≥ start; expiry required if start given |
| `image` | no | JPG/PNG/WEBP, max 5 MB |

Response `201` with the asset, including the generated `assetId`.

### `GET /assets/:id` - Auth
Full passport:

```json
{
  "asset": { "...": "asset fields", "currentOwner": { "_id": "...", "name": "Arjun Mehta (Demo)", "email": "demo@fixhistory.test" },
             "warranty": { "status": "active", "label": "Active", "remainingDays": 335 },
             "maintenance": { "recordCount": 5, "totalCost": 23960, "lastServiceDate": "...", "nextServiceDate": "..." } },
  "records": [{ "_id": "...", "serviceDate": "...", "serviceType": "Part Replacement", "workPerformed": "...",
                "replacedParts": ["Front brake pads"], "cost": 9640, "hasInvoice": true,
                "invoice": { "originalName": "invoice.pdf", "mimeType": "application/pdf", "size": 2210 } }],
  "ownershipHistory": [{ "transferStatus": "Registered", "newOwnerName": "Arjun Mehta (Demo)", "transferDate": "..." }],
  "pendingTransfer": null
}
```

### `PUT /assets/:id` - Auth (multipart/form-data)
Same fields as create. **Replaces all editable fields** (an empty optional field clears it).
Extra field `removeImage=true` deletes the current photo. A new `image` replaces it.

### `DELETE /assets/:id` - Auth
Deletes the asset with its records, ownership history, transfers, notifications and files.

### `GET /assets/:id/image` - Auth
Returns the image file (owner only).

---

## QR code and public passport

### `GET /assets/:id/qr` - Auth
```json
{ "url": "http://localhost:5173/p/xUrK5FKBkTbwRdV3C8mXAN7VfgN_Rwws",
  "qrDataUrl": "data:image/png;base64,iVBORw0...",
  "settings": { "enabled": true, "showImage": true, "showPurchaseInfo": false, "showWarranty": true,
                "showServiceHistory": true, "showServiceCosts": false } }
```
`GET /assets/:id/qr?download=1` returns the QR as a PNG file.

### `PUT /assets/:id/sharing` - Auth
Body (all booleans required): `enabled`, `showImage`, `showPurchaseInfo`, `showWarranty`, `showServiceHistory`, `showServiceCosts`.

### `POST /assets/:id/sharing/regenerate` - Auth
Creates a new token; old QR codes stop working. Returns the new `url` and `qrDataUrl`.

### `GET /public/passport/:token` - Public
Returns only what the owner allowed. Never includes owner name/email, invoices, notes, technician names,
problem descriptions or the full serial number. `404` "This passport is private or the link is no longer
valid." when sharing is off or the token is unknown. If the viewer is the logged-in owner,
`viewer.isOwner` is `true`.

```json
{ "assetId": "FH-8JW5EUHD", "name": "Honda City ZX", "category": "Vehicle", "brand": "Honda",
  "model": "City ZX i-VTEC CVT", "serialMasked": "********4578", "ownerCount": 1, "hasImage": false,
  "sections": { "purchase": false, "warranty": true, "serviceHistory": true, "serviceCosts": false },
  "warranty": { "status": "active", "remainingDays": 335, "warrantyStart": "...", "warrantyExpiry": "..." },
  "serviceSummary": { "recordCount": 5, "lastServiceDate": "..." },
  "serviceHistory": [{ "serviceDate": "...", "serviceType": "Repair", "workPerformed": "...",
                       "replacedParts": ["Power window switch"], "serviceProvider": "..." }],
  "viewer": { "isOwner": false, "assetObjectId": null } }
```

### `GET /public/passport/:token/image` - Public
The photo, only when sharing and "Asset photo" are on.

---

## Maintenance records

### `GET /maintenance` - Auth

| Query | Values | Default |
| --- | --- | --- |
| `search` | text in work performed, problem, provider, technician, parts or asset name | |
| `asset` | asset `_id` (must be yours) | all |
| `serviceType` | one of the six service types | all |
| `from`, `to` | `YYYY-MM-DD` (service date range) | |
| `sort` | `date_desc`, `date_asc`, `cost_desc`, `cost_asc` | `date_desc` |
| `page`, `limit` | numbers (limit 1-100) | 1, 20 |

Response: `{ items, pagination, summary: { count, totalCost } }` where `summary` covers all matching records.

### `POST /maintenance` - Auth (multipart/form-data)

| Field | Required | Notes |
| --- | --- | --- |
| `asset` | yes | `_id` of an asset you own |
| `serviceDate` | yes | not in the future |
| `serviceType` | yes | `Regular Maintenance`, `Repair`, `Inspection`, `Part Replacement`, `Emergency Service`, `Other` |
| `workPerformed` | yes | max 2000 |
| `problemDescription`, `technician`, `serviceProvider`, `notes` | no | |
| `replacedParts` | no | comma-separated text, e.g. `Oil filter, Air filter` |
| `cost` | no | number ≥ 0 (default 0) |
| `nextServiceDate` | no | after `serviceDate`; creates reminders |
| `invoice` | no | PDF/JPG/PNG/WEBP, max 5 MB |

### `GET /maintenance/:id` - Auth
### `PUT /maintenance/:id` - Auth (multipart/form-data)
Same fields as create; replaces all editable fields. `removeInvoice=true` deletes the invoice.
### `DELETE /maintenance/:id` - Auth
### `GET /maintenance/:id/invoice` - Auth
Opens the invoice inline; add `?download=1` to download.

---

## Dashboard

### `GET /dashboard/stats` - Auth
```json
{ "totalAssets": 8, "totalRecords": 21, "totalExpenses": 63379,
  "upcomingServices": 3, "overdueServices": 1,
  "activeWarranties": 5, "expiringWarranties": 1, "expiredWarranties": 3, "noWarranty": 0,
  "reminderWindowDays": 30 }
```
`activeWarranties` counts every warranty that is still valid (including the ones expiring soon).

### `GET /dashboard/charts` - Auth
```json
{ "monthlyExpenses": [{ "year": 2026, "month": 10, "label": "Oct 2026", "total": 499, "count": 1 }],
  "assetsByCategory": [{ "category": "Vehicle", "count": 2 }],
  "recordsByType": [{ "type": "Repair", "count": 5, "total": 7780 }],
  "warrantyStatus": [{ "status": "active", "label": "Active", "count": 4 }] }
```
`monthlyExpenses` always contains 12 months (months without spending have `total: 0`).

### `GET /dashboard/recent-activity` - Auth
`{ recentAssets (5), recentRecords (6), reminders (6 pending, soonest first) }`.

---

## Warranty

### `GET /warranty` - Auth
Query: `status` (`active`, `expiring`, `expired`, `none`), `search`.
Response: `{ items: [{ name, assetId, warrantyStart, warrantyExpiry, warranty: { status, label, remainingDays } }], counts: { active, expiring, expired, none }, windowDays: 30 }`.

---

## Reminders

### `GET /reminders` - Auth
Refreshes reminders from stored dates, then returns them.
Query: `status` = `Pending` (default), `Completed`, `Dismissed` or `all`; `type` = `SERVICE_DUE`, `WARRANTY_EXPIRY`, `TRANSFER`.

```json
{ "items": [{ "_id": "...", "type": "SERVICE_DUE", "title": "Service due for Royal Enfield Classic 350",
              "message": "The regular maintenance on 02 Apr 2026 recommended the next service on 19 Oct 2026.",
              "reminderDate": "2026-10-19T00:00:00.000Z", "status": "Pending",
              "daysUntil": -12, "isOverdue": true, "asset": { "_id": "...", "name": "Royal Enfield Classic 350" } }],
  "counts": { "pending": 5, "overdue": 1, "upcomingServices": 3, "warranty": 1, "transfers": 0 } }
```

### `PUT /reminders/:id` - Auth
Body: `{ "status": "Completed" | "Dismissed" | "Pending" }`.

---

## Ownership transfers

### `POST /transfers` - Auth (current owner)
Body: `{ "asset": "<assetObjectId>", "newOwnerEmail": "buyer@example.com", "message": "optional" }`.
Response `201`:
```json
{ "transfer": { "_id": "...", "status": "Pending", "newOwnerEmail": "buyer@example.com", "expiresAt": "..." },
  "code": "4KXQ-92MT-HZ7P",
  "recipientHasAccount": true }
```
The code is returned **only once**. `409` if a transfer for this asset is already pending; `422` when transferring to yourself.

### `POST /transfers/preview` - Auth (new owner)
Body: `{ "code": "4KXQ-92MT-HZ7P" }` (spaces, dashes and lower case are accepted).
Returns asset summary, sender name, message and expiry. No changes are made.
`422` if the code is wrong, expired, used, or addressed to another email. Rate limited (15 per 15 min per user).

### `POST /transfers/confirm` - Auth (new owner)
Body: `{ "code": "..." }`. Moves the asset and its full history to the caller, records ownership history,
turns public QR sharing off, and notifies both users. Response `{ asset: { _id, assetId, name } }`.

### `GET /transfers` - Auth
`{ outgoing: [...transfers you started], incoming: [...transfers addressed to your email] }`.

### `PATCH /transfers/:id/cancel` - Auth (sender, while pending)
### `PATCH /transfers/:id/reject` - Auth (recipient, while pending)

---

## Reports

### `GET /reports/summary` - Auth
`{ generatedAt, owner, totals, warranty, assets, assetExpenses, monthlyExpenses, byType, maintenance }`.

### `GET /reports/pdf` - Auth
Downloads the full PDF report (summary, asset register, asset-wise expenses, monthly expenses, spending
by type, warranty status, maintenance history).

### `GET /reports/pdf?asset=<id>` - Auth
Downloads the passport PDF of one asset (details, QR code if shared, summary, ownership history, timeline).

---

## Trying the API with Postman / Thunder Client

1. `POST http://localhost:5000/api/auth/login` with JSON body
   `{ "email": "demo@fixhistory.test", "password": "Demo@12345" }` (after `npm run seed`).
2. The cookie is saved automatically. Now call, for example, `GET http://localhost:5000/api/dashboard/stats`.
3. For uploads choose **Body → form-data**, set the file field type to **File**.
