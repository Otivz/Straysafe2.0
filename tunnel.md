# StraySafe 2.0 – Cloudflare Tunnel Setup & Mobile Connection Guide

> **Status**: Configured (Cloudflare Quick Tunnel, the preferred development tunnel)
> **Last Updated**: 2026-11-09
> **Applies to**: Remote Mobile Testing (4G/5G, External Wi-Fi, Android debug APK & Mobile Browsers)

---

## 1. Quick Reference

* **Tunnel Type**: Cloudflare Quick Tunnel (Outbound Encrypted QUIC/HTTP2) – the preferred development tunnel
* **Tunnel command**:
  ```powershell
  cloudflared tunnel --url http://localhost:8000
  ```
* **Public URL**: **new every time the tunnel starts.** `cloudflared` prints it as `https://<random-words>.trycloudflare.com`; copy it from that terminal. There is no permanent URL, so never reuse one from an earlier run or from a document.
* **Target Local Service**: FastAPI Backend (`http://localhost:8000`)
* **Database Isolation**: Local MySQL (`127.0.0.1:3306`) – **STRICTLY PRIVATE** (never exposed to the internet)
* **Binary Location**: `C:\Program Files (x86)\cloudflared\cloudflared.exe` (it is on the PATH, so `cloudflared` works in any terminal)

---

## 2. Daily Workflow: Starting the System on Your Laptop

Whenever you want to test StraySafe on your phone, open these terminal windows on your laptop. Run every command from the **repository root** (the folder that contains `backend/` and `frontend/`), wherever it is on your computer:

### 🖥️ Terminal 1: FastAPI Backend

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> ✅ *Running on: `http://0.0.0.0:8000`*

### 🧠 Terminal 2: AI Background Worker

```powershell
cd backend
..\.venv\Scripts\python.exe -m app.ai_worker
```

> ✅ *Processes photo authenticity checks, breed recognition, and stray matching.*

### 🌐 Terminal 3: Cloudflare Quick Tunnel (Keeps Mobile Connected)

```powershell
cloudflared tunnel --url http://localhost:8000
```

> After a few seconds `cloudflared` prints a box containing a URL like `https://<random-words>.trycloudflare.com`. **Copy that URL** – it is the backend address you give the app. Keep this terminal open; closing it (or pressing Ctrl+C) stops the tunnel.
>
> **Each Quick Tunnel restart generates a new HTTPS URL.** The old one stops working, so after any restart copy the new URL and enter it in the app again (section 3).
>
> *Quick check:* open the URL in the phone's browser. It should show `{"message":"Welcome to StraySafe API"}`.

### 💻 Terminal 4: Frontend Vite Server (Only for Phone Web Browser Testing)

```powershell
cd frontend
npm run dev -- --host
```

---

## 3. How to Connect the Android App (Debug APK) on Your Phone

The debug APK (built by the **Build Android APK** GitHub workflow, see [docs/05-operations/ANDROID_RESIDENT_APP.md](docs/05-operations/ANDROID_RESIDENT_APP.md)) has all frontend files bundled inside the app, so it **only needs a backend address**. It works on **Mobile Cellular Data (4G/5G)** or any Wi-Fi network, and **you never rebuild the APK for a new tunnel URL**: the address is typed into the app's **Developer Connection Settings**.

### Steps:

1. **On your laptop**: start Terminal 1 (backend) and Terminal 3 (tunnel), and copy the `https://….trycloudflare.com` URL that Terminal 3 printed.
2. **On your phone**: turn **OFF** Wi-Fi and turn **ON** Mobile Data (4G/5G), or connect to any Wi-Fi.
3. Open the **StraySafe** debug APK.
4. Open **Connection Settings**, any one of these ways:
   * tap **Connection** in the amber **"Debug build · …"** bar at the top of any screen (it is there on Welcome and Sign in, before you log in);
   * after signing in: **Settings → Developer → Developer connection**;
   * on the very first launch with no address built in, the app opens straight on **Connect to a backend**.
5. In **Backend API address**, enter the tunnel URL (it must be `https://…`; a trailing slash is removed, and `http://` is refused for an internet address).
6. Tap **Test connection**. It should say **Reachable**. If it does not, see the troubleshooting table below.
7. Tap **Save & connect**. If the app is already connected to another backend, confirm **Switch backend**.
8. The app reloads on Welcome. **Switching backend signs you out and clears what the app stored for the previous backend**, so sign in again.

> `localhost` and `127.0.0.1` on a phone mean the phone itself, so the app refuses them. Use the tunnel URL (or, on the same Wi-Fi, `http://<laptop Wi-Fi IP>:8000`).

---

## 4. How to Open on Mobile Web Browser (Chrome / Safari)

If someone does not have the APK and wants to open StraySafe in their phone's mobile browser:

### Method A: Phone and Laptop on the SAME Wi-Fi (Fastest for local testing)

1. Start frontend in HTTPS mode (enables mobile camera, QR scanner, and GPS permissions), from the repository root:
   ```powershell
   cd frontend
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
   cloudflared tunnel --url http://localhost:5173
   ```
2. Cloudflare will give you a web tunnel URL (e.g. `https://xxxx.trycloudflare.com`). It is a different URL from the backend tunnel's, and it also changes on every restart.
3. Open that URL on any remote device in Chrome or Safari. Vite automatically forwards all `/api` requests to FastAPI.

---

## 5. Accounts for testing

There are no seed accounts and no shared test password. Sign in with an account you created: residents sign up in the app, and the first Subdivision Leader is created with `backend/scripts/seed_admin.py --leader` (see [setup.md](setup.md), section 4).

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
| **"Could not reach server" in APK**         | Ensure Terminal 1 (Backend) and Terminal 3 (Tunnel) are running on your laptop. Open the tunnel URL in the phone's browser (it should show `Welcome to StraySafe API`), then in the APK open **Connection** → **Test connection**. The URL must start with `https://`. |
| **Laptop restarted or terminal closed**     | Every Quick Tunnel restart generates a new HTTPS URL and the old one stops working. Run Terminal 3 again, copy the newly generated `https://xxxx.trycloudflare.com` URL, and enter it in the debug APK's **Connection Settings** (section 3). Switching signs you out, so sign in again. |
| **Photos not analyzing with AI**            | Ensure Terminal 2 (`python -m app.ai_worker`) is running in the `backend/` directory.                                                                                                                   |
| **Google Sign-In says `origin_mismatch`** | For temporary Quick Tunnels, use Email/Password login. If you want Google Sign-In permanently, upgrade to a free permanent ngrok domain or Cloudflare Named Tunnel and register it in Google Cloud Console. |
| **Do I need to rebuild the APK?**           | **NO.** You never need to rebuild the APK for IP or tunnel changes. The debug APK's Connection Settings handles it dynamically.                                                                       |
