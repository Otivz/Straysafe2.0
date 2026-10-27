# StraySafe 2.0 – Tunnel Integration Research, Compatibility Analysis & Implementation Plan

> **Document Status**: Proposed (Research & Planning Phase)  
> **Date**: 2026-10-26  
> **Author**: Antigravity Assistant & Developer Pair  
> **Target Scope**: Remote & Mobile Testing of Local Development Stack without Cloud Deployment

---

## 1. Main Objective

Currently, StraySafe 2.0 runs locally on a development laptop using:
- **Frontend**: React 19 + Vite + TypeScript (running on port `5173`)
- **Backend**: FastAPI (Python, running on port `8000`)
- **Database**: MySQL 8.0 (running locally on port `3306`)
- **Mobile Application**: Capacitor Android (serving embedded web assets)
- **Authentication**: JWT (Access Token + HttpOnly Refresh Token) & Google Identity Services (GIS)
- **AI Processing**: Background worker (`app.ai_worker`)

### Testing Goals
1. Access StraySafe from mobile devices using 4G/5G mobile data.
2. Access the system across different external Wi-Fi networks (e.g., campus, coffee shops, home).
3. Test the native Capacitor Android application without relying on local LAN IP addresses (e.g., `192.168.254.109`).
4. Allow authorized external testers (barangay staff, subdivision leaders, citizens) to preview features remotely.
5. Maintain real-time connectivity between mobile devices and the local backend across network switches.
6. Eliminate manual IP updates whenever the laptop changes Wi-Fi networks or switches to a mobile hotspot.
7. Keep MySQL and local development workflows entirely on the laptop without cloud hosting or database migrations.

---

## 2. Research & Comparison of Tunneling Solutions

We evaluated the four leading tunneling technologies against the requirements of StraySafe 2.0:

| Evaluation Criteria | 1. Cloudflare Tunnel (`cloudflared`) | 2. ngrok | 3. Tailscale (Mesh VPN) | 4. Localtunnel / Pinggy |
| :--- | :--- | :--- | :--- | :--- |
| **Ease of Setup** | High (single binary, clean CLI) | Very High (single binary, instant command) | High (requires app install on all devices) | Extremely High (npx or SSH) |
| **Free-Tier Limits** | **Completely Free** (unlimited bandwidth, no request caps) | 1 free static domain, 1 GB/mo bandwidth cap (or 20k requests/mo limit) | Free up to 100 devices (Tailnet) | Free, but heavily throttled & frequent drops |
| **Stable / Persistent Public URLs** | **Yes** (Free permanent custom domain via Cloudflare DNS, or dynamic ephemeral `trycloudflare.com`) | **Yes** (1 free static domain per account: `xxxx.ngrok-free.app`) | **No public URL** (Private VPN IPs like `100.x.y.z` only) | **No** (URLs change every restart; phishing warning interstitials) |
| **HTTPS / TLS Support** | Automatic edge TLS from Cloudflare with trusted CA certs | Automatic edge TLS with trusted Let's Encrypt certs | Encrypted wire, but HTTPS certs require MagicDNS | Ephemeral certs; triggers browser security warnings |
| **React + Vite Compatibility** | Seamless (supports Host header rewriting and HMR WebSockets) | Supported (requires `ngrok-skip-browser-warning` header or host bypass) | Works, but requires VPN active on mobile device | Poor (often breaks WebSocket HMR) |
| **FastAPI Compatibility** | Full support (HTTP/1.1, HTTP/2, streaming, async endpoints) | Full support | Full support | Poor (timeouts on large multipart payloads) |
| **Capacitor Android Compatibility** | **Flawless** (standard HTTPS REST calls over public web) | **Requires workaround** (free tier injects HTML interstitial page on GET requests unless headers are set) | **Poor for testers** (every tester must install Tailscale app & log into your private network) | Breaks Capacitor requests due to warning page |
| **Google OAuth (GIS) Compatibility** | **Excellent** (Stable HTTPS domain satisfies Google's strict authorized JavaScript origin requirements) | **Good** (Works with the 1 free static domain; breaks if using random dynamic URLs) | **Incompatible** (Google rejects private IPs and `.ts.net` origins without custom domains) | Incompatible (URLs regenerate on disconnect) |
| **WebSocket & Push Notifications** | Native WebSocket proxying + valid TLS context for Web Push VAPID | Native WebSocket proxying | Supported over VPN, but Web Push requires public origin | Flaky WebSocket support |
| **Security & Isolation** | **Best-in-class** (Zero open inbound ports, DDoS mitigation, optional Cloudflare Access email/PIN gates) | High (Outbound tunnel, token auth) | Highest internal privacy, but zero external accessibility | Weak (anyone who guesses URL can access) |
| **Latency & Performance** | **Fastest** (routed over Cloudflare's global anycast backbone) | Fast (regional servers) | Peer-to-peer (optimal if direct, but relays if NAT restricted) | Slow, high packet loss |
| **Reliability on Network Switch** | **Automatic reconnect** within 2-5 seconds when laptop switches Wi-Fi/hotspot | Automatic reconnect within 3-5 seconds | Automatic mesh re-routing | Requires manual restart of process |

### Architectural Recommendation

#### Primary Recommendation: Cloudflare Named Tunnel (`cloudflared`)
- **Zero Cost & Unlimited Bandwidth**: No quotas on animal photo uploads or AI inference payloads.
- **Permanent, Branded Endpoint**: Clean custom domain mapping (e.g., `api.straysafe.yourdomain.com`).
- **Zero Interstitials**: Directly serves native mobile apps and API clients without injected HTML warnings.
- **Unified Ingress Configuration**: Routes both Vite frontend (`localhost:5173`) and FastAPI backend (`localhost:8000`) through one lightweight daemon.

#### Secondary / Zero-Domain Alternative: ngrok with 1 Free Static Domain
- Best if you do not own a domain name and want immediate setup via `straysafe.ngrok-free.app`.
- Free static domain prevents daily Google OAuth reconfiguration.

#### Rejected Solution: Tailscale
- Requires every tester, subdivision leader, and citizen to download the Tailscale app and authenticate into a private VPN network. Not viable for real-world user testing.

---

## 3. Existing Project Codebase Audit

We audited the active StraySafe 2.0 repository to identify potential roadblocks when routing through an external tunnel:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                STRAYSAFE 2.0 ARCHITECTURE                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   [Mobile Phone / Remote Testers]                                                      │
│        │                                                                               │
│        │ HTTPS (Port 443)                                                              │
│        ▼                                                                               │
│   [Cloudflare Anycast Edge / ngrok]                                                    │
│        │                                                                               │
│        │ Encrypted Outbound Tunnel (Bypasses Router / NAT / CGNAT)                     │
│        ▼                                                                               │
│   [Developer Laptop (Windows)]                                                         │
│   ├── cloudflared / ngrok daemon                                                       │
│   │        │                                                                           │
│   │        ├─── (Reverse Proxy) ──► Vite Frontend (Port 5173)                          │
│   │        │                               │                                           │
│   │        │                               ▼ (/api proxy)                              │
│   │        └─── (Reverse Proxy) ──► FastAPI Backend (Port 8000)                        │
│   │                                        │                                           │
│   │                                        ▼ (Internal Loopback Only)                  │
│   │                                 MySQL Database (Port 3306 - STRICTLY PRIVATE)      │
│   │                                                                                    │
│   └── Direct Cloud Services (Bypasses Tunnel):                                         │
│            ├── Cloudinary CDN (Direct client-side animal photo uploads)                │
│            ├── OSRM / OpenStreetMap (Direct map tiles & GPS routing)                   │
│            └── Google Identity Services (OAuth token exchange)                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Frontend API Base URLs & Dynamic Server Switcher
- **Inspected Files**:
  - `frontend/src/utils/serverAddress.ts`
  - `frontend/src/utils/api.ts`
  - `frontend/src/components/ServerSettings.tsx`
- **Current Logic**:
  - In web browsers: API calls use the relative path `/api`, routed through the Vite dev server proxy to `http://127.0.0.1:8000`.
  - In Capacitor native app (`isNativeApp() === true`): API calls use the address stored in `localStorage.getItem('straysafe_server_address')`.
- **Identified Bug in `normalizeServer()` (`serverAddress.ts` line 49-53)**:
  - If a user inputs a domain without specifying a port (e.g., `api.straysafe.com`), `normalizeServer()` automatically appends `:8000`.
  - Public tunnels listen on HTTPS port 443, not 8000. Appending `:8000` causes mobile connections to fail.
  - *Fix needed*: Update `normalizeServer()` to omit `:8000` when the address is a public HTTPS domain.

### 3.2. Backend CORS Configuration
- **Inspected File**: `backend/app/main.py` (lines 1667-1679)
- **Current Logic**:
  - `allow_origin_regex` explicitly whitelists only `localhost`, `127.0.0.1`, and private LAN IP ranges (`192.168.*`, `10.*`, `172.16-31.*`).
  - Web browser clients accessing the frontend via a tunnel domain (`https://*.trycloudflare.com` or `https://*.ngrok-free.app`) will be blocked by CORS unless the domain is added to `CORS_ALLOWED_ORIGINS` in `.env` or matched in the regex.
  - Native Capacitor Android requests use `Origin: http://localhost` (configured in `capacitor.config.ts`), so native Android is currently accepted.

### 3.3. Vite Development Server Host Restrictions
- **Inspected File**: `frontend/vite.config.ts` (line 31)
- **Current Logic**:
  - Configured with `allowedHosts: ['.sslip.io']`.
  - Vite 5+ blocks incoming HTTP requests with an unrecognized `Host` header (`403 Invalid Host header`).
  - Accessing the Vite frontend via a Cloudflare or ngrok tunnel will trigger this block.
  - *Fix needed*: Add `allowedHosts: true` (or the specific tunnel domain) to `vite.config.ts`.

### 3.4. Environment Variables & Authentication Cookies
- **Inspected File**: `.env.example`
- **Current Logic**:
  - `COOKIE_SECURE=false`: Allows refresh token cookies over plain HTTP for LAN testing.
  - If frontend and backend are served on different subdomains over HTTPS, cross-site cookie restrictions apply (`SameSite=None; Secure`).
  - *Unified Ingress Strategy*: By routing the frontend and proxying `/api` through a single domain, all requests remain strictly **same-origin**, preventing cookie drop issues.
  - The native Android app passes tokens via the `X-Refresh-Token` header and is unaffected by browser cookie policies.

### 3.5. Google OAuth (Google Identity Services)
- **Inspected Files**:
  - `frontend/src/components/GoogleSignInButton.tsx`
  - `backend/app/routes/auth.py`
- **Current Logic**:
  - Google Identity Services requires explicit registration of Authorized JavaScript Origins in Google Cloud Console.
  - Google rejects wildcards. Using temporary, randomly generated tunnel URLs would require updating Google Cloud Console on every tunnel restart.
  - A persistent domain (Cloudflare named tunnel or ngrok static domain) resolves this issue.

### 3.6. Media Uploads & Cloudinary CDN
- **Inspected Files**:
  - `frontend/src/utils/cloudinaryUpload.ts`
  - `backend/app/services/cloudinary_service.py`
- **Current Logic**:
  - Animal incident photos and pet verification photos upload **directly from the client to Cloudinary's REST API** (`api.cloudinary.com`).
  - High-resolution images do not pass through the local laptop tunnel, preserving local bandwidth and keeping tunnel latency minimal.

### 3.7. Map Rendering & Geolocation
- **Inspected Files**:
  - `frontend/src/components/RoutingControl.tsx`
  - Leaflet map views
- **Current Logic**:
  - Tile layers stream directly from OpenStreetMap / CartoDB CDNs.
  - Route calculation queries `https://router.project-osrm.org`.
  - Device geolocation uses native Android GPS (`ACCESS_FINE_LOCATION`).
  - Maps and routing remain 100% operational over the tunnel.

### 3.8. Web Push Notifications
- **Inspected File**: `frontend/src/utils/push.ts`
- **Current Logic**:
  - Web Push service workers (`/sw.js`) require a Secure Context (`window.isSecureContext === true`).
  - Over plain LAN HTTP (`http://192.168.254.109:5173`), mobile browsers reject push registration.
  - The HTTPS tunnel provides valid SSL certificates, enabling push notifications on remote mobile browsers.

### 3.9. Database Isolation & Security
- **Inspected File**: `backend/app/database/session.py`
- **Current Logic**:
  - FastAPI connects to MySQL locally via `localhost:3306`.
  - The tunnel forwards only HTTP/HTTPS traffic to ports 5173 and 8000.
  - MySQL port 3306 is not exposed to the public internet.

---

## 4. Mobile Application Compatibility

### 4.1. Does the APK need to be rebuilt?
**No.** An APK rebuild is not required.
StraySafe contains an in-app server address configuration screen (`ServerSettings.tsx`) on the login view. Testers can tap the settings icon, input the tunnel address (e.g., `https://straysafe-api.yourdomain.com`), and tap **Test Connection**. The app stores the address in `localStorage` and redirects all subsequent API calls.

### 4.2. Mobile Data Compatibility
The application functions on mobile cellular data (4G/5G). The mobile carrier resolves the tunnel domain via public DNS, routing requests through the provider edge to the local development laptop.

### 4.3. Google Sign-In Behavior
- **Web App**: Operates once the tunnel domain is added to Authorized JavaScript Origins in Google Cloud Console.
- **Capacitor Android**: Operates inside the WebView using origin `http://localhost`, which remains authorized in Google Cloud Console.

### 4.4. Hardware Features (Camera, GPS, Storage)
Camera capture, gallery selection, and GPS geolocation communicate directly with native Android system APIs via Capacitor plugins. Their functionality is completely decoupled from the network transport layer.

### 4.5. Disconnection Handling
If the laptop disconnects or enters sleep mode:
- Ongoing API requests fail with a network error toast.
- Once the laptop reconnects to the internet, the tunnel daemon restores the connection within 2–5 seconds without requiring an application restart.

---

## 5. Network Switching Analysis

| Scenario | Behavior | Accessibility Verdict |
| :--- | :--- | :--- |
| **Scenario A: Laptop on Home Wi-Fi, Phone on Mobile Data** | The phone queries public DNS and reaches the edge tunnel. The tunnel forwards traffic to the laptop. | **Accessible.** Core testing scenario. |
| **Scenario B: Laptop on Mobile Hotspot, Phone on another network** | Mobile hotspots enforce Carrier-Grade NAT (CGNAT), blocking inbound ports. The tunnel uses outbound connections to bypass CGNAT entirely. | **Accessible.** No router configuration needed. |
| **Scenario C: Laptop switches from Wi-Fi A to Wi-Fi B** | The tunnel daemon drops the active session and establishes a new outbound tunnel within 2–5 seconds. The public URL does not change. | **Accessible.** No IP reconfiguration required on client devices. |
| **Scenario D: Authorized testers in different physical locations** | Testers access the public HTTPS URL from any network worldwide. | **Accessible.** Protected by application authentication. |

---

## 6. Security & Data Privacy (RA 10173)

Because StraySafe handles citizen reports, contact details, and geolocation data, exposing a development machine requires specific safeguards:

1. **MySQL Loopback Binding**: Verify MySQL binds strictly to `127.0.0.1` (`bind-address = 127.0.0.1`). Never map port 3306 in tunnel ingress configs.
2. **API Documentation Exposure**: In development mode, FastAPI serves Swagger UI at `/docs`. When exposing via a public tunnel, disable `/docs` or restrict access.
3. **Rate Limiting**: StraySafe's existing `slowapi` limiter protects the local laptop CPU and database connection pool from excessive external requests.
4. **Cloudflare Zero Trust (Optional)**: Cloudflare Access can enforce an email OTP gate in front of the tunnel, restricting access to authorized testers before requests reach the laptop.

---

## 7. Recommended Implementation Plan

### 7.1. Required Code & Configuration Adjustments

When authorized, the following adjustments will be applied:

1. **Vite Development Server** (`frontend/vite.config.ts`):
   ```typescript
   // Allow tunnel hosts to connect to Vite dev server
   server: {
     host: '0.0.0.0',
     port: 5173,
     allowedHosts: true, // or specific ['.trycloudflare.com', '.ngrok-free.app']
     // ...
   }
   ```

2. **FastAPI CORS Settings** (`backend/app/main.py`):
   - Update `allow_origin_regex` or read from `CORS_ALLOWED_ORIGINS` in `.env` to permit the tunnel domain.

3. **Server Address Normalizer** (`frontend/src/utils/serverAddress.ts`):
   - Prevent `normalizeServer()` from appending `:8000` to public HTTPS URLs.

4. **Google Cloud Console**:
   - Add the permanent tunnel URL to **Authorized JavaScript Origins**.

---

### 7.2. Step-by-Step Setup Instructions

#### Option A: Cloudflare Tunnel (Recommended)
1. Install `cloudflared` on Windows:
   ```powershell
   winget install Cloudflare.cloudflared
   ```
2. For an instant temporary URL (Quick Tunnel):
   ```powershell
   cloudflared tunnel --url http://localhost:5173
   ```
3. For a permanent custom domain (Named Tunnel):
   ```powershell
   cloudflared tunnel login
   cloudflared tunnel create straysafe-tunnel
   ```
4. Configure ingress rules (`config.yml`):
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: <path-to-credentials.json>
   ingress:
     - hostname: app.yourdomain.com
       service: http://localhost:5173
     - hostname: api.yourdomain.com
       service: http://localhost:8000
     - service: http_status:404
   ```
5. Run the tunnel:
   ```powershell
   cloudflared tunnel run straysafe-tunnel
   ```

#### Option B: ngrok Free Static Domain (Zero-Domain Alternative)
1. Install `ngrok` and claim your 1 free static domain from the ngrok dashboard:
   ```powershell
   ngrok config add-authtoken <your-token>
   ```
2. Start the tunnel:
   ```powershell
   ngrok http --url=straysafe-dev.ngrok-free.app 5173
   ```

---

### 7.3. Verification Checklist

- [ ] Verify MySQL port 3306 is unreachable from outside the local machine.
- [ ] Connect mobile phone to 4G/5G data (Wi-Fi turned off).
- [ ] Open web browser on mobile phone, navigate to tunnel URL, confirm frontend renders.
- [ ] Open StraySafe Android APK on mobile phone.
- [ ] Open **Server Settings** on the login screen, enter backend tunnel URL, verify green "Connection Successful" toast.
- [ ] Perform citizen login with email/password.
- [ ] Perform Google Sign-In on web and mobile.
- [ ] Submit an incident report with camera photo; verify photo uploads to Cloudinary and record inserts into local MySQL.
- [ ] Test GPS pin placement on map.
- [ ] Switch laptop network from Wi-Fi to mobile hotspot; verify tunnel reconnects within 5 seconds without restarting Vite or FastAPI.

---

### 7.4. Limitations & Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `Invalid Host header` | Vite rejects external Host header | Set `allowedHosts: true` in `frontend/vite.config.ts`. |
| `CORS Error` on web browser | FastAPI rejects tunnel origin | Add tunnel origin to `CORS_ALLOWED_ORIGINS` in `.env`. |
| `ERR_CONNECTION_REFUSED` in APK | `:8000` port appended to HTTPS URL | Remove `:8000` from URL in Server Settings; verify `serverAddress.ts` patch. |
| `origin_mismatch` in Google OAuth | Domain missing from Google Cloud Console | Add tunnel URL to Google Cloud Console Authorized JavaScript Origins. |
| Tunnel drops when laptop is idle | Windows power saving suspends Wi-Fi | Set Windows Power Options to keep network active when lid is closed. |
