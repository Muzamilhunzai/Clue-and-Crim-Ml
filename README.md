# TraceNet — Crime & Clue Relationship Database

A complete, locally running crime-investigation management system built for the **Advanced Database Systems Lab** at SZABIST Islamabad (instructor: Mr. Adeel Ahmed).

**Team:** Muzamil Hussain (241337) · Azeem Khan (2412351) · Rayyan Asim (2412366)

TraceNet is a real three-tier application, not a mock-up: a React front end, a Node/Express REST API and a persistent SQLite relational database. Everything on screen is read from, and written to, that database.

> All data in the demo seed is **fictional**. Names, case numbers and addresses are invented for the lab.

---

## What it does

| Area | What you can do |
| --- | --- |
| **Cases** | Create, edit, close (with a resolution), archive and restore cases; assign a lead and supporting investigators; add notes. Board view (4 status columns, drag to move) and table view. |
| **People** | Suspects, victims and witnesses, each linked to cases through junction tables that carry their own details (involvement status, statement summary, harm summary). |
| **Evidence** | Evidence items with an **append-only chain of custody**. Each transfer must continue the chain; history cannot be edited or deleted. |
| **Clues & locations** | Clues with source, confidence and review status; locations that clues, evidence and cases can point to. |
| **Relationship Engine** | An interactive graph built from real database rows. Follow a link between any two records, find the shortest connection between two records, and see which records appear in more than one case. |
| **Dashboard & search** | Case board, weekly activity chart, clearance-rate gauge, KPI counters, and full-text search across every record type (press `/`). |
| **Access control** | Three roles — Chief Investigator, Investigator, Evidence Officer — enforced on the **server**, plus field-level masking of sensitive contact details. |
| **ADBMS Lab** | A chief-only page that runs live transaction, constraint, trigger and isolation demonstrations, shows query plans and explores the schema. |

### Wording you will see in the app

A line in the graph is a **recorded association** — an investigative lead entered by a person, with a source and a confidence level. It is not a finding of fact and it is not produced by any "AI". Suspects are never labelled guilty; the only status values are *person of interest*, *under investigation*, *questioned*, *cleared* and *charged*.

---

## Requirements

* **Node.js 20.19 or newer** (22 LTS recommended) — check with `node -v`
* **npm 10+** (ships with Node)
* A modern browser (Chrome, Edge, Firefox, Safari)
* Nothing else. SQLite is embedded; there is no database server to install, no cloud account and no paid API.

`better-sqlite3` ships pre-built binaries for Windows, macOS and Linux. If `npm install` ever tries to compile it and fails on Windows, install the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) ("Desktop development with C++") and run `npm install` again.

---

## Quick start (Windows + VS Code)

1. Install Node.js LTS from <https://nodejs.org> and restart VS Code.
2. Open the `tracenet` folder in VS Code (**File → Open Folder**).
3. Open a terminal (**Terminal → New Terminal**, PowerShell is fine) and run:

   ```powershell
   npm run setup
   ```

   This installs all dependencies, creates a `.env` file from `.env.example` and builds a fresh, seeded database at `database/data/tracenet.db`.

4. Start both servers:

   ```powershell
   npm run dev
   ```

5. Open **<http://localhost:5173>** and sign in with one of the demo accounts below.

The API runs on port 4000 and the Vite dev server on port 5173; the dev server proxies `/api` to the API, so no CORS configuration is needed.

### Demo accounts

All demo accounts share one password, set by `DEMO_PASSWORD` in `.env` (default **`TraceNet@2026`**). With `DEMO_MODE=true` the login page shows one-click buttons for each of them.

| Username | Name | Role | Good for demonstrating |
| --- | --- | --- | --- |
| `chief` | Hamza Qureshi | Chief Investigator | Everything: assignment, archive, investigators, activity log, ADBMS Lab |
| `sana` | Sana Iqbal | Investigator | Case work on assigned cases only |
| `bilal` | Bilal Ahmed | Investigator | Case work, relationship graph |
| `omar` | Omar Siddiqui | Investigator | Cyber & financial case |
| `ayesha` | Ayesha Raza | Investigator | Violent-crime case |
| `mariam` | Mariam Farooq | Evidence Officer | Custody transfers; cannot see sensitive personal details or edit cases |

(`kamran` is a deactivated account, used to show that inactive users cannot sign in or be assigned.)

> **Demo password is for the lab only.** The server refuses to start if `DEMO_MODE=true` is combined with `NODE_ENV=production`. Passwords are stored only as bcrypt hashes; hashes are never sent to the browser.

---

## Scripts

Run from the project root.

| Command | What it does |
| --- | --- |
| `npm run setup` | Install dependencies, create `.env` if missing, rebuild the seeded database |
| `npm run dev` | Start API (port 4000, auto-restart) and web app (port 5173) together |
| `npm run build` | Type-check and build the client (`client/dist`) and compile the server (`server/dist`) |
| `npm start` | Run the compiled server; if `client/dist` exists it also serves the web app on **<http://localhost:4000>** |
| `npm test` | Run the 84 server tests (API, RBAC, constraints, triggers, transactions, graph engine) |
| `npm run typecheck` | TypeScript check for both workspaces |
| `npm run db:migrate` | Apply pending migrations only |
| `npm run db:seed` | Migrate and add the demo data and accounts |
| `npm run db:reset` | **Delete** the database file and recreate it from migrations + seed |
| `npm run db:schema` | Regenerate `database/schema.sql` from the migrations |
| `npm run env:init` | Create `.env` from `.env.example` if it does not exist |

### Run as a single production-style server

```powershell
npm run build
npm start
```

Then browse to <http://localhost:4000>. With `NODE_ENV=production` set, put `DEMO_MODE=false` in `.env` and create accounts through the chief's *Investigators* page (or re-seed deliberately); the seed accounts are for demonstration only.

### Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `DATABASE_PATH` | `database/data/tracenet.db` | SQLite file (relative to the project root) |
| `SESSION_TTL_HOURS` | `12` | Absolute session lifetime |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Extra origin allowed to call the API |
| `DEMO_PASSWORD` | `TraceNet@2026` | Password given to seeded demo accounts |
| `DEMO_MODE` | `true` (in `.env.example`) | Shows demo account buttons on the login page |

---

## A suggested 10-minute walkthrough

1. **Sign in as `chief`.** Point out the dashboard: activity chart (hatched = last week, solid = this week), clearance gauge, KPIs, and the four-column board.
2. **Drag a case card** from *Open* to *Investigating*. Drag one to *Closed* — the resolution dialog appears because a closed case must have a resolution (a database `CHECK`, not just a form rule).
3. **Open a case** → tabs for people, evidence, clues, notes and activity.
4. **Open evidence** → *Chain of custody*. Transfer it to another user. Try to transfer it "from" someone else through the API and watch the trigger refuse.
5. **Relationship graph** → pick a case, change the hop depth, tick *Highlight records in 2+ cases*, then use **Find connection** between two suspects.
6. **Sign out, sign in as `mariam`** (Evidence Officer): contact details are masked, case editing is unavailable, custody transfer works.
7. **Sign in as `chief` again → ADBMS Lab.** Run the six demonstrations; open *Query plans* and compare an indexed lookup with a full scan.

The instructor-oriented script is in [`docs/adbms-demonstrations.md`](docs/adbms-demonstrations.md).

---

## Project structure

```
tracenet/
├─ package.json            npm workspaces + root scripts
├─ .env.example            configuration template
├─ scripts/ensure-env.cjs  creates .env on first setup
├─ database/
│  ├─ migrations/          001 schema · 002 triggers & views · 003 FTS5 search · 004 relationship rules
│  ├─ schema.sql           generated, human-readable full schema
│  ├─ seed.sql             fictional demo data (SQL)
│  └─ data/                tracenet.db lives here (git-ignored)
├─ server/                 Node + Express + TypeScript
│  ├─ src/routes/          URL → handler wiring (thin controllers)
│  ├─ src/services/        business rules, validation (zod), transactions, audit
│  ├─ src/repositories/    all SQL, parameterised
│  ├─ src/middleware/      sessions, CSRF defence, RBAC, error handler
│  ├─ src/domain/          enums, entity registry, permission matrix
│  └─ tests/               84 tests (vitest + supertest)
├─ client/                 React + Vite + TypeScript + Tailwind
│  └─ src/
│     ├─ pages/            Dashboard, Cases, CaseDetail, Graph, entity lists/details, Lab …
│     ├─ components/       ui primitives, board, stats band, graph canvas, custody timeline …
│     ├─ lib/ hooks/       API client, formatting, entity metadata, auth/toast/query hooks
│     └─ layouts/          sidebar shell
└─ docs/                   ER diagram, API reference, ADBMS demonstrations
```

*Design note:* the server separates **routes → services → repositories**. The "controller" role is deliberately folded into the thin route files, because each handler is a single call into a service.

### Technology

* **Front end:** React 19, Vite 7, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query, Lucide icons. Charts are hand-written SVG/CSS. The graph uses `d3-force` only to compute node coordinates; drawing, pan, zoom and selection are custom SVG.
* **Back end:** Node.js, Express 5, TypeScript, zod validation, helmet, express-rate-limit, bcryptjs.
* **Database:** SQLite through `better-sqlite3` — WAL journal, foreign keys on, `BEGIN IMMEDIATE` transactions with savepoints, CHECK constraints, partial unique indexes, triggers, views, FTS5 full-text search, recursive CTEs and window functions.

---

## Security model (and honest limits)

* **Server-side sessions.** Opaque random token in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 hash is stored. Sessions expire after `SESSION_TTL_HOURS`, and changing a password ends the user's other sessions.
* **Passwords:** bcrypt, minimum 10 characters with a letter and a digit. Login is rate-limited and returns one generic message for wrong user *or* wrong password.
* **RBAC on the server.** Every write checks a permission (`server/src/domain/permissions.ts`); investigators may only change cases they are assigned to. The browser hides buttons the user cannot use, but hiding is a convenience — the API rejects the request regardless.
* **Field-level masking.** Contact details of victims, witnesses and protected witnesses are removed from API responses for roles that may not see them; they are not merely hidden in the UI.
* **CSRF defence.** State-changing requests must carry the `X-TraceNet-Client` header and a matching `Origin`.
* **SQL injection.** Every query is parameterised; user-supplied sort columns are checked against allow-lists; `LIKE` wildcards are escaped.
* **Audit trail.** Create/update/delete/assign/transfer/login actions are recorded in an append-only `audit_log`.
* **Chain of custody.** The custody ledger and audit log are *append-only by database triggers*: the application, and any normal SQL session, cannot update or delete rows. **This is not tamper-proof.** Anyone with file-system access to the SQLite file, or who drops the trigger, can alter history. A production system would add hash-chaining, write-once storage or an external timestamping service. TraceNet demonstrates the *database design pattern*, not forensic-grade integrity.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm run dev` says port 4000 or 5173 is in use | Close the other process, or change `PORT` in `.env` (and the proxy target in `client/vite.config.ts`) |
| Login page shows no demo buttons | `DEMO_MODE` is not `true` in `.env`; restart `npm run dev` after editing |
| "Cannot find module better-sqlite3 … bindings" | Run `npm rebuild better-sqlite3`, or reinstall with `npm install` after upgrading Node |
| You want a clean slate | `npm run db:reset` (this deletes all data you entered) |
| Page text is in a fallback font | See *Fonts* below |
| Blank page after `npm start` | Run `npm run build` first so `client/dist` exists |

### Fonts

The interface is designed around **General Sans**, loaded from Fontshare when the computer is online. General Sans is licensed per use and cannot be bundled into this repository, so when the font cannot be loaded the app falls back to the bundled **Instrument Sans**, which has very similar proportions. To bundle General Sans yourself, download it from <https://www.fontshare.com/fonts/general-sans>, place the `.woff2` files in `client/public/fonts/`, and add matching `@font-face` rules at the top of `client/src/index.css`.

---

## Documentation

* [`docs/er-diagram.md`](docs/er-diagram.md) — entity-relationship diagram, table-by-table notes and normalisation
* [`docs/api-documentation.md`](docs/api-documentation.md) — every endpoint, roles, error format
* [`docs/adbms-demonstrations.md`](docs/adbms-demonstrations.md) — what to show the instructor: constraints, triggers, indexes, transactions, isolation, recursive queries
