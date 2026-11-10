## Requirements

- **Python 3.12+**
- **Node.js 20+** (with npm)
- **MySQL** running locally (XAMPP, WAMP, or MySQL Workbench)

---

## 1. Database

Load the schema and the reference data from the project root. The file creates the database `straysafe_subdivision` itself (it **drops and re-creates it**, so never load it into a database you want to keep):

```powershell
cmd /c "mysql -u root -p --default-character-set=utf8mb4 < Database3.4_subdivision.sql"
```

(`cmd /c` is only needed in PowerShell, which has no `<` redirection; in Command Prompt run the `mysql ...` part on its own.)

It creates the 51 tables and fills only the reference data (roles, positions, the barangay and the subdivision, landmarks, report categories and statuses, announcement categories). **It creates no account**: see section 4. (`Database3.4_subdivision.txt` is an identical copy.)

---

## 2. Environment File

Copy `.env.example` to `.env` in the **project root** (next to `backend/`) and replace every placeholder with your own values. Never commit `.env`. At minimum the backend needs:

```env
DATABASE_URL=mysql+pymysql://root:<your MySQL password>@localhost/straysafe_subdivision
JWT_SECRET_KEY=<a long random secret>
SECRET_KEY=<a long random secret>
```

> Use the database name from section 1 (`straysafe_subdivision`), not the `straysafe_db` placeholder in `.env.example`. Where you can, give StraySafe a MySQL account of its own instead of `root` (see [docs/05-operations/database/DATABASE_ACCOUNT_AND_CREDENTIALS.md](docs/05-operations/database/DATABASE_ACCOUNT_AND_CREDENTIALS.md)). No account setting belongs in `.env`: section 4 asks for what it needs.

---

## 3. Backend (FastAPI)

Run all commands from the **project root** (`Straysafe2.0/`):

```powershell
# 1. Create virtual environment (first time only)
python -m venv .venv

# 2. Activate virtual environment
.venv\Scripts\activate

# 3. Install dependencies (first time only)
pip install -r backend/requirements.txt

# 4. Go into the backend folder
cd backend

# 5. Start the backend server
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> ✅ Backend runs at: http://127.0.0.1:8000 (and LAN IP: http://192.168.254.100:8000)
> 📄 API docs at: http://127.0.0.1:8000/docs

**Every time you reopen the project**, just do steps 2 → 4 → 5.

**Demo / speed-test mode (no auto-reload).** `--reload` restarts the server on every code change. That's handy while
coding, but each restart interrupts work in progress (emails being sent, push notifications, background jobs). For
demos, presentations, or when you measure speed, start it **without** `--reload`:

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Code changes are then picked up only after you restart it (Ctrl + C, then run it again).

### AI worker (required, second backend terminal)

YOLOv8, Gemini, photo checks and AI matching run in a separate process so they never slow down the website.
`.env` has `AI_WORKER_EMBEDDED=off`, so the web server never runs AI itself: **without this worker, photos and new
reports wait for their AI analysis** (nothing is lost; they're analysed as soon as the worker starts).

```powershell
.venv\Scripts\activate
cd backend
..\.venv\Scripts\python.exe -m app.ai_worker
```

You should see `Ready (...). Waiting for AI jobs.` Leave it running next to the backend.
If it is not running, the backend runs the AI jobs itself (slower for other users) until the worker is started again.
Admins can check the queue at `GET /admin/ai-jobs`.

---

## 4. First accounts (first time only)

The database starts with **no account**: nothing is seeded and no default password exists.

- **Residents** sign up in the app (`/login` on the website).
- **The first Subdivision Leader** is created with the seed script. Run it from `backend/` with the virtual environment active (the backend does not need to be running):

  ```powershell
  ..\.venv\Scripts\python scripts/seed_admin.py --leader
  ```

  It asks for the Leader's e-mail address and a password (typed twice, never shown). Never reuse a password from this repository; it needs at least 12 characters, with an uppercase letter, a lowercase letter, a number and a special character. Nothing is read from `.env` and nothing is kept except the bcrypt hash in the database, so there is nothing to add to `.env`.

  The Leader signs in at `/subd-admin/login`. The script creates nothing without `--leader` or `--admin`, refuses a weak password, never changes or resets an account that already exists, and prints no password.
- **Admin** (a role reserved for a future implementation, not needed for current development): `--admin` instead, the same way.
- **Barangay Staff** is retired: no account of that role is created.

---

## 6. Frontend (React + Vite)

Open a **separate terminal** and run from the **project root**:

```powershell
# 1. Go into frontend folder
 cd frontend

# 2. Install dependencies (first time only)
npm install

# 3. Start the dev server
npm run dev

or 
npm run dev:https
```

> ✅ Frontend runs at: http://localhost:5173 (or https://<YOUR_IP>:5173 on network)

**Every time you reopen the project**, just do steps 1 → 3.

---

## Running Both Together (Quick Reference)

| Terminal                         | Command                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Terminal 1 (Backend)             | `.venv\Scripts\activate` → `cd backend` → `..\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` (for demos / speed tests: the same without `--reload`) |
| Terminal 2 (AI worker, required) | `.venv\Scripts\activate` → `cd backend` → `..\.venv\Scripts\python -m app.ai_worker`                                                                                                     |
| Terminal 3 (Frontend)            | `cd frontend` → `npm run dev`                                                                                                                                                               |

---

## 7. Opening / Testing on a Phone

To access StraySafe on your mobile device (via mobile browser or Capacitor Android APK), your phone and PC must be connected to the **same Wi-Fi network**.

### Step 1: Find your PC's Local IPv4 Address

1. Open PowerShell / Command Prompt and run:
   ```powershell
   ipconfig
   ```
2. Look for the **IPv4 Address** under your active Wi-Fi adapter (e.g. `192.168.254.107` or `192.168.1.x`).

---

### Step 2: Configure Backend and Frontend for Network Access

1. **Update `.env` in the project root**:
   Ensure `VITE_API_BASE_URL` points to your PC's IP address and that `CORS_ALLOWED_ORIGINS` includes your IP and mobile origins:

   ```env
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost,capacitor://localhost,http://<YOUR_IP>:8000,http://<YOUR_IP>:5173

   VITE_API_BASE_URL=http://<YOUR_IP>:8000
   ```

   *(Replace `<YOUR_IP>` with your actual IPv4 address, e.g. `192.168.254.107`)*
2. **Run Backend on `0.0.0.0`** (allows connections from other devices on the network):

   ```powershell
   ..\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
3. **Run Frontend with `--host`** (exposes Vite dev server to the local network):

   ```powershell
   npm run dev -- --host
   ```

---

### Step 3: Accessing from Mobile

#### Option A: Via Phone Browser (Easiest - No Android Studio Required)

1. Ensure your phone is connected to the same Wi-Fi.
2. Open Chrome / Safari on your phone.
3. Navigate to:

   ```text
   http://<YOUR_IP>:5173
   ```

   *(Example: `http://192.168.254.107:5173`)*

   > ⚠️ Over plain `http://` the phone blocks the **camera (QR scanner)** and **location**. Everything else works.
   >

#### Option A2: Via Phone Browser over HTTPS (camera, QR scanner and location work)

1. Start the frontend in HTTPS mode instead of `npm run dev`:
   ```powershell
   cd frontend
   npm run dev:https
   ```
2. On the phone open `https://<YOUR_IP>:5173` and accept the one-time certificate warning
   (Chrome: *Advanced → Proceed*, Safari: *Show Details → visit this website*).
3. Nothing else changes: in this mode the app calls the backend through the same-origin `/api` path
   (Vite forwards it to port 8000), so no second certificate is needed.
4. If your PC's IP changes, update the three IP entries in the root `.env`
   (`VITE_API_BASE_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`) and restart both servers.
   Tip: reserve the PC's IP in your router so it stops changing.

#### Option B: Via Android App (Capacitor / Android Studio)

1. Build and sync the frontend:
   ```powershell
   cd frontend
   npm run cap:build
   ```
2. Open the project in Android Studio:
   ```powershell
   npm run cap:open
   ```
3. In Android Studio:
   - Go to **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
   - Transfer the generated `.apk` to your phone and install it (or plug your phone in via USB with USB Debugging enabled and click **Run**).

---

## Troubleshooting

| Error                                     | Fix                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `'uvicorn' is not recognized`           | Use`..\.venv\Scripts\python -m uvicorn ...` instead                                                                               |
| `No module named uvicorn`               | Make sure`.venv` is activated: `.venv\Scripts\activate`                                                                         |
| `WinError 10013` (port in use)          | Change`--port 8000` to `--port 8001`                                                                                            |
| `cryptography package required`         | Run`pip install cryptography` with venv active                                                                                    |
| `ModuleNotFoundError`                   | Ensure venv is active and`pip install -r backend/requirements.txt` was run                                                        |
| `Phone cannot reach http://<IP>:5173`   | Ensure`--host` flag was passed to Vite (`npm run dev -- --host`) and your Windows Firewall allows Node.js / Python connections. |
| `Login failed on phone / Network Error` | Ensure the backend was started with`--host 0.0.0.0` and `VITE_API_BASE_URL` in `.env` matches your PC's Wi-Fi IP address.     |
