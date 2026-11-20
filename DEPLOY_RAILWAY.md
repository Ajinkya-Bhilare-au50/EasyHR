# Deploying EasyHR on Railway

EasyHR runs on Railway as three services in one project, all in the same region:

| Service | Built from | Reachable |
|---|---|---|
| **Postgres** | Railway's PostgreSQL template | Private network only |
| **api** | `api/Dockerfile` | Private network only (`api.railway.internal:8000`) |
| **web** | `web/Dockerfile` | Public HTTPS domain. It proxies `/api/*` to the API |

The browser only ever talks to **web**. Web calls the API over Railway's private network, and the API talks to Postgres the same way, so the database and API are never exposed to the internet.

Railway has no India region. **Singapore (`asia-southeast1`) is the closest**, so use it for all three services.

---

## 1. Create the project and the database

1. Sign in at [railway.com](https://railway.com) with GitHub.
2. **New Project → Deploy PostgreSQL.** This creates a service named **Postgres**.
3. Open **Postgres → Settings → Deploy → Region** and choose **Southeast Asia (Singapore)**.

## 2. Add the API service

1. In the project, **+ Create → GitHub Repo →** `Ajinkya-Bhilare-au50/EasyHR`.
2. Open the new service's **Settings**:
   - **Service name:** `api`. The web service reaches it as `api.railway.internal`, so the name matters.
   - **Source → Root Directory:** `/api`
   - **Deploy → Region:** Southeast Asia (Singapore)
   - **Deploy → Healthcheck Path:** `/api/health`
   - **Build → Watch Paths:** `/api/**`. Only changes to the API then redeploy it.
   - **Networking:** don't generate a public domain. The API stays private.
3. Open **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `ENVIRONMENT` | `production` |
   | `JWT_SECRET` | A long random string. Generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
   | `PORT` | `8000` |
   | `MASTER_ADMIN_EMAIL` | Your email, used to sign in to the master console |
   | `MASTER_ADMIN_PASSWORD` | At least 12 characters. Only used on the first deploy |
   | `SEED_DEMO` | `false`. Set `true` only for a public demo with the Alphabet Inc. data and its well-known demo passwords |

   `${{Postgres.DATABASE_URL}}` is a reference variable: Railway fills in the database's private URL. If you renamed the database service, use its name instead of `Postgres`.

The API Dockerfile runs `python -m app.bootstrap` every time the container starts. It does three things:
- applies any pending database migrations
- refreshes the built-in roles and permissions
- creates the master admin if one doesn't exist yet

It's safe to run repeatedly. Check the deploy logs for `bootstrap: created master admin you@…`.

## 3. Add the web service

1. **+ Create → GitHub Repo →** the same repository again.
2. In **Settings**:
   - **Service name:** `web`
   - **Source → Root Directory:** `/web`
   - **Deploy → Region:** Southeast Asia (Singapore)
   - **Deploy → Healthcheck Path:** `/login`
   - **Build → Watch Paths:** `/web/**`
   - **Networking → Generate Domain**, targeting port `3000`. This is your app's public address, e.g. `easyhr-production.up.railway.app`.
3. **Variables:**

   | Variable | Value |
   |---|---|
   | `API_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000` |
   | `NEXT_PUBLIC_SHOW_DEMO_LOGINS` | `false`, or `true` if you set `SEED_DEMO=true` |
   | `NEXT_PUBLIC_DEMO_MASTER_LOGIN` | `false`. Hides the demo "Platform admin" option, whose account (`admin@easyhr.app`) only exists in local development. Your master admin is the `MASTER_ADMIN_EMAIL` account |
   | `PORT` | `3000` |

   Both `API_URL` and `NEXT_PUBLIC_SHOW_DEMO_LOGINS` are **baked into the build**. After changing either one, redeploy the web service so it rebuilds. The build stops with a clear error if `API_URL` is missing.

## 4. First sign-in

1. Open the web service's domain.
2. Sign in with workspace **`admin`** and your `MASTER_ADMIN_EMAIL` / `MASTER_ADMIN_PASSWORD`. This opens the master console at `/master`.
3. **Add a company.** This creates the company's workspace and its first HR admin.
4. Sign out, then sign in with that company's workspace and the HR admin's email to start adding employees.
5. Delete the `MASTER_ADMIN_PASSWORD` variable from the api service. It's only needed to create the account, and the account keeps working without it.

## 5. Optional: your own domain and company subdomains

- **Custom domain:** web → Settings → Networking → **Custom Domain**, e.g. `hr.yourcompany.com`, then add the DNS record Railway shows you.
- **Company subdomains** (e.g. `acme.hr.yourcompany.com`): also add a wildcard custom domain `*.hr.yourcompany.com` to the web service. Then set `BASE_DOMAIN=hr.yourcompany.com` on the api service and `NEXT_PUBLIC_BASE_DOMAIN=hr.yourcompany.com` on the web service, and redeploy web, since this value is baked into the build. The sign-in page then fills in the workspace automatically. Without this, users type their workspace name on the sign-in page. That's also what happens on the `*.up.railway.app` address.

## How deploys work after setup

- Every push to `main` on GitHub redeploys the service whose folder changed, thanks to the watch paths.
- Database migrations run automatically when the new API container starts.
- **Sign-ins:** the session cookie is `Secure` in production, so it only works over HTTPS. Railway domains are always HTTPS.
- **Sessions survive redeploys** as long as `JWT_SECRET` stays the same. Changing `JWT_SECRET` signs everyone out.

## Troubleshooting

| Symptom | Check |
|---|---|
| Web build fails with "API_URL must be set at build time" | Add `API_URL` to the web service's variables and redeploy |
| Pages load, but sign-in or data requests fail with 502/504 | API deploy logs. Is the service named `api`? Is `API_URL` exactly `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000`? |
| API crashes with "JWT_SECRET must be set…" | Set a random `JWT_SECRET` of at least 32 characters |
| API logs: "WARNING no master admin yet" | Set `MASTER_ADMIN_EMAIL` and `MASTER_ADMIN_PASSWORD`, then redeploy the api service |
| Signed in, but immediately signed out again | You're on plain `http://`. Use the `https://` Railway or custom domain |

## Costs and backups

Railway bills by usage, and none of these services sleep, so the app stays fast. Check [railway.com/pricing](https://railway.com/pricing) for current plans and limits. Turn on database backups for the Postgres service in its settings if your plan includes them, or schedule your own `pg_dump`.

## Running the same images elsewhere

`api/Dockerfile` and `web/Dockerfile` don't depend on Railway. Any Docker host works with the same variables: give the API a `DATABASE_URL`, and build the web image with `--build-arg API_URL=http://<api-host>:8000`.
