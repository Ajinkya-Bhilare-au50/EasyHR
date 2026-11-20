# EasyHR

EasyHR is a multi-company HRMS covering attendance, leave, holidays, profiles and the org chart, with a master admin console.
It follows the module list in `documentation.md` and the navigation in `EasyHR_Site_Map.pdf`.

| Layer | Stack | Folder |
|---|---|---|
| Frontend | Next.js 16 (App Router), Tailwind CSS v4, Lucide icons, Inter | `web/` |
| API | Python FastAPI, SQLAlchemy 2, Pydantic v2, Argon2, JWT in an httpOnly cookie | `api/` |
| Database | PostgreSQL 17 (Docker) | `docker-compose.yml` |

## Features

| Module | What it does |
|---|---|
| Dashboard | Check-in/out widget, leave balances, attendance summary, upcoming holidays, birthdays, pending approvals |
| Attendance | Check in/out (office or home), daily team status, missed-punch corrections (rationalization) with approval |
| Leave | Apply with a backup colleague, multi-level approval, balances, history, LWP/LOP handling |
| Holiday | Company calendar, optional holidays with approval, uptake reports |
| Profile | Profile photo, plus professional, personal, documents and compensation tabs, with visibility by role |
| Org chart | Top-down and flat views, filters by department, branch and more, export |
| Employees (HR) | Add and edit people, reporting lines, roles, **onboarding documents checklist** |
| Reports (HR) | Holiday report and a full audit log of every change |
| Settings (HR) | Shift and calendar, approval rules, leave types, holiday calendar, custom roles, payroll lock |
| Master console | Platform owner manages companies and enabled modules |

Across the app: **light and dark mode**, layouts that work on phones and desktops, skeleton placeholders while data loads, in-app notifications and chat.

## Run it locally

Use three terminals, each starting in the `EasyHR` folder. The commands below are for Windows PowerShell, which does not accept bash's `&&`, so each command goes on its own line.

**Terminal 1: database**
```powershell
docker compose up -d
```

**Terminal 2: API** (http://localhost:8000, interactive docs at `/docs`)
```powershell
cd api
# first time only:
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.seed        # runs migrations (alembic upgrade head) + loads demo data
# every time:
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --port 8000
# after pulling new code that adds a migration (e.g. the onboarding documents column):
.\.venv\Scripts\python.exe -m alembic upgrade head
```
Calling the venv's `python.exe` directly avoids `Activate.ps1`, which PowerShell's default execution policy often blocks. On macOS or Linux, use `.venv/bin/python` instead.

**Terminal 3: web** (prints its URL, normally http://localhost:3000)
```powershell
cd web
# first time only:
npm install
Copy-Item .env.example .env.local
# every time:
npm run dev
```
If PowerShell says `npm.ps1 cannot be loaded`, run `npm.cmd run dev` instead.

**Faster mode (production build).** `npm run dev` compiles each page the first time you open it, which takes 1–3 seconds per page. A production build compiles everything in advance, so pages open in about 0.1–0.3 seconds. Run it in Terminal 3 instead of `npm run dev`:
```powershell
npm run build
npm start          # serves the built app, normally on http://localhost:3000
```
Re-run `npm run build` after changing frontend code. A production build doesn't hot-reload.

Next.js proxies `/api/*` to FastAPI (`API_URL` in `web/.env.local`). The browser therefore talks to a single origin, and the session cookie works without any CORS setup.

### Demo accounts

Every demo login uses workspace **`alphabet-inc`** and password **`Password@123`**:

| Login | Person | Role | What they can see and do |
|---|---|---|---|
| `2140` | Arjun Patel | Employee | Self-service: check in, apply for leave and holidays, view their own profile |
| `1010` | Priya Sharma | Manager | Approve requests and see team attendance; Arjun's leave request is waiting for her |
| `1003` | Kavya Nair | HR / company admin | Everything, plus Employees, Reports and Settings |

You can type the email instead of the code, for example `arjun@alphabet.example.com` or `priya@alphabet.example.com`.

`2143` is Ajinkya Bhilare, Full Stack Developer in Engineering, reporting to Priya Sharma.

The other demo employees (`1001`, `1002`, `1004`, `2141`, `2142`, `2143`, `2150`, `2160`, `2161`, `2170`) use the same workspace and password.

**Master admin (platform owner):**

- **Workspace:** `admin`
- **Email:** `admin@easyhr.app`
- **Password:** `Admin@12345`

This account opens the company management console at `/master`.

Tenant subdomains also work: on `http://alphabet-inc.localhost:3000` the workspace is filled in automatically.

The sign-in page has a **Try a demo account** dropdown. Picking an account fills in the workspace, login and password, so you only have to click **Sign in**.

> These are demo credentials created by `python -m app.seed`. Don't use them in a real deployment. To hide the dropdown, set `NEXT_PUBLIC_SHOW_DEMO_LOGINS=false` in `web/.env.local` and restart `npm run dev`.

## Deploy

EasyHR is set up to deploy on **Railway**: Postgres, the API and the website run as three services in one region (Singapore, the closest to India), talking over Railway's private network. Step-by-step guide: **[DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)**.

- `api/Dockerfile`: runs migrations and first-run setup (`python -m app.bootstrap`), then uvicorn with 2 workers.
- `web/Dockerfile`: a production Next.js build (standalone server).
- Production settings (`ENVIRONMENT=production`) require a real `JWT_SECRET`, make the session cookie HTTPS-only, and create the master admin from `MASTER_ADMIN_EMAIL` / `MASTER_ADMIN_PASSWORD` instead of loading demo data.

## How it's built

### Multi-tenancy (`api/app/tenancy.py`)
Once a request is authenticated, its DB session is bound to the user's company. A SQLAlchemy `do_orm_execute` hook then adds `company_id = :cid` to every SELECT on every company-owned model. The filter lives in one place, so a handler that forgets it cannot leak data. `api/tests/test_tenant_isolation.py` checks this by alternating requests between two companies.

### Permissions (`api/app/permissions.py`, `deps.require`)
Roles are sets of permission codes such as `attendance.rationalize.approve`. The API checks permission codes, never role names. Company admins can create their own roles under **Settings → Roles & permissions**.

### Business rules (enforced on the server)
- Punches always use server time.
- Original punches are immutable. A rationalization adds a new punch with `source = rationalized` and the day is recalculated, for example from A to P.
- Managers can rationalize only their direct or indirect reportees (recursive CTE). Nobody can approve their own request.
- Each company sets its rationalize window, monthly limit and payroll lock.
- Leave uses two counts. Applied days are calendar days. Actual days exclude holidays and week-offs, and are what gets deducted. Unpaid types are labelled LWP/LOP.
- Leave, optional holidays and rationalizations share one approval engine (`services/approvals.py`): employee → manager (→ skip-level, configurable) → completed. A backup employee is required for leave and for optional holidays.
- Every create, approve, reject, cancel and admin change is written to `audit_logs`, which you can view under **Reports → Audit log**.
- Login and punch requests are rate-limited.

### Onboarding documents (`api/app/onboarding.py`)
HR records which documents a new joiner has handed over by ticking a checklist in **Employees → Add / Edit employee → Documents provided**. Only the checklist is stored, never the files themselves.
- The list (signed offer letter, government photo ID, PAN card, address proof, education certificates, relieving letter, last 3 months' payslips, bank details, signed NDA, emergency contact form) is defined once in `ONBOARDING_DOCUMENTS`. To add a document, add a line there. Don't rename existing keys, because they are stored in the database.
- Each ticked document stores the date it was marked (`users.onboarding_docs`, JSONB `{key: "YYYY-MM-DD"}`). Unticking removes it. Unknown keys are rejected.
- The Employees list shows progress per person (for example `5/10`) and a **Documents pending** count. The profile has a read-only **Documents** tab.
- HR can change the checklist. The employee and their managers can see it. Other colleagues can't.

### Design system (`web/src/app/globals.css`, `web/src/components/ui/`)
The colour, type, radius, spacing and shadow tokens all live in `@theme`. Every page is built from the same shared components:
- Button, Card, Badge / StatusBadge / AttendanceBadge
- Field / Input / Select
- Tabs (URL-synced), Modal / Drawer
- DataTable (sorting, search, pagination, column visibility, print, CSV)
- KpiCard, MonthCalendar, EmployeePicker, ApprovalTimeline

The check-in widget is a single component used on both the Dashboard and Attendance pages.

### Profile photos (`api/app/routers/photos.py`, `components/features/profile-photo.tsx`)
The camera button on a profile picture uploads, changes or removes the photo. Employees can change their own photo, and HR (`employees.manage`) can change anyone's. Photos appear everywhere an avatar does: header, profile, org chart, people search, pickers, chat and birthdays.
- The browser crops the image to a centred square and shrinks it to 320×320 WebP (or JPEG), usually 20–40 KB. EXIF rotation from phones is respected.
- The API checks the real file signature (JPEG, PNG or WebP only) and caps uploads at 1 MB. It serves photos only to signed-in users of the same company, with `nosniff`.
- Photos are stored in Postgres (`user_photos`), so they survive redeploys without extra storage. `users.photo_updated_at` is added to each photo URL (`?v=…`), so browsers cache photos for a year and still see changes immediately.
- Uploads and removals are recorded in the audit log.

### Light and dark mode
A sun/moon button in the header (also on the sign-in page and in the master console) switches themes. The first visit follows the operating system setting; after that the choice is remembered in the browser. Dark mode only redefines the colour tokens under `html[data-theme="dark"]` in `globals.css`, so components need no theme-specific code. `web/public/theme-init.js` applies the saved theme before the page paints, so there is no flash of the wrong theme.

### Branding
- A thin **"Developed by Ajinkya Bhilare"** banner sits at the top of the app, the sign-in page and the master console (`CreditBanner` in `components/shell/theme.tsx`). Its close button hides it for the rest of the browser session. It is left out when printing.
- The sign-in page's brand panel has an illustration of offices in several countries and time zones connected to one workspace (`components/features/global-offices-art.tsx`). It scales with the window height and hides on windows shorter than 680 px, where it would be too small to read.

### Performance and loading states
- **API:** list endpoints load related people and approval steps in batches instead of one query per row. The tenant filter is built once per company and then reused. A typical endpoint answers in about 20 ms.
- **Frontend cache:** `useApi` keeps the last response for each URL. Revisiting a page shows it instantly and refreshes it in the background. Identical requests made at the same time share one fetch.
- **Skeleton screens:** each route has a `loading.tsx` that mirrors that page's layout (`components/ui/skeletons.tsx`). KPI cards, tables, forms, checklists, lists, the org chart, chat, notifications, people search and pickers all show grey placeholder blocks while their data loads. A thin progress bar at the top shows page navigation in progress.

## Project layout

```
api/app/
  main.py            app, CORS, rate limiting
  models.py          all tables (companies, users, RBAC, attendance, leave, holiday, approvals, audit, notifications, messages)
  onboarding.py      onboarding documents checklist definition
  tenancy.py         central company scoping
  deps.py            auth context, permission checks, reportee hierarchy
  services/          attendance recalculation + rules, approval engine, leave-day calculation
  routers/           auth, attendance, leave, holidays, people (profile/org chart/dashboard/notifications/chat), admin, master
  seed.py            demo data
web/src/
  app/(app)/         Dashboard, Profile, Org chart, Leaves, Attendance, Holiday, Employees, Reports, Settings
  app/login, app/master
  components/ui/     design-system components
  components/shell/  sidebar, header (search, notifications, chat, help, user menu), auth context, theme toggle and banner
  components/features/  one file per module
```

## Database migrations (Alembic)

The schema lives in `api/migrations/versions/`. `python -m app.seed` runs `alembic upgrade head` first, so a new database needs nothing else. Run these from `api/`:

```bash
alembic upgrade head                                 # apply pending migrations
alembic revision --autogenerate -m "add x to y"      # after editing app/models.py, then review the file
alembic downgrade -1                                 # roll back the last migration
alembic check                                        # fails if models and migrations have drifted
python -m app.seed --reset                           # wipe the DB, migrate from scratch, reseed demo data
```

The database URL comes from `DATABASE_URL` in `api/.env`. Autogenerate treats a renamed column as a drop plus an add, which loses data, so edit those migrations by hand.

## Not yet built
- Onboarding beyond the documents checklist: email invites (HR still sets the first password), document file uploads (only profile photos can be uploaded), onboarding task lists, probation tracking and CSV bulk import.
- SAML/OIDC SSO: `/api/auth/sso/saml` returns 501.
- Mobile app and biometric device service (documentation phase 8).
- Background jobs (Redis/BullMQ) and email notifications. Notifications are in-app only.
