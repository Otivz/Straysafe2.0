# StraySafe 2.0 – Cloudflare Tunnel Setup & Mobile Connection Guide

> **Status**: Active & Configured
> **Last Updated**: 2026-10-26
> **Applies to**: Remote Mobile Testing (4G/5G, External Wi-Fi, Android APK & Mobile Browsers)

---

## 1. Quick Reference & Current Active Tunnel

* **Tunnel Type**: Cloudflare Quick Tunnel (Outbound Encrypted QUIC/HTTP2)
* **Active Backend Public URL**:
  ```text
  https://cms-declared-annie-quarters.trycloudflare.com
  ```
* **Target Local Service**: FastAPI Backend (`http://localhost:8000`)
* **Database Isolation**: Local MySQL (`127.0.0.1:3306`) – **STRICTLY PRIVATE** (never exposed to the internet)
* **Binary Location**: `C:\Program Files (x86)\cloudflared\cloudflared.exe`

---

## 2. Daily Workflow: Starting the System on Your Laptop

Whenever you want to test StraySafe on your phone, open these terminal windows on your laptop:

### 🖥️ Terminal 1: FastAPI Backend

```powershell
cd c:\Users\User\Desktop\Straysafe2.0\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> ✅ *Running on: `http://0.0.0.0:8000`*

### 🧠 Terminal 2: AI Background Worker

```powershell
cd c:\Users\User\Desktop\Straysafe2.0\backend
..\.venv\Scripts\python.exe -m app.ai_worker
```

> ✅ *Processes photo authenticity checks, breed recognition, and stray matching.*

### 🌐 Terminal 3: Cloudflare Tunnel (Keeps Mobile Connected)

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8000
```

> *(Currently running as an active background task with URL: `https://cms-declared-annie-quarters.trycloudflare.com`)*.

### 💻 Terminal 4: Frontend Vite Server (Only for Phone Web Browser Testing)

```powershell
cd c:\Users\User\Desktop\Straysafe2.0\frontend
npm run dev -- --host
```

---

## 3. How to Connect the Android App (APK) on Your Phone

The APK has all frontend files bundled inside the app, so it **only connects to the backend tunnel**. It works on **Mobile Cellular Data (4G/5G)** or any Wi-Fi network without rebuilding the APK.

```
┌────────────────────────────────────────────────────────┐
│                   STRAYSAFE LOGIN                      │
│                                                        │
│  [ Email / Username Input ]                            │
│  [ Password Input ]                                    │
│  [ Sign In Button ]                                    │
│                                                        │
│  ────────────────────────────────────────────────────  │
│  ⚙️ Server settings (http://...)              ◄── TAP!  │
└────────────────────────────────────────────────────────┘
```

### Steps:

1. **On your phone**: Turn **OFF** Wi-Fi and turn **ON** Mobile Data (4G/5G), or connect to any Wi-Fi.
2. Open the **StraySafe** Android APK on your phone.
3. On the Login screen, look at the bottom and tap:**`Server settings`** (with the server icon).
4. In the text box, enter the active tunnel URL:
   ```text
   https://cms-declared-annie-quarters.trycloudflare.com
   ```
5. Tap **SAVE**.
6. The app verifies the server and displays:
   > `✓ StraySafe server found at https://cms-declared-annie-quarters.trycloudflare.com. Reloading...`
   >
7. The app reloads and is now communicating directly with your laptop's backend!

---

## 4. How to Open on Mobile Web Browser (Chrome / Safari)

If someone does not have the APK and wants to open StraySafe in their phone's mobile browser:

### Method A: Phone and Laptop on the SAME Wi-Fi (Fastest for local testing)

1. Start frontend in HTTPS mode (enables mobile camera, QR scanner, and GPS permissions):
   ```powershell
   cd c:\Users\User\Desktop\Straysafe2.0\frontend
   npm run dev:https
   ```
2. Open Chrome or Safari on your phone and go to:
   ```text
   https://192.168.254.109:5173
   ```
3. Accept the one-time self-signed certificate warning (*Advanced* $\rightarrow$ *Proceed*).

### Method B: Web Browser over Mobile Data (Remote Access)

1. Start a second tunnel pointing to Vite (port 5173):
   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5173
   ```
2. Cloudflare will give you a web tunnel URL (e.g. `https://xxxx.trycloudflare.com`).
3. Open that URL on any remote device in Chrome or Safari. Vite automatically forwards all `/api` requests to FastAPI.

---

## 5. Seed Test Accounts

| Role                         | Email                     | Password                                     |
| :--------------------------- | :------------------------ | :------------------------------------------- |
| **Citizen / Resident** | `citizen@straysafe.com` | `change_this_seed_password`                |
| **Subdivision Leader** | `leader@straysafe.com`  | `change_this_seed_password`                |
| **Barangay Staff**     | `staff@straysafe.com`   | `change_this_seed_password`                |
| **Administrator**      | `admin@straysafe.com`   | *(Password set during seed / in `.env`)* |

---

## 6. How the System Works Under the Hood

```
[ Phone (4G/5G / Remote Wi-Fi) ]
        │
        │ HTTPS (Port 443)
        ▼
[ Cloudflare Singapore Edge (sin17) ]
        │
        │ Encrypted Outbound QUIC/HTTP2 Pipe
        ▼
[ Laptop (cloudflared.exe) ]
        │
        ├──► FastAPI (Port 8000) ──► MySQL (127.0.0.1:3306 - STRICTLY PRIVATE)
        │
[ Direct Offloading (Bypasses Tunnel) ]
        ├──► Cloudinary CDN (Animal photos upload directly from phone to Cloudinary)
        └──► OpenStreetMap / OSRM (Map tiles and GPS routing stream directly to phone)
```

1. **Outbound Tunneling**: `cloudflared` initiates an outward connection to Cloudflare. Your home Wi-Fi router allows outbound connections, so **no port forwarding or firewall pinholes are needed**.
2. **Bandwidth Savings**: When users snap 5MB photos of animals, the phone uploads directly to Cloudinary's servers. Only the tiny image URL travels through your laptop's tunnel.
3. **Database Security**: MySQL is strictly on `127.0.0.1:3306` (loopback only). No external actor can connect directly to your database.
4. **Network Resilience**: If your laptop changes Wi-Fi or connects to a phone hotspot, `cloudflared` automatically reconnects in 2–5 seconds.

---

## 7. Troubleshooting & Common Questions

| Question / Problem                                | Solution                                                                                                                                                                                                    |
| :------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Could not reach server" in APK**         | Ensure Terminal 1 (Backend) and Terminal 3 (Tunnel) are running on your laptop. Verify the URL typed into Server Settings starts with `https://`.                                                         |
| **Laptop restarted or terminal closed**     | Quick Tunnel URLs change upon restart. Run Terminal 3 again, copy the newly generated `https://xxxx.trycloudflare.com` URL, and paste it into the APK's Server Settings.                                  |
| **Photos not analyzing with AI**            | Ensure Terminal 2 (`python -m app.ai_worker`) is running in the `backend/` directory.                                                                                                                   |
| **Google Sign-In says `origin_mismatch`** | For temporary Quick Tunnels, use Email/Password login. If you want Google Sign-In permanently, upgrade to a free permanent ngrok domain or Cloudflare Named Tunnel and register it in Google Cloud Console. |
| **Do I need to rebuild the APK?**           | **NO.** You never need to rebuild the APK for IP or tunnel changes. The in-app Server Settings handles it dynamically.                                                                                |
