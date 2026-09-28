# StraySafe 2.0 – Setup Guide (Fresh Clone)

## Requirements
- **Python 3.12+**
- **Node.js 20+** (with npm)
- **MySQL** running locally (XAMPP, WAMP, or MySQL Workbench)

---

## 1. Database

1. Open MySQL and run:
   ```sql
   CREATE DATABASE straysafe_db;
   ```
2. Import the schema:
   ```powershell
   mysql -u root -p straysafe_db < Database.txt
   ```

---

## 2. Environment File

Create a `.env` file in the **project root** (next to `backend/`):
```env
STRAYSAFE_DB_URL="mysql://root:yourpassword@localhost:3306/straysafe_db"
SECRET_KEY="any-random-secret-string"
ADMIN_EMAIL=admin@straysafe.com
ADMIN_PASSWORD=password123
DEBUG=true
```
> Replace `root` and `yourpassword` with your actual MySQL credentials.

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
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

> ✅ Backend runs at: http://127.0.0.1:8000  
> 📄 API docs at: http://127.0.0.1:8000/docs

**Every time you reopen the project**, just do steps 2 → 4 → 5.

---

## 4. Seed Test Accounts (First Time Only)

With the backend running, open a **new terminal** in the project root and run:

```powershell
.venv\Scripts\activate
cd backend
..\.venv\Scripts\python scripts/seed_admin.py
# (Or simply run "python scripts/seed_admin.py" since the venv is active)
```

This creates these accounts (all passwords: `password123`):

| Role | Email |
|------|-------|
| Citizen 1 | `emmanuelvitocruz@gmail.com` |
| Citizen 2 | `resident2@straysafe.com` |
| Subdivision Leader | `kylajoyarriola@gmail.com` |
| Barangay Staff | `kylabiancafrias@gmail.com` |
| Admin | *(your `ADMIN_EMAIL` from `.env`)* |

---

## 5. Frontend (React + Vite)

Open a **separate terminal** and run from the **project root**:

```powershell
# 1. Go into frontend folder
cd frontend

# 2. Install dependencies (first time only)
npm install

# 3. Start the dev server
npm run dev
```

> ✅ Frontend runs at: http://localhost:5173

**Every time you reopen the project**, just do steps 1 → 3.

---

## Running Both Together (Quick Reference)

| Terminal | Command |
|----------|---------|
| Terminal 1 (Backend) | `.venv\Scripts\activate` → `cd backend` → `..\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload` |
| Terminal 2 (Frontend) | `cd frontend` → `npm run dev` |

---

---

## 6. Opening / Testing on a Phone

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

| Error | Fix |
|-------|-----|
| `'uvicorn' is not recognized` | Use `..\.venv\Scripts\python -m uvicorn ...` instead |
| `No module named uvicorn` | Make sure `.venv` is activated: `.venv\Scripts\activate` |
| `WinError 10013` (port in use) | Change `--port 8000` to `--port 8001` |
| `cryptography package required` | Run `pip install cryptography` with venv active |
| `ModuleNotFoundError` | Ensure venv is active and `pip install -r backend/requirements.txt` was run |
| `Phone cannot reach http://<IP>:5173` | Ensure `--host` flag was passed to Vite (`npm run dev -- --host`) and your Windows Firewall allows Node.js / Python connections. |
| `Login failed on phone / Network Error` | Ensure the backend was started with `--host 0.0.0.0` and `VITE_API_BASE_URL` in `.env` matches your PC's Wi-Fi IP address. |
