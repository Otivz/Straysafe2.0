If you ask the figuring it out the truth, I'd love to safe and secure and should I ask me what happens what it's about to be honest and to figuring it out if I could be candid and tell you the truth? There's so much to say and so much to do it just one can you give me? I don't think so. I don't think so. I don't think so. I don't think so much. I don't think so. I don't think so make it work. No one hurts, but I'll go there. Do the same. Can you show me that you care so I don't think so mean if you're here for good, I'm gonna need a little more from you, breaking up to your super with you and I to my scarf there it just okay and you're all eyes by my all self again in such a blind day night I know it's Halloween see I watch you later you see out of the way to keep I'm sure she's beautiful and it's background we don't know any number strength will come back instantly to keep him locked up forever they built the prisoner away from the ocean for a whole year he suffered from dehydration every day on top of that he had to endure the guards endless torture soldiers patrol all around the prison without his powers he had no chance of escape but there was one thing they didn't know his brother Worm had already snuck into the prison he sent an octopus named Tobo threw the pipes to find the switch that controlled his cell door then Ore put on his stealth suit and slipped into the prison without a sound the guards never even got a clear look at his face before they dropped one by one when his cell door opened after a whole year of being tortured he finally saw his brother standing in front of him they didn't have time to celebrate the reunion because more guards were already on their way he picked up a weapon from the ground and out of the cell along the way they kept taking down the guards chasing them with Tobo's help they managed to open the prison gates and escape outside as soon as he caught his breath he asked his brother if he had any water but on his way here he had already drunk all the water he brought just then two guards suddenly caught up with them four immediately activated his stealth suit and quickly took them down then they stole the guard's giant belts and started moving through the underground tunnels they shot toward the mountain wall at incredible speed two massive underground creatures moved fast moments later they burst out of the ground the impact sent Orb and him flying they rolled across the sand several times his brother told him the sea wasn't far down once he hit the water all his powers would return but the prison guards came after them again bursting out from underground they were relentless buying him time all remained in his stealth suit and stayed behind to hold them off meanwhile he dragged his weakened body toward the sea step by step just a few meters from the water his body finally reached its limit and collapsed on the cold beach the guards only gave him a tiny amount of water each day what's your name can you tell me the definition of power? It's the ability to direct or influence another's behavior or course of events. That's what I have. I can remove you from this class and fail you, or I can send you before the dean for violating the student code of conduct. These are all things that can alter the course of your life that's power. You don't have any. Can I help you get a word? Call the police. This isn't my first rodeo with your husband came in here and he killed somebody. Where are you on main streets? You're sign just like teachers college. I'm a teacher of the teacher's college twenty you'll be arrested for shoplifting. What happened to innocent if you were innocent you'd be offering ways to prove it. Put your hands against the wall and spread your legs, your pants, please we're close to the moment my sister in that I'm no lawyer try on here even though it's not a half two if I'm like it just keeps my skin just say it touched your skin sorry apologies brilliant my love is pure I saw an angel over there I'm sure poison between website and a webs web browser and a web server connection between web server with web browser and the web server and HTTPS different between HTTP yes security

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
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> ✅ Backend runs at: http://127.0.0.1:8000 (and LAN IP: http://192.168.254.100:8000)  
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



## 6. Frontend (React + Vite)

Open a **separate terminal** and run from the **project root**:

```powershell
# 1. Go into frontend folder
cd frontend

# 2. Install dependencies (first time only)
npm install

# 3. Start the dev server
npm run dev
```

> ✅ Frontend runs at: http://localhost:5173 (or https://<YOUR_IP>:5173 on network)

**Every time you reopen the project**, just do steps 1 → 3.

---

## Running Both Together (Quick Reference)

| Terminal | Command |
|----------|---------|
| Terminal 1 (Backend) | `.venv\Scripts\activate` → `cd backend` → `..\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` |
| Terminal 2 (Frontend) | `cd frontend` → `npm run dev` |

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

| Error | Fix |
|-------|-----|
| `'uvicorn' is not recognized` | Use `..\.venv\Scripts\python -m uvicorn ...` instead |
| `No module named uvicorn` | Make sure `.venv` is activated: `.venv\Scripts\activate` |
| `WinError 10013` (port in use) | Change `--port 8000` to `--port 8001` |
| `cryptography package required` | Run `pip install cryptography` with venv active |
| `ModuleNotFoundError` | Ensure venv is active and `pip install -r backend/requirements.txt` was run |
| `Phone cannot reach http://<IP>:5173` | Ensure `--host` flag was passed to Vite (`npm run dev -- --host`) and your Windows Firewall allows Node.js / Python connections. |
| `Login failed on phone / Network Error` | Ensure the backend was started with `--host 0.0.0.0` and `VITE_API_BASE_URL` in `.env` matches your PC's Wi-Fi IP address. |
