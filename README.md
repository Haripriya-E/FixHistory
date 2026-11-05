# FixHistory - Digital Maintenance Passport

**Your Asset's Entire History. One Digital Passport.**

FixHistory is a full-stack web application (MongoDB, Express, React, Node.js) that keeps the complete
lifetime record of physical assets such as cars, bikes, laptops, phones, air conditioners, refrigerators,
washing machines and industrial equipment: purchase details, every service and repair, invoices, warranty,
reminders and ownership changes.

---

## Contents

1. [Project overview](#1-project-overview)
2. [Problem statement](#2-problem-statement)
3. [Objectives](#3-objectives)
4. [Key features](#4-key-features)
5. [Technology stack](#5-technology-stack)
6. [System architecture](#6-system-architecture)
7. [Folder structure](#7-folder-structure)
8. [Database collections and relationships](#8-database-collections-and-relationships)
9. [Installation on Windows (step by step)](#9-installation-on-windows-step-by-step)
10. [Running the application](#10-running-the-application)
11. [Demo data and demo login](#11-demo-data-and-demo-login)
12. [Demonstration walkthrough](#12-demonstration-walkthrough)
13. [API overview](#13-api-overview)
14. [Security](#14-security)
15. [Testing](#15-testing)
16. [Troubleshooting](#16-troubleshooting)
17. [Screenshots](#17-screenshots)
18. [Known limitations](#18-known-limitations)
19. [Future enhancements](#19-future-enhancements)

---

## 1. Project overview

Every registered asset gets a **Digital Maintenance Passport**: a single page with the asset's identity
(unique asset ID, brand, model, serial number), purchase and warranty details, current owner, total
maintenance cost, last and next service, and a chronological timeline of every service, repair,
inspection and part replacement with the attached invoice.

Owners see a dashboard built from their real records, receive in-app reminders before services and
warranty expiry, download PDF reports, share a privacy-controlled QR passport, and transfer an asset
(with its history) to a buyer using a one-time transfer code.

## 2. Problem statement

Over its lifetime an asset collects purchase bills, service reports, warranty cards and repair invoices.
These records are usually scattered across paper receipts, emails, WhatsApp messages, different service
providers and loose documents. As a result owners struggle to:

- see the complete maintenance history of an asset,
- know how much they have spent on repairs,
- remember when the next service is due,
- check whether the warranty is still valid,
- find an invoice when it is needed,
- prove the condition and history of an asset when selling it.

## 3. Objectives

1. Provide one centralised, chronological digital record (passport) for every asset.
2. Record maintenance and repairs with costs, parts, technicians, providers and invoices.
3. Calculate warranty status and service reminders automatically from stored dates.
4. Show spending and asset statistics calculated from real database records.
5. Allow secure transfer of an asset and its history to a new owner.
6. Allow controlled public sharing of a passport through a QR code without exposing private data.
7. Generate downloadable PDF reports.
8. Keep each user's data private with authentication, authorisation and validation.

## 4. Key features

| Module | What it does |
| --- | --- |
| Landing page | Product introduction, problem and solution, features, how it works, benefits |
| Authentication | Register, log in, log out, JWT in an HTTP-only cookie, protected routes, profile and password change |
| Dashboard | 6 summary cards and 4 charts from MongoDB, upcoming reminders, recent activity, quick actions |
| Asset management | Create, view, edit, delete, search, filter by category and warranty status, sort, grid and table views, photo upload |
| Digital passport | Asset identity, warranty, owner, totals, last/next service, chronological maintenance timeline with invoices |
| Maintenance | Full CRUD, invoice upload, search, filter by asset/type/date range, sort by date or cost, automatic totals |
| Warranty | Active / expiring soon / expired / no warranty, days remaining, calculated from dates |
| Reminders | Upcoming and overdue services, warranties ending soon, mark completed / dismiss / restore |
| Ownership transfer | One-time code, bound to the buyer's email, preview and confirmation, ownership history kept |
| QR passport | QR code per asset, owner-controlled public view, private data never exposed, link regeneration |
| Reports | Summary page, full PDF report, single-asset passport PDF |

## 5. Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, React Router 7, Axios, Recharts 3, Lucide React icons, plain CSS design system, IBM Plex fonts (bundled, works offline) |
| Backend | Node.js (20.19+ or 22 LTS), Express 5, REST API |
| Database | MongoDB 6/7/8 (local or Atlas) with Mongoose 8 |
| Security | bcryptjs, jsonwebtoken (HTTP-only cookie), Helmet, CORS, express-rate-limit, Zod validation |
| Files and documents | Multer (uploads), qrcode (QR codes), PDFKit (PDF reports) |
| Configuration | dotenv |
| Tooling | concurrently (runs both servers), Node's built-in test runner |

## 6. System architecture

```
 Browser (React SPA)                    Express API (Node.js)                         MongoDB
 ┌─────────────────────┐   /api/*    ┌──────────────────────────────────────────┐   ┌──────────────┐
 │ Pages & components   │ ─────────▶ │ helmet, cors, json, cookie-parser         │   │ users        │
 │ AuthContext (session)│  (cookie)  │ routes ─▶ auth / validate / upload        │──▶│ assets       │
 │ Axios service layer  │ ◀───────── │ controllers ─▶ services (stats, reminders,│   │ maintenance… │
 └─────────────────────┘    JSON     │   QR, PDF, reports) ─▶ Mongoose models    │   │ notifications│
        ▲  Vite dev proxy            │ central error handler                     │   └──────────────┘
        │  (localhost:5173 → :5000)  └──────────────────────────────────────────┘
        │                                         │ server/uploads (images, invoices; served only after auth)
```

- In development, Vite (port 5173) forwards every `/api` request to Express (port 5000), so the browser
  sees a single address and the login cookie works without cross-site problems.
- In production (`npm start`), Express serves the built React app and the API from port 5000.
- Details: [docs/architecture.md](docs/architecture.md).

## 7. Folder structure

```
FixHistory/
├── client/                     React frontend (Vite)
│   ├── public/                 favicon
│   ├── src/
│   │   ├── components/         reusable UI (ui/, layout/, assets/, maintenance/, passport/, charts/)
│   │   ├── context/            AuthContext (login state), ToastContext (messages)
│   │   ├── hooks/              useApi, useDebounce, useDocumentTitle
│   │   ├── layouts/            AppLayout (sidebar + top bar), AuthLayout
│   │   ├── pages/              one file per screen
│   │   ├── services/api.js     Axios instance and all API calls
│   │   ├── utils/              formatting helpers and constants
│   │   ├── App.jsx             routes
│   │   ├── main.jsx            entry point
│   │   └── index.css           design system (colours, typography, components, responsive rules)
│   ├── package.json
│   └── vite.config.js          dev server + /api proxy
├── server/                     Express backend
│   ├── config/                 environment variables, MongoDB connection
│   ├── controllers/            request handlers per module
│   ├── middleware/             auth, validation, uploads, rate limits, error handler
│   ├── models/                 Mongoose schemas (User, Asset, MaintenanceRecord, ...)
│   ├── routes/                 REST routes
│   ├── services/               business logic (stats, reminders, QR, PDF, reports)
│   ├── utils/                  helpers (dates, codes, errors, responses, constants)
│   ├── validators/             Zod request schemas
│   ├── scripts/seed.js         demo data
│   ├── tests/api.test.js       API integration tests
│   ├── uploads/                stored images and invoices (not public)
│   ├── app.js                  Express app
│   ├── server.js               starts the server
│   └── package.json
├── docs/                       architecture, database design, API documentation, testing, screenshots
├── scripts/setup-env.js        creates .env with a random JWT secret
├── .env.example                configuration template
├── .gitignore
├── package.json                root scripts (install, dev, seed, test, build, start)
└── README.md
```

## 8. Database collections and relationships

| Collection | Purpose | Key relationships |
| --- | --- | --- |
| `users` | Accounts (password stored as bcrypt hash) | - |
| `assets` | Asset passports, unique `assetId` (e.g. `FH-7KQ29XMR`), QR sharing settings | `currentOwner` → users, `registeredBy` → users |
| `maintenancerecords` | Services, repairs, inspections, invoices | `asset` → assets, `createdBy` → users |
| `ownershiphistories` | Permanent ownership log ("Registered", "Transferred") | `asset` → assets, `previousOwner`/`newOwner` → users |
| `transferrequests` | Pending/finished transfers, hashed one-time code, expiry | `asset` → assets, `currentOwner` → users |
| `notifications` | Service and warranty reminders, transfer messages | `user` → users, `asset` → assets |

```
users 1 ──── * assets (currentOwner) 1 ──── * maintenancerecords
                   │ 1
                   ├──── * ownershiphistories
                   ├──── * transferrequests
                   └──── * notifications * ──── 1 users
```

Access to an asset, its records and invoices is decided by `assets.currentOwner`, so after a transfer the
new owner sees the whole history and the previous owner loses access. Full field list, indexes and
validation rules: [docs/database-design.md](docs/database-design.md).

## 9. Installation on Windows (step by step)

### 9.1 Software requirements

| Software | Version | Download |
| --- | --- | --- |
| Node.js (includes npm) | **22 LTS** recommended (minimum 20.19) | https://nodejs.org |
| Visual Studio Code | latest | https://code.visualstudio.com |
| MongoDB | Community Server 7 or 8 **or** a free MongoDB Atlas cluster | https://www.mongodb.com/try/download/community / https://www.mongodb.com/atlas |
| MongoDB Compass (optional) | latest | to look at the data visually |
| Google Chrome / Edge | latest | |

Check Node.js after installing (open **Command Prompt**):

```bat
node -v
npm -v
```

`node -v` must print `v20.19.0` or newer (for example `v22.x.x`).

### 9.2 Open the project in VS Code

1. Extract `FixHistory_Project.zip`, for example to `C:\Projects\`. You now have `C:\Projects\FixHistory`.
2. Open VS Code → **File → Open Folder…** → select the `FixHistory` folder (the one that contains `README.md`).
3. Open a terminal: **Terminal → New Terminal**.
   If PowerShell shows *"running scripts is disabled on this system"*, click the **∨** next to **+** in the
   terminal panel and choose **Command Prompt**, or see [Troubleshooting](#16-troubleshooting).

### 9.3 Install all dependencies (one command)

In the terminal, inside the `FixHistory` folder:

```bat
npm install
```

This installs the root tool (`concurrently`) and then automatically runs `npm install` inside `server`
and `client`. It needs an internet connection and takes 1-3 minutes.

If you prefer to install them separately:

```bat
cd server
npm install
cd ..\client
npm install
cd ..
```

### 9.4 Set up MongoDB

Choose **one** option.

**Option A - Local MongoDB (works offline)**

1. Download *MongoDB Community Server* (Windows, MSI) and run the installer.
2. Choose **Complete** and keep **"Install MongoDB as a Service"** ticked. MongoDB then starts
   automatically with Windows.
3. Nothing else is needed. The default connection string in `.env` is
   `mongodb://127.0.0.1:27017/fixhistory`.

**Option B - MongoDB Atlas (cloud, free tier)**

1. Sign in at https://cloud.mongodb.com and create a free **M0** cluster.
2. **Database Access** → *Add New Database User* → choose a username and password
   (avoid special characters such as `@ : / ? #`, or URL-encode them).
3. **Network Access** → *Add IP Address* → *Add Current IP Address*
   (or `0.0.0.0/0` for a demonstration on different networks).
4. **Database → Connect → Drivers** → copy the connection string. It looks like
   `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
5. Replace `<password>` with your password and add the database name `fixhistory` after `.net/`:
   `mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/fixhistory?retryWrites=true&w=majority`
6. Put this value in `MONGODB_URI` in the `.env` file (next step).

### 9.5 Configure environment variables

From the `FixHistory` folder:

```bat
npm run setup
```

This creates `FixHistory\.env` from `.env.example` and fills `JWT_SECRET` with a random 96-character value.
(Manual alternative: `copy .env.example .env`, then replace `JWT_SECRET` with any long random text.)

Open `.env` in VS Code. The important settings:

| Variable | Meaning | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/fixhistory` |
| `JWT_SECRET` | Secret used to sign login tokens (32+ characters) | generated by `npm run setup` |
| `PORT` | API port | `5000` |
| `CLIENT_URL` | React app address (CORS) | `http://localhost:5173` |
| `PUBLIC_APP_URL` | Address put inside QR codes | `http://localhost:5173` |
| `JWT_EXPIRES_IN` | Login session length | `7d` |
| `MAX_UPLOAD_MB` | Max image / invoice size | `5` |
| `REMINDER_WINDOW_DAYS` | Days before a due date that reminders start | `30` |
| `TRANSFER_EXPIRY_HOURS` | How long a transfer code is valid | `72` |
| `COOKIE_SECURE` | `true` only when served over HTTPS | `false` |

`.env` contains secrets and is excluded from Git and from the ZIP. Only `.env.example` is shared.

### 9.6 Load the demo data (optional, recommended for a demo)

```bat
npm run seed
```

You will see the demo accounts and a **sample transfer code**. See [section 11](#11-demo-data-and-demo-login).

## 10. Running the application

### Option 1 - one command (recommended)

From the `FixHistory` folder:

```bat
npm run dev
```

This starts both servers in one terminal:

- `[server]` Express API on **http://localhost:5000** (restarts automatically when you edit server files)
- `[client]` React app on **http://localhost:5173** (reloads automatically)

Open **http://localhost:5173** in Chrome or Edge. Stop both with `Ctrl + C`.

### Option 2 - two terminals

Terminal 1 (backend):

```bat
cd server
npm run dev
```

Terminal 2 (frontend) - click **+** in the terminal panel to open a second terminal:

```bat
cd client
npm run dev
```

Then open **http://localhost:5173**.

### Option 3 - production build on one port

```bat
npm start
```

This builds the React app (`client\dist`) and starts Express in production mode, which serves both the
website and the API at **http://localhost:5000**.

### Useful commands (run from the `FixHistory` folder)

| Command | What it does |
| --- | --- |
| `npm install` | Install all dependencies (root, server, client) |
| `npm run setup` | Create `.env` with a random JWT secret |
| `npm run seed` | Reset and load the sample demo data |
| `npm run dev` | Start backend and frontend for development |
| `npm test` | Run the API integration tests (MongoDB must be running) |
| `npm run build` | Build the frontend for production |
| `npm start` | Build and run everything on http://localhost:5000 |

### Checking that the backend is running

Open http://localhost:5000/api/health - it should show `"status":"ok","database":"connected"`.

## 11. Demo data and demo login

`npm run seed` creates **sample data for demonstration only** (every sample asset shows a "Sample data"
badge and its description says so). Dates are calculated relative to today, so warranty states and
reminders always look realistic.

| Account | Email | Password | Purpose |
| --- | --- | --- | --- |
| Main demo user | `demo@fixhistory.test` | `Demo@12345` | Owns 8 sample assets with 21 service records |
| Demo buyer | `buyer@fixhistory.test` | `Demo@12345` | Receives the sample ownership transfer |
| Demo seller | `seller@fixhistory.test` | `Demo@12345` | Previous owner of the sample motorcycle |

The sample data contains vehicles, electronic devices, home appliances and industrial equipment;
active, expiring and expired warranties; overdue and upcoming services; sample PDF invoices; a public
QR passport (Honda City); and a pending transfer of the LG washing machine to the buyer. The transfer code
is printed in the terminal when you run the seed.

Running `npm run seed` again deletes **only** the demo accounts and sample assets and recreates them.
Accounts you register yourself are never touched. You can register your own account at any time and add
real records.

## 12. Demonstration walkthrough

A suggested 10-minute demo for the evaluation:

1. **Landing page** (http://localhost:5173) - explain the problem and the passport idea.
2. **Log in** with the demo account (the login page has a "Fill in demo login" button).
3. **Dashboard** - six cards and four charts calculated from MongoDB; upcoming and overdue reminders.
4. **Assets** - search "honda", filter by category or warranty status, switch to table view.
5. **Open the Honda City passport** - identity fields, machine-readable strip, timeline, invoices
   (click an attachment), warranty card, ownership history.
6. **Add a service record** from the passport (use the "+6 months" button for the next service date and
   attach a PDF). The timeline, totals, dashboard and reminders update immediately.
7. **Warranty** page - status tabs with days remaining.
8. **Reminders** - mark one completed, dismiss another, show the Completed tab.
9. **QR passport** - in the Honda City passport, open the public link in a private/incognito window: owner
   name, invoices, notes and technician names are hidden. Turn sharing off and refresh the public page.
10. **Ownership transfer** - log out, log in as `buyer@fixhistory.test`, open *Ownership Transfer*, enter the
    code printed by the seed script, review and accept. The washing machine now appears in the buyer's
    account with its full history and an ownership history entry.
11. **Reports** - download the full PDF report and a single-asset passport PDF.

## 13. API overview

All endpoints are under `/api` and return JSON:
`{ "success": true, "data": ... }` or `{ "success": false, "message": "...", "errors": [{ "field", "message" }] }`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/session`, `PUT /auth/profile`, `PUT /auth/password` |
| Assets | `GET /assets`, `POST /assets`, `GET /assets/options`, `GET /assets/:id`, `PUT /assets/:id`, `DELETE /assets/:id`, `GET /assets/:id/image` |
| QR and sharing | `GET /assets/:id/qr`, `PUT /assets/:id/sharing`, `POST /assets/:id/sharing/regenerate`, `GET /public/passport/:token`, `GET /public/passport/:token/image` |
| Maintenance | `GET /maintenance`, `POST /maintenance`, `GET /maintenance/:id`, `PUT /maintenance/:id`, `DELETE /maintenance/:id`, `GET /maintenance/:id/invoice` |
| Dashboard | `GET /dashboard/stats`, `GET /dashboard/charts`, `GET /dashboard/recent-activity` |
| Warranty | `GET /warranty` |
| Reminders | `GET /reminders`, `PUT /reminders/:id` |
| Transfers | `POST /transfers`, `POST /transfers/preview`, `POST /transfers/confirm`, `GET /transfers`, `PATCH /transfers/:id/cancel`, `PATCH /transfers/:id/reject` |
| Reports | `GET /reports/summary`, `GET /reports/pdf`, `GET /reports/pdf?asset=:id` |
| Health | `GET /health` |

Request/response examples and status codes: [docs/api-documentation.md](docs/api-documentation.md).

## 14. Security

- Passwords hashed with **bcrypt** (12 rounds); never returned by the API.
- Login token (JWT) stored in an **HTTP-only, SameSite=Lax cookie**, so page scripts cannot read it.
- Every protected request loads the user from the verified token; **user IDs sent by the client are never trusted**.
- Every asset, record, invoice and reminder query is filtered by the logged-in owner. Other users'
  items return **404**, so their existence is not revealed.
- **Zod** validation for every request body and query (types, lengths, enums, date rules); MongoDB
  operator keys (`$...`) are stripped from request bodies; search text is regex-escaped.
- **Uploads**: 5 MB limit, JPG/PNG/WEBP (images) and PDF/JPG/PNG/WEBP (invoices) only, file **content
  signature checked**, random file names, stored outside any public folder and served only after an
  ownership check.
- **Helmet** security headers and Content-Security-Policy; **CORS** limited to the app's own address.
- **Rate limiting** on login/registration, transfer-code checks and public passport links.
- Transfer codes are random, single-use, expire, are bound to the buyer's email and only an **HMAC** of
  the code is stored.
- The public QR passport never includes owner name/email, invoices, notes, technician names or the full
  serial number; the owner chooses which other sections are visible and can regenerate the link.
- No secrets in the source code: configuration comes from `.env` (excluded from Git and the ZIP).

## 15. Testing

| Test | Result in the development environment |
| --- | --- |
| Backend API integration tests (`npm test`, 49 tests against a real MongoDB 8.0 database) | All passed |
| Browser end-to-end check of the main flows (17 checks: register, validation, asset with photo, service record with invoice, reminders, dashboard totals, public QR view and privacy, transfer with wrong and correct code, edit, delete, PDF download, logout) | All passed |
| Frontend production build (`npm run build`) | Succeeds |
| Production mode (`npm start`, single port) | Verified |
| Seed script | Verified |
| Responsive layout at 390 px (phone), 1024 px and 1440 px | Checked visually, no horizontal overflow |
| PDF reports | Generated and checked visually |

The tests use a separate database (`fixhistory_test`) that is created and deleted automatically, so your
data is not affected. Details and a manual test checklist: [docs/testing.md](docs/testing.md).

The project was developed and tested on Linux with Node.js 22. Commands in this README are written for
Windows; Node.js, npm and MongoDB behave the same way on both systems.

## 16. Troubleshooting

| Problem | Solution |
| --- | --- |
| `'node' is not recognized` | Install Node.js 22 LTS, then close and reopen VS Code. |
| PowerShell: *running scripts is disabled on this system* | Use a **Command Prompt** terminal in VS Code, or run once in PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `FixHistory cannot start ... JWT_SECRET must be ...` | Run `npm run setup` in the `FixHistory` folder. |
| `connect ECONNREFUSED 127.0.0.1:27017` | Local MongoDB is not running. Press `Win + R`, type `services.msc`, find **MongoDB Server** and click **Start**. Or, in an Administrator Command Prompt: `net start MongoDB`. |
| `querySrv ENOTFOUND` or `Server selection timed out` (Atlas) | Check the cluster address in `MONGODB_URI`, your internet connection, and that your IP is listed under **Network Access** in Atlas. |
| `bad auth : authentication failed` (Atlas) | Wrong database username/password in `MONGODB_URI` (this is the database user, not your Atlas login). URL-encode special characters in the password. |
| The app opens but shows *Cannot reach the FixHistory server* | The backend is not running. Use `npm run dev` from the `FixHistory` folder, or start `server` in a second terminal. |
| `Port 5000 is already in use` / `Port 5173 is in use` | Close the other program, or find it with `netstat -ano | findstr :5000` and stop it with `taskkill /PID <number> /F`. You can also change `PORT` in `.env`. |
| `Cannot find module @rolldown/binding-win32-x64-msvc` (or another `win32` package) | In the `client` folder delete `node_modules` and `package-lock.json`, then run `npm install` again (known npm issue with optional platform packages). |
| `npm ERR! engine` / Vite error about Node version | Upgrade Node.js to 22 LTS. |
| Logged out immediately after logging in | Use the same address every time (http://localhost:5173) and make sure the browser allows cookies for localhost. |
| Demo login fails | Run `npm run seed` first. |
| Sample transfer code no longer works | Codes expire after 72 hours. Run `npm run seed` again for a new code. |
| Tests fail with a connection error | MongoDB must be running; the tests use `MONGODB_URI` from `.env`. |
| QR code does not open on a phone | `localhost` on a phone means the phone itself. See below. |

**Scanning QR codes with a phone (optional):** connect the phone and laptop to the same Wi-Fi, find the
laptop's IP address with `ipconfig` (IPv4 Address, e.g. `192.168.1.20`), set
`PUBLIC_APP_URL=http://192.168.1.20:5173` in `.env`, restart the backend, and start the frontend with
`npm run dev --prefix client -- --host` so that it is reachable from the network. Allow Node.js through the
Windows firewall for private networks if asked.

## 17. Screenshots

Screenshots below were taken from this project running with the seeded **sample data**.
To replace them with your own, save images in `docs/screenshots/` with the same file names.

| Screen | File |
| --- | --- |
| Landing page | ![Landing page](docs/screenshots/landing.png) |
| Dashboard | ![Dashboard](docs/screenshots/dashboard.png) |
| Assets | ![Assets](docs/screenshots/assets.png) |
| Asset passport | ![Asset passport](docs/screenshots/passport.png) |
| Maintenance records | ![Maintenance](docs/screenshots/maintenance.png) |
| Warranty | ![Warranty](docs/screenshots/warranty.png) |
| Reminders | ![Reminders](docs/screenshots/reminders.png) |
| Ownership transfer | ![Ownership transfer](docs/screenshots/transfers.png) |
| Reports | ![Reports](docs/screenshots/reports.png) |
| Public QR passport | ![Public passport](docs/screenshots/public-passport.png) |
| Mobile view | ![Mobile](docs/screenshots/mobile.png) |
| PDF report | ![PDF report](docs/screenshots/pdf-report.png) |

## 18. Known limitations

These are deliberate, documented limits of this version rather than unfinished screens:

- **No email or SMS.** Reminders and transfer messages appear inside the app (notification bell,
  Reminders page, dashboard). Nothing is sent outside the app, and the app never claims otherwise.
- **Transfer codes are shared by the owner** (in person, phone or chat) because no email service is
  configured. Codes are single-use, expire, and work only for the buyer's registered email.
- **Ownership transfer without database transactions.** The transfer uses atomic, conditional updates
  so it cannot complete twice. Multi-document transactions need a MongoDB replica set (Atlas has one) and
  can be added later.
- **Uploaded files are stored on the server's disk** (`server/uploads`). For cloud hosting, move them to
  object storage such as Amazon S3 or Cloudinary.
- **PDFs use the standard Helvetica font**, so amounts are shown as `INR 1,250` and non-Latin text (for
  example Tamil or Hindi) is replaced with `?` in PDFs. The web pages display all languages correctly.
- **Currency is Indian Rupees (INR).**

## 19. Future enhancements

- Email reminders with Nodemailer (SMTP) and SMS with a provider such as Twilio or MSG91, run daily by a
  scheduler (for example `node-cron`) that reuses `services/reminderService.js`.
- Email verification and "forgot password".
- Service-provider accounts that add verified records directly to a customer's passport.
- OCR to read amounts and dates from uploaded invoices.
- Multiple images and documents per asset; cloud file storage.
- Mileage / usage-hour based service schedules.
- Export to Excel/CSV; printable QR stickers.
- Progressive Web App with offline access; mobile app.
- Admin dashboard and audit log.
