# How to Run StraySafe 2.0 (Localhost & Tunnel Setup)

> **Status:** Current
> **Applies to:** StraySafe 2.0 Web Application (Subdivision Leader Admin & Resident Web App), Mobile Android APK, Cloudflare Quick Tunnels, and ngrok Tunnels.

---

## 1. Quick Reference & Architecture

StraySafe 2.0 consists of three core local services:

1. **FastAPI Backend API** (`http://localhost:8000`) — REST API, JWT auth, database management, push notifications.
2. **AI Background Worker** — Autonomous processor for YOLO authenticity checks, breed detection, and stray matching.
3. **Vite React Frontend** (`http://localhost:5173`) — Web UI for Subdivision Leader Admin (`/`) and Resident App (`/resident-app`). Vite automatically proxies `/api/*` requests to port 8000.

| Interface / Service                                  | Localhost URL                                    | Tunnel Target Port  | Tunnel Purpose                                                                               |
| ---------------------------------------------------- | ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------- |
| **Subdivision Leader Admin**                   | `http://localhost:5173/` (Sign-in: `/login`) | **Port 5173** | Remote browser access (Chrome/Safari)                                                        |
| **Resident Web App**                           | `http://localhost:5173/resident-app`           | **Port 5173** | Remote browser access (Chrome/Safari)                                                        |
| **Resident Android APK (Server Connectivity)** | `http://localhost:8000/`                       | **Port 8000** | Put whatever the tunnel gives by default. **Do not add `/resident-app` at the end.** |

---

## 2. Running Locally (Localhost Setup)

Open **3 separate PowerShell terminals** in the project root:

### 🖥️ Terminal 1: FastAPI Backend

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

* **Verify:** Open `http://localhost:8000` $\rightarrow$ shows `{"message":"Welcome to StraySafe API"}`.
* **API Docs:** Interactive Swagger UI at `http://localhost:8000/docs`.

---

### 🧠 Terminal 2: AI Background Worker

```powershell
cd backend
..\.venv\Scripts\python.exe -m app.ai_worker
```

* **Verify:** Terminal prints `Ready (...). Waiting for AI jobs.`
* Leave this running next to the backend to process image validation, breed classification, and matching.

---

### 💻 Terminal 3: Vite Frontend Web App

```powershell
cd frontend
npm run dev
```

* **Verify:** Open `http://localhost:5173` in your browser.
* **Subdivision Leader Admin:** Lands directly on the Admin interface at `http://localhost:5173/` (or `/login`).
* **Resident Web App:** Lands on `http://localhost:5173/resident-app`.

---

## 3. Running with Cloudflare Tunnels (Remote Access)

Cloudflare Quick Tunnels generate a temporary public HTTPS address (`https://<random-words>.trycloudflare.com`) with **no port forwarding required**.

> [!IMPORTANT]
> **Pick the right tunnel for what you are testing:**
>
> - **Testing in a Web Browser (Laptop, Phone Chrome/Safari)?** Tunnel **Port 5173** (Method A).
> - **Testing the Android APK?** Tunnel **Port 8000** (Method B).

---

### Method A: Web Browser Testing (Subdivision Leader Admin & Resident Web App)

Use this when you want someone to access the web application on their phone or remote computer using Chrome/Safari:

1. **Start the Frontend Tunnel:**
   ```powershell
   cloudflared tunnel --url http://localhost:5173
   ```
2. **Copy the generated URL:**
   `cloudflared` prints a box with an address like:
   ```text
   https://<your-web-tunnel>.trycloudflare.com
   ```
3. **Open the URLs directly in the browser:**
   - **Subdivision Leader Admin (Default Base URL):**

     ```text
     https://<your-web-tunnel>.trycloudflare.com/
     ```

     *(Sign in at `/login` $\rightarrow$ redirects to `/dashboard`)*
   - **Resident Web App:**

     ```text
     https://<your-web-tunnel>.trycloudflare.com/resident-app
     ```
4. **Why this works seamlessly:** Vite dev server automatically forwards all `/api/*` calls from the browser to your local FastAPI backend on port 8000. One single tunnel handles both UI and API traffic.

---

### Method B: Mobile Android APK Testing (Debug APK)

The compiled Android APK already bundles all frontend assets inside the app; it **only needs to communicate with the Backend API**:

1. **Start the Backend Tunnel:**

   ```powershell
   cloudflared tunnel --url http://localhost:8000
   ```
2. **Copy the generated URL:**
   `cloudflared` prints:

   ```text
   https://<your-backend-tunnel>.trycloudflare.com
   ```

   *Quick check:* Opening this URL in a browser returns `{"message":"Welcome to StraySafe API"}`.
3. **Connect the Resident Android App on your phone:**

   - Open the **StraySafe** debug APK on your phone (connected to Mobile Data 4G/5G or any Wi-Fi).
   - Tap **Connection** in the amber header bar (or go to **Settings $\rightarrow$ Developer $\rightarrow$ Developer connection**).
   - In **Backend API address**, enter whatever default URL the tunnel gives—**do not add `/resident-app` or any route at the end**:

     ```text
     https://<your-backend-tunnel>.trycloudflare.com
     ```

     *(Just copy-paste the exact URL output by `cloudflared` without adding `/resident-app`; if accidentally added, it is normalized automatically).*
   - Tap **Test connection** $\rightarrow$ verifies **Reachable**.
   - Tap **Save & connect**.

---

## 4. Running with ngrok (Alternative Tunnel & Static Domain)

`ngrok` is pre-allowed in both `frontend/vite.config.ts` (`.ngrok-free.app`, `.ngrok-free.dev`) and `backend/app/main.py` CORS rules. You can use either a temporary random URL or your free static ngrok domain.

### One-Time Setup (First Time Only)

1. Install ngrok (`winget install Ngrok.Ngrok` or download from [ngrok.com](https://ngrok.com)).
2. Connect your account authtoken once:
   ```powershell
   ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
   ```

---

### Method A: Web Browser & Printed Pet QR Tag Testing with ngrok (Port 5173)

Use this to open the **Subdivision Leader Admin**, **Resident Web App**, and **printed Pet QR Collar Tags** in Chrome/Safari on a phone or another computer (matches `PUBLIC_TAG_BASE_URL` and `FRONTEND_URL` in `.env`):

1. **Start the Frontend ngrok Tunnel (Fixed Domain):**
   ```powershell
   ngrok http --url=datolitic-tatyana-subgerminally.ngrok-free.dev 5173
   ```
   *(Or without a fixed domain: `ngrok http 5173`)*
2. **Open the URLs in the browser** (click **Visit Site** once on ngrok's free interstitial page):
   - **Subdivision Leader Admin:**
     ```text
     https://datolitic-tatyana-subgerminally.ngrok-free.dev/
     ```
   - **Resident Web App:**
     ```text
     https://datolitic-tatyana-subgerminally.ngrok-free.dev/resident-app
     ```
   - **Printed Pet QR Tag Scans:**
     ```text
     https://datolitic-tatyana-subgerminally.ngrok-free.dev/t/<token>
     ```
3. **Why this works with one tunnel:** Vite forwards all `/api/*` requests to `http://127.0.0.1:8000` locally, and because `.ngrok-free.dev` is a fixed domain, printed pet QR codes continue working across tunnel restarts.

---

### Method B: Mobile Android APK Testing with ngrok (Port 8000)

Use this when testing the installed **StraySafe Debug APK** on a phone over mobile data or external Wi-Fi:

1. **Start the Backend ngrok Tunnel:**
   ```powershell
   ngrok http 8000
   ```
   *(Or with your static domain: `ngrok http --url=<your-static-domain>.ngrok-free.app 8000`)*
2. **Copy the `Forwarding` HTTPS URL:**
   ```text
   https://<your-ngrok-domain>.ngrok-free.app
   ```
3. **Connect the Resident Android APK:**
   - Open the **StraySafe** debug APK $\rightarrow$ tap **Connection** (or **Settings $\rightarrow$ Developer $\rightarrow$ Developer connection**).
   - In **Backend API address**, paste the base ngrok URL (**do not add `/resident-app`**):
     ```text
     https://<your-ngrok-domain>.ngrok-free.app
     ```
   - Tap **Test connection** $\rightarrow$ **Save & connect**.

---

## 5. Accounts & First Sign-In

The database starts with no accounts seeded. Use the following steps to access:

### 1. Subdivision Leader (Admin) Account

Create your first Subdivision Leader using the seed script:

```powershell
cd backend
..\.venv\Scripts\python.exe scripts/seed_admin.py --leader
```

* Enter the Leader's email and password (minimum 12 characters, uppercase, lowercase, number, and special character).
* Sign in at `http://localhost:5173/login` or `https://<your-web-tunnel>.trycloudflare.com/login`.

### 2. Resident Account

Residents sign up directly in the application:

* On the web: navigate to `http://localhost:5173/resident-app/login` and tap **Sign up**.
* On Android: tap **Create account** on the Welcome screen.

---

## 6. Troubleshooting & FAQs

### Why do I get `{"message":"Welcome to StraySafe API"}` when opening my tunnel in a browser?

You tunneled **port 8000** (`cloudflared tunnel --url http://localhost:8000` or `ngrok http 8000`), which is the FastAPI backend API.
**Fix:** Tunnel **port 5173** (`cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173`) to serve the web frontend.

### Why do I get a `404 Not Found` on `/login` or `/cases` via tunnel?

Your tunnel is pointing to port 8000 (FastAPI), which does not serve web pages. Point your tunnel to port 5173 instead.

### Does the tunnel URL change every time?

- **Cloudflare Quick Tunnels (`cloudflared`):** Yes, it creates a new random URL each time you restart it.
- **ngrok (`ngrok http`):** Changes on restart unless you pass your free static domain (`ngrok http --url=<your-domain>.ngrok-free.app 5173`).

### How to stop a service or tunnel?

Press `Ctrl + C` in the corresponding terminal window.
