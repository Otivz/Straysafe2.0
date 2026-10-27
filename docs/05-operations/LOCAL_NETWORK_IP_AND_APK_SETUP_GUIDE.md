# StraySafe 2.0 – Local Network IP & Mobile APK Setup Guide

> **Document Status**: Current (Local Testing & Operations)  
> **Target Audience**: Developers, Testers, Demonstrators  
> **Prerequisites**: Laptop and mobile phone connected to the **SAME Wi-Fi network** (or phone connected to laptop mobile hotspot)

---

## 1. Quick Summary: Do You Need to Rebuild the APK?

> [!IMPORTANT]
> **NO APK REBUILD IS REQUIRED when changing Wi-Fi networks!**  
> StraySafe 2.0 has an in-app **Server Settings** switcher built directly into the login screen. Whenever your laptop gets a new IP (at home, school, coffee shop, or office), you only need to type the new IP inside the installed app on your phone. It tests the connection, saves it, and reloads automatically in seconds.

---

## 2. Step 1: Find Your PC's Wi-Fi IPv4 Address

When your laptop connects to a Wi-Fi network, the router assigns it a private local IP (typically `192.168.x.x` or `10.x.x.x`).

### Method A: Fast PowerShell One-Liner (Recommended)
Open PowerShell on your laptop and run:
```powershell
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*").IPAddress
```
*This outputs your exact Wi-Fi IP directly (e.g. `192.168.254.109`).*

### Method B: Standard `ipconfig`
1. Open PowerShell or Command Prompt.
2. Run:
   ```cmd
   ipconfig
   ```
3. Scroll to the section named **Wireless LAN adapter Wi-Fi** (or **Wi-Fi**).
4. Note the **IPv4 Address** (e.g., `192.168.254.109`).

> [!WARNING]
> Do **NOT** use IPv4 addresses from adapters named `vEthernet (WSL)`, `VirtualBox`, `VMware`, `Tailscale`, or `Bluetooth`. Only use the address under your physical **Wi-Fi** adapter.

---

## 3. Step 2: Start the Local Backend & AI Worker

For your phone to reach the server, the backend must listen on all network interfaces (`0.0.0.0`), not just `127.0.0.1`.

### 1. Start the FastAPI Backend
Open a terminal in the project root:
```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*(For presentations or demo speed tests without interruption, remove `--reload`)*.

### 2. Start the AI Worker (Second Terminal)
```powershell
cd backend
..\.venv\Scripts\python.exe -m app.ai_worker
```

### 3. Verify Backend is Accessible
Open your laptop browser and check:
- `http://localhost:8000/` $\rightarrow$ should display `{"message":"Welcome to StraySafe API"}`
- `http://<YOUR_PC_IP>:8000/` (e.g. `http://192.168.254.109:8000/`) $\rightarrow$ should display the exact same message.

---

## 4. Step 3: Change the IP Inside the Existing Android APK

You do **not** need Android Studio or a computer cable to update the IP.

```
┌────────────────────────────────────────────────────────┐
│                   STRAYSAFE LOGIN                      │
│                                                        │
│  [ Email / Username Input ]                            │
│  [ Password Input ]                                    │
│  [ Sign In Button ]                                    │
│                                                        │
│  [ G  Sign In with Google ]                            │
│                                                        │
│  ────────────────────────────────────────────────────  │
│  ⚙️ Server settings (192.168.254.100:8000)   ◄── TAP!  │
└────────────────────────────────────────────────────────┘
```

1. Connect your Android phone to the **same Wi-Fi** as your laptop.
2. Open the **StraySafe** app on your phone.
3. On the Login screen (Citizen or Barangay/Admin), look at the bottom for:
   **`Server settings (<current-ip>)`** (with a server icon).
4. Tap **Server settings**. A modal popup will appear:
   - In the text field, enter your PC's current Wi-Fi IPv4 address (e.g., `192.168.254.109`).
   - *Note: You do not need to type `http://` or `:8000`—the app automatically formats it and adds port `8000`.*
5. Tap **SAVE**.
6. The app will immediately test the address:
   - If reached, you will see a green checkmark:  
     `✓ StraySafe server found at http://192.168.254.109:8000. Reloading...`
   - The app reloads within 1 second and is immediately connected to your laptop!

---

## 5. Step 4: Testing via Mobile Browser (Alternative)

If you want to test from your phone's web browser (Chrome or Safari) instead of the installed APK:

### Option A: Standard Dev Server
1. On your laptop, start Vite with the `--host` flag:
   ```powershell
   cd frontend
   npm run dev -- --host
   ```
2. On your phone's browser, navigate to:
   ```text
   http://<YOUR_PC_IP>:5173
   ```
   *(e.g., `http://192.168.254.109:5173`)*.
3. *Limitation*: Browsers block camera (QR scanner) and GPS geolocation on insecure HTTP.

### Option B: HTTPS Dev Server (Enables Mobile Camera & GPS)
1. On your laptop, start Vite in HTTPS mode:
   ```powershell
   cd frontend
   npm run dev:https
   ```
2. On your phone's browser, navigate to:
   ```text
   https://<YOUR_PC_IP>:5173
   ```
3. Accept the one-time self-signed certificate warning:
   - **Chrome**: Tap *Advanced* $\rightarrow$ *Proceed to `<IP>` (unsafe)*.
   - **Safari**: Tap *Show Details* $\rightarrow$ *Visit this website*.
4. *Advantage*: Vite proxies `/api` calls directly to `127.0.0.1:8000`, so no second certificate or backend HTTPS setup is needed.

---

## 6. Step 5: When and How to Rebuild the APK (Only If Needed)

You only need to rebuild the APK in two specific situations:
1. You made changes to frontend UI / React TypeScript code and want the APK to include the new code.
2. You want a fresh APK to have a new **default fallback IP** baked in before installing it on other devices.

### Rebuilding Steps:

1. **Update `.env` in the project root**:
   ```env
   VITE_API_BASE_URL=http://<YOUR_PC_IP>:8000
   ```
   *(e.g., `VITE_API_BASE_URL=http://192.168.254.109:8000`)*.

2. **Build and Sync Frontend Assets into Android Project**:
   Open a terminal in `frontend/` and run:
   ```powershell
   cd frontend
   npm run cap:build
   ```
   *(This executes `tsc -b && vite build` and then `npx cap sync android`).*

3. **Build the APK**:
   - **Via Android Studio**:
     ```powershell
     npm run cap:open
     ```
     In Android Studio: Click **Build** $\rightarrow$ **Build Bundle(s) / APK(s)** $\rightarrow$ **Build APK(s)**.
   - **Via Command Line (Gradle)**:
     ```powershell
     cd android
     .\gradlew assembleDebug
     ```
   - The compiled APK will be located at:
     `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 7. Windows Defender Firewall (The #1 Cause of Connection Failure)

If your phone says **"No answer"** or **"Could not connect"** even though the IP is correct, Windows Firewall is blocking incoming connections.

### Fix 1: Ensure Your Wi-Fi Network is Set to "Private"
By default, Windows sets new Wi-Fi connections to "Public", which aggressively blocks all incoming local connections.
1. Open Windows **Settings** $\rightarrow$ **Network & internet** $\rightarrow$ **Wi-Fi**.
2. Click on your connected Wi-Fi network.
3. Under **Network profile type**, select **Private network** (instead of Public).

### Fix 2: Allow Ports 8000 and 5173 in Windows Firewall (PowerShell)
Run PowerShell as Administrator and execute:
```powershell
New-NetFirewallRule -DisplayName "StraySafe Backend (8000)" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "StraySafe Frontend (5173)" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
```

---

## 8. Troubleshooting Matrix

| Problem / Error | Cause | Solution |
| :--- | :--- | :--- |
| **"No answer. Check the IP, that the phone is on the same Wi-Fi..."** | Phone and laptop are on different networks, or Windows Firewall is blocking port 8000. | 1. Ensure phone Wi-Fi is connected to the same SSID as laptop.<br>2. Turn off mobile data on the phone temporarily so it doesn't bypass Wi-Fi.<br>3. Check Windows Firewall (see Section 7). |
| **"Could not connect. Check the IP and that the backend is running with --host 0.0.0.0"** | FastAPI was started without `--host 0.0.0.0`. | Restart backend with: `..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`. |
| **"Something answered at this address, but it is not the StraySafe server"** | Another service on your network is using port 8000, or you entered the wrong IP. | Run `ipconfig` again and verify the exact Wi-Fi IPv4 address. |
| **Phone can access `http://<IP>:8000/` in Chrome, but APK says connection failed** | Android Cleartext traffic restriction or cached bad server. | In the APK Server Settings, tap **Use default**, then re-type the IP and tap Save. |
| **Google Sign-In shows `origin_mismatch`** | Google Cloud Console does not recognize the new local IP. | For local LAN testing, use standard Email/Password accounts (e.g. `citizen@straysafe.com`), or add `http://<YOUR_IP>:5173` to Authorized JavaScript Origins in Google Cloud Console. |
| **IP changes every day** | Router DHCP lease expires and assigns a new IP. | Option A: In the APK, tap Server Settings and update the IP in 10 seconds.<br>Option B: In your home Wi-Fi router settings, reserve a static DHCP IP for your laptop.<br>Option C: Turn on laptop Mobile Hotspot and connect phone to laptop hotspot (IP will consistently be `192.168.137.1`). |
