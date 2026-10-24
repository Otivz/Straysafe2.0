# StraySafe 2.0: Deployment Guide

**Plan:** Aiven (MySQL database) · Cloudinary (photos and videos) · Render (backend API) · Vercel (website)

Work through the phases in order. Each phase ends with a **✅ Done when** check, so you know it worked before moving on. Tick the boxes as you go.

**Who does what**
- **You:** create the accounts, hold the passwords and keys, click Deploy, run the backup and import commands.
- **Claude:** prepares the code and config files on a separate branch. It never pushes, deploys or touches your data unless you say so.

---

## Decision to make first (before Phase 3)

Render's free plan has **512 MB of memory**. The animal-photo check (YOLO, which loads PyTorch) needs roughly **1 GB**, so the free server would probably crash the first time someone uploads a report photo.

| Option | What you get | Cost |
|---|---|---|
| **A. Paid Render, 2 GB or more** | Everything works as it does on your PC | about $25/month (Standard plan) |
| **B. Free Render, YOLO switched off** | Reports still submit; photos skip the YOLO check. The server sleeps after 15 minutes idle, so the first request takes about a minute | $0 |

Option B needs a small code change, and Claude must first check what each AI step falls back to, so the accuracy claims in your paper stay true.

Your choice: ☐ A  ☐ B

---

## Phase 0: Back up everything (local)

Do this before anything else. Your computer holds the only copy of your data.

- [ ] **Database dump:** run `mysqldump` on your whole local database and save the `.sql` file. This is also the file you import into Aiven in Phase 2. Keep a second copy **outside** the project folder.
- [ ] **Uploads:** copy `backend/uploads/` and `backend/ai_cache/` somewhere safe.
- [ ] **Secrets:** copy your `.env` file to a safe place **outside the repo**. Never commit it. `ID_ENCRYPTION_KEY` matters most: encrypted IDs cannot be read without it.
- [ ] **Code:** commit your current work, then create a branch for deployment work (for example `deploy`). `main` stays as it is.
- [ ] Keep `stray_safe.db`, `straysafe.db` and `test.db` for now. They look like old copies.

✅ **Done when:** you have the `.sql` file, a copy of the uploads, a copy of `.env`, and a commit.

---

## Phase 1: Cloudinary (photos and videos)

You already use Cloudinary, so this phase is mostly checking.

- [ ] Log in to your Cloudinary account and note the **cloud name**, **API key** and **API secret**.
- [ ] Check which photos are only in `backend/uploads/` and not on Cloudinary. Anything only there will be lost on Render, because Render wipes its disk on each deploy.
- [ ] Keep the three values for Phase 4.

✅ **Done when:** you have the three Cloudinary values and know whether any files exist only locally.

---

## Phase 2: Aiven (MySQL database)

- [ ] Create an Aiven account and a **MySQL** service (the free plan is enough to start).
- [ ] Create an empty database (for example `straysafe`) and a user for it.
- [ ] From Aiven, note the **host, port, user, password and database name**, and download the **CA certificate**.
- [ ] **Allow connections:** Aiven restricts which IP addresses may connect. Allow your own IP for the import, and Render's addresses later (Aiven's service settings list the IP allow-list).
- [ ] **Import your dump** into the empty database:
  - Aiven blocks tables that have no primary key by default. If the import fails for that reason, change the one Aiven setting that allows it (`sql_require_primary_key`) and import again.
  - Never import over a database that already has data.
- [ ] **Check the import:** compare row counts of the main tables (users, reports, pets, adoptions) with your local database.
- [ ] Build the connection address for Phase 4:
  `mysql+pymysql://USER:PASSWORD@HOST:PORT/DATABASE` plus the SSL option. Claude will give you the exact form for this project.

✅ **Done when:** the row counts match, and you can connect to Aiven from your PC.

---

## Phase 3: Code changes (Claude does this, on the `deploy` branch)

Claude prepares these. You review them before anything is merged.

- [ ] **Database:** SSL connection to Aiven, and the connection-pool size (now up to 40 connections) made a setting, so you can lower it for Aiven's limit.
- [ ] **Render:** start command, Python version, and the **CPU-only PyTorch** pin (so the build doesn't download the huge GPU version).
- [ ] **AI worker (option B only):** a setting to switch YOLO off, with checked fallbacks.
- [ ] **Temporary AI files:** the AI queue writes a temporary copy of each photo to the server's disk. Make this safe on a server whose disk is wiped.
- [ ] **Vercel:** a `vercel.json` with (1) a rule so refreshing a page such as `/brgy/dashboard` doesn't give a 404, and (2) a forward of `/api/*` to Render. The forward makes the browser see one site, so the stay-signed-in cookie keeps working. Without it, website users would be signed out after 30 minutes. The APK is not affected.
- [ ] **`.env` template:** a list of every setting the backend needs, with no real values.
- [ ] **Tests:** the backend tests and a build of the website, run before anything is pushed.

✅ **Done when:** Claude lists the changed files, the tests pass, and you have read the changes.

---

## Phase 4: Render (backend)

- [ ] Create a Render account and connect your GitHub repository.
- [ ] Create a **Web Service** from the `deploy` branch, root directory `backend`, with the build and start commands Claude gives you. Choose the plan from your decision above.
- [ ] Add the **environment variables**. Keep a private note of every one you set.

| Setting | What it is |
|---|---|
| `DATABASE_URL` | the Aiven connection from Phase 2 |
| `JWT_SECRET_KEY`, `SECRET_KEY` | long random strings; use new ones for production |
| `ID_ENCRYPTION_KEY` | **the same value as your local one** |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from Phase 1 |
| `GEMINI_API_KEY` | AI |
| `GOOGLE_CLIENT_ID` | Google sign-in |
| `RESEND_API_KEY` or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | email (OTP codes) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push notifications |
| `FRONTEND_URL` | your Vercel address |
| `CORS_ALLOWED_ORIGINS` | your Vercel address (and the APK's, if the guide says so) |
| `COOKIE_SECURE` | `true` (the site is on https) |
| `AI_TORCH_THREADS`, `AI_WORKER_EMBEDDED` | AI performance (and the YOLO switch for option B) |

- [ ] Deploy, then open `https://YOUR-RENDER-ADDRESS/docs`. The API page should load.
- [ ] Add Render's outgoing IP addresses to Aiven's allow-list if it blocks the connection.

✅ **Done when:** `/docs` loads and the backend log shows a successful database connection.

---

## Phase 5: Vercel (website)

- [ ] Create a Vercel account and import the repository.
- [ ] Set **root directory** to `frontend`. Vercel detects Vite automatically.
- [ ] Add the environment variable `VITE_API_BASE_URL` (Claude will tell you the exact value that matches the `/api` forward).
- [ ] Deploy, then copy the Vercel address into `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` on Render, and redeploy Render.

✅ **Done when:** the landing page loads on the Vercel address and refreshing a deep page does not give a 404.

---

## Phase 6: Test the live site

Use a phone for several of these, since the camera and GPS only work on https.

- [ ] Resident: register with an OTP email, sign in, stay signed in after closing the browser.
- [ ] Log out, then open the landing page → **Adopt a Pet**. It must show you as signed out.
- [ ] File a report with a photo, then confirm the photo shows on Cloudinary and in the app.
- [ ] Staff and admin sign-in; the dashboards load; tapping a map pin opens the card.
- [ ] Admin changes the reporting radius; the green circle on the maps changes.
- [ ] A report photo with the AI on; a report with the AI unavailable.
- [ ] Push notification arrives (if you use it).
- [ ] Wait 30+ minutes on the website, then click something: you should **not** be signed out.

✅ **Done when:** every box above passes. Write down anything that fails and bring it back.

---

## Phase 7: APK

- [ ] Open the app → **Server settings** → type the Render address (the APK talks to the backend directly, not through Vercel).
- [ ] If the APK is blocked by CORS, add its origin to `CORS_ALLOWED_ORIGINS`.
- [ ] The new icon and the other app changes only appear in a **new** APK: push, then download the build from GitHub Actions.

✅ **Done when:** sign-in, a report with a photo, and the map all work in the APK on a real phone.

---

## After going live

- **Backups:** schedule your own `mysqldump` of the Aiven database every week. Download the Cloudinary folder from time to time. Render and Vercel hold only code and settings, which Git covers.
- **Keep your local copy** untouched for a few days after launch.
- **Free tiers:** Render's free server sleeps after 15 minutes; Aiven's free plan has limits on size and connections. If the site feels slow after being idle, that is why.

## If something goes wrong

| Symptom | First thing to check |
|---|---|
| Render build fails or runs out of memory | CPU-only PyTorch pin; the plan's memory (decision above) |
| Backend can't reach the database | Aiven IP allow-list; the SSL option; the password |
| Website works but you're signed out after about 30 minutes | the Vercel `/api` forward; `COOKIE_SECURE`; `FRONTEND_URL` |
| Page refresh shows 404 | the Vercel rewrite rule |
| Uploaded photos vanish after a redeploy | the file was saved on Render's disk instead of Cloudinary |
| CORS errors in the browser | `CORS_ALLOWED_ORIGINS` has the exact site address (no trailing slash) |
| Emails or OTP codes don't arrive | the email settings on Render; spam folder |
