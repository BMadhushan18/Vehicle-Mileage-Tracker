# RideLog – Bike Mileage & Fuel Tracker

A small, fast web app to log fuel fill-ups and no-ride days for your bikes, scooters and cars, and see
km per liter, cost per km, km per riding day and trends.

Runs entirely on the **Cloudflare free plan**: Pages (website) + Pages Functions (API) + D1 (database) +
Access (sign-in with an email code).

## How mileage is worked out

RideLog uses the **full tank to full tank** method:

- Your first full tank is only a starting point.
- Each time you fill the tank full again, RideLog works out: distance = meter now − meter at last full tank,
  fuel = this fill + any part fills in between.
- km/L comes from your meter reading, so **no-ride days do not change it**. No-ride days only change the
  per-day numbers (km per riding day, cost per riding day).
- Averages are total distance ÷ total fuel (not an average of averages).

All the math is in [`shared/calc.ts`](shared/calc.ts) and is tested in [`shared/calc.test.ts`](shared/calc.test.ts).

## Folder structure

```
.
├── functions/            Cloudflare Pages Functions (the API)
│   ├── _lib/             helpers: db, http, fuel saving, env types
│   └── api/
│       ├── _middleware.ts    reads Cf-Access-Authenticated-User-Email, creates user
│       ├── me.ts             GET/PUT settings
│       ├── summary.ts        GET all-vehicle reports
│       ├── export.ts         GET JSON backup
│       ├── import.ts         POST JSON backup (?mode=replace)
│       ├── fuel/index.ts     GET all fill-ups
│       ├── fuel/[id].ts      GET/PUT/DELETE one fill-up
│       └── vehicles/
│           ├── index.ts          GET/POST vehicles
│           └── [id]/index.ts     GET/PUT/DELETE vehicle
│               [id]/fuel.ts      GET/POST fill-ups
│               [id]/no-ride.ts   GET/POST/DELETE no-ride days (ranges)
│               [id]/report.ts    GET periods + summary
├── shared/               code used by both the browser and the API
│   ├── calc.ts           mileage calculations
│   ├── validate.ts       validation rules
│   └── types.ts
├── src/                  React app (Vite + TypeScript, plain CSS)
│   ├── pages/            Dashboard, FuelForm, CalendarPage, Reports, Vehicles, History, Settings
│   ├── components/       Nav, ui (cards, modal, skeleton…), VehicleSwitcher, Icon
│   └── charts/           Chart.js (lazy-loaded)
├── public/               PWA manifest, service worker, icons, _headers
├── migrations/           D1 SQL migrations
├── seed/seed.sql         sample data (2 vehicles, 3 months)
├── scripts/              seed + icon generators
└── wrangler.toml
```

## Setup, step by step

You need [Node.js 20+](https://nodejs.org) and a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

### 1. Put the code on GitHub

```bash
git init
git add .
git commit -m "RideLog first version"
git branch -M main
git remote add origin https://github.com/<your-name>/<your-repo>.git
git push -u origin main
```

### 2. Install and create the database

```bash
npm install
npx wrangler login
npx wrangler d1 create ridelog-db
```

The last command prints a `database_id`. Copy it into `wrangler.toml` in place of
`REPLACE_WITH_YOUR_DATABASE_ID`, then commit and push that change.

Create the tables in the real (remote) database:

```bash
npm run db:migrate:remote
```

### 3. Connect GitHub to Cloudflare Pages

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick your repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `20`
4. Click **Save and Deploy**.
5. After it deploys, open the project's **Settings → Bindings → Add → D1 database**:
   variable name `DB`, database `ridelog-db`. Add it for **Production** and **Preview**.
   (If your `wrangler.toml` has the right `database_id`, Pages may pick this up for you.)
6. Go to **Deployments** and **Retry deployment** so the binding is used.

Now every push to `main` deploys automatically.

### 4. Protect the app with Cloudflare Access (sign-in)

1. In the Cloudflare dashboard open **Zero Trust** (free for up to 50 users). Choose a team name if asked.
2. **Settings → Authentication → Login methods**: make sure **One-time PIN** is on.
3. **Access → Applications → Add an application → Self-hosted**.
   - Application domain: your Pages domain, for example `ridelog.pages.dev`.
   - Add a second domain `*.ridelog.pages.dev` so preview builds are protected too.
4. Add a policy: Action **Allow**, Include **Emails** (list the people who may use it) or
   **Emails ending in** `@yourcompany.com`, or **Everyone** to let anyone with an email sign in.
5. Save.

Now visiting the app asks for an email, sends a code, and Cloudflare adds the header
`Cf-Access-Authenticated-User-Email` to every request. The API uses that email to keep each person's
data separate. **Without Access in front, the API returns "Please sign in"**.

> Tip: also turn on Pages **Settings → General → Access policy** for previews if you prefer.

### 5. Run on your computer

```bash
npm install
cp .dev.vars.example .dev.vars        # sets DEV_EMAIL=dev@example.com (local only)
npm run db:migrate:local
npm run db:seed:local                 # optional sample data for dev@example.com
npm run build
npm run dev:api                       # API + built site on http://localhost:8788
```

For live-reload while editing the UI, keep `npm run dev:api` running and in another terminal run
`npm run dev` (http://localhost:5173 – API calls are proxied to 8788).

Sample data for a different email: `node scripts/make-seed.mjs you@example.com` then
`npm run db:seed:local` (or `npx wrangler d1 execute ridelog-db --remote --file=seed/seed.sql` for the
real database).

## Scripts

| Command                                | What it does                    |
| -------------------------------------- | ------------------------------- |
| `npm run dev`                          | Vite dev server (UI)            |
| `npm run dev:api`                      | Local Pages + Functions + D1    |
| `npm run build`                        | Type-check and build to `dist/` |
| `npm test`                             | Unit tests (Vitest)             |
| `npm run lint` / `npm run format`      | ESLint / Prettier               |
| `npm run db:migrate:local` / `:remote` | Apply migrations                |
| `npm run db:seed:local`                | Load sample data                |

## Staying inside the free plan

- Static files are served free; only `/api/*` runs Functions (100k requests/day free).
- Each screen makes 1–2 API calls. Reports for all vehicles come from one `/api/summary` call.
- D1 reads are batched (one round trip), and imports / no-ride ranges insert many rows with a single
  statement.
