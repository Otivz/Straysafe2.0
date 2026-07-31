# 🛠️ StraySafe 2.0: Missing Features & System Improvements

This document lists critical gaps, architectural vulnerabilities, and recommended functional improvements for the StraySafe 2.0 system. Fulfilling these recommendations will elevate the platform from a basic reactive reporting app to a robust, enterprise-grade safety network.

---

## 1. 🤖 Artificial Intelligence & YOLO Enhancements

### 🚫 The "Single-Animal" Constraint on Roaming Packs
*   **Current Issue:** The YOLO validation endpoint (`backend/app/routes/reports.py:613-618`) rejects reports where `animal_count > 1` with the error: `"Multiple animals were detected in one or more uploaded images. Please upload images containing only one animal per report."`
*   **Impact:** A primary report category in the system is **"Roaming Pack"**. Under the current logic, if a citizen takes a photo of a pack of stray dogs, the AI validator will block the report submission.
*   **Recommended Improvement:** 
    *   Allow images with multiple animals.
    *   If `animal_count > 1` is detected, automatically map the report category to "Roaming Pack", raise the priority level to "High" or "Emergency", and accept the report instead of throwing a validation error.

### 🌃 AI Vision Accuracy in Dark & Low-Light Conditions
*   **Current Issue:** Citizen photos of strays are often captured at night. Standard object detectors like YOLOv8n struggle with low exposure, resulting in false negatives or incorrect species classification.
*   **Recommended Improvement:**
    *   **Low-Light Pre-Processing Pipeline:** Apply contrast adjustments (e.g., CLAHE - Contrast Limited Adaptive Histogram Equalization) or run a fast low-light enhancement model (like Zero-DCE) on the backend before feeding the image to YOLOv8.
    *   **Manual Bounding Box / Override Interface:** If the AI confidence falls below a certain threshold (e.g., < 45%), instead of rejecting the report, present the user with a prompt: *"We couldn't clearly identify the animal due to dark lighting. Please tap on the photo to confirm the location of the animal."*

---

## 2. 🔐 Security, Authentication & Session Integrity

### ⚠️ Impersonation & Fake Session Spoofing
*   **Current Issue:** The login endpoint (`backend/app/routes/auth.py:83-97`) returns raw user objects directly to the client. The frontend stores this user object in local storage and validates session status through `GET /auth/verify-session/{user_id}`, which simply checks if the user ID exists in the database.
*   **Impact:** Any user can modify their local storage `resident_user` or intercept requests to spoof `user_id` and gain unauthorized access to leader, staff, or admin routes/actions.
*   **Recommended Improvement:**
    *   **JWT Implementation:** Refactor the auth system to return signed, secure, and encrypted JSON Web Tokens (JWT) containing standard claims (expiration date, user ID, role permissions).
    *   **Route Guards:** Secure FastAPI endpoints using standard dependency injection (e.g., `Depends(get_current_active_user)` validating the JWT signature).

### 🛡️ Rate Limiting & Security Hardening
*   **Current Issue:** The public endpoints (like reporting a stray or logging in) have no rate limits, making them vulnerable to spam reporting or brute-force logins.
*   **Recommended Improvement:**
    *   Implement `slowapi` on report creation, registration, and login routes.
    *   Add standard security header middleware in FastAPI (e.g., `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`).

---

## 3. 🐕 Citizen Dashboard & User Experience

### 📢 Static Announcements vs. Urgent Updates
*   **Current Issue:** The Citizen Home Feed splits reports and announcements but lacks a unified, high-impact alerts panel for active hazards.
*   **Recommended Improvement:**
    *   Add an **"Urgent Alerts & Safety Bulletins"** panel at the top of the Resident Home Feed (`ResiHomePage.tsx`).
    *   Show active bulletins like: *"⚠️ Alert: Subdivision Leader verified a possible rabies-risk stray near Purok 3. Please keep your pets indoors."*

### 📋 Structured Descriptions for Rescue Triaging
*   **Current Issue:** Citizens provide a freeform description box. This leads to vague reports (e.g., *"Dog near gate"*), forcing Subdivision Leaders to manually follow up.
*   **Recommended Improvement:**
    *   Add checkbox guides during reporting: 
        *   `[ ]` Animal is aggressive (growling/snarling)
        *   `[ ]` Animal is limping / visibly injured
        *   `[ ]` Animal is wearing a collar (potential lost pet)
        *   `[ ]` Animal is friendly / approachable
    *   Use this structured telemetry to automatically refine the AI-priority scoring.

---

## 4. 🏥 Post-Rescue & Stray Adoption Portal Pipeline

### 🔄 The Impoundment Dead-End
*   **Current Issue:** The holding facility module (`HoldingAnimal` model in `report.py`) tracks active animals. However, once unclaimed, there is no public pathway for these animals to be adopted.
*   **Recommended Improvement:**
    *   **Automated Adoption Catalog Feed:** After the 7-day observation/impoundment window expires, if the status remains "Healthy/Unclaimed", automatically toggle `available_for_adoption = True` and publish the animal to a new public `/adopt` portal.
    *   **Online Adoption Request Form:** Citizens can browse adoptable animals, check health records (vaccinations, age, breed), and submit an adoption application directly on the web app for Barangay Staff review.

---

## 5. 🗺️ Geofencing & QR Sighting Telemetry

### 📍 Hardcoded Subdivision Geofences
*   **Current Issue:** The coordinates verifying if a citizen is reporting from within the subdivision boundary (`SELERA_POLYGON` in `ResiHomePage.tsx`) are hardcoded in the frontend.
*   **Recommended Improvement:**
    *   Move geofence polygon coordinate arrays into the database (`subdivisions` table).
    *   Provide an interactive admin page utilizing Leaflet Draw where system admins can draw and update subdivision boundaries, saving them to the database to be retrieved dynamically by the frontend.

### 🌐 GPS Sighting Log on QR Pet Scans
*   **Current Issue:** When a lost pet's QR code is scanned, it displays pet details, but does not provide real-time locational feedback to the owner.
*   **Recommended Improvement:**
    *   On the public QR scan landing page (`/pet-scan/:qr_code`), prompt the scanner: *"📍 Share your location with the owner to help find this pet."*
    *   If browser Geolocation permission is granted, ping the backend with exact latitude/longitude, a timestamp, and an optional photo/message from the finder. This logs a new sighting pin on the owner's dashboard map.

---

## 6. 🚑 Field Rescue Operations (Barangay Staff)

### 📶 Offline Service Capabilities
*   **Current Issue:** Barangay rescue personnel carry out duties outdoors where cellular signals are often weak or non-existent, causing updates (like updating report status to `Picked Up`) to fail.
*   **Recommended Improvement:**
    *   Convert the field staff interfaces into a Progressive Web App (PWA) using `vite-plugin-pwa`.
    *   Cache active assigned rescue routes locally using IndexedDB.
    *   Allow responders to tap "Picked Up" or record visual evidence offline, and automatically sync the updates to the central FastAPI server once cellular service is restored.

### 🧭 Preventive Patrol Routing & Cluster Optimization
*   **Current Issue:** Rescues are purely reactive based on citizen reports. Map analytics only show simple heatmaps.
*   **Recommended Improvement:**
    *   Implement density-based spatial clustering (DBSCAN) on backend reports coordinates to identify active stray hotspots.
    *   Use a routing solver (e.g. Leaflet Routing Machine / OSRM) to auto-generate recommended weekly "Preventive Patrol Routes" for staff teams, optimizing fuel and resource allocation.

---

## 7. 🤝 Volunteer Coordination Network

### 👥 Leveraging Vetted Subdivision Volunteers
*   **Current Issue:** Subdivision Leaders manage validation alone. Barangay staff handle physical rescues. Vetted residents have no way to participate in low-risk helper duties.
*   **Recommended Improvement:**
    *   Create a **"Volunteer Network"** module.
    *   Subdivision Leaders can dispatch micro-tasks to neighborhood volunteers:
        *   *"🔍 Sighting Check: Verify if the stray reported on Rizal Ave is still there."*
        *   *"💧 Water/Food Station: Provide water to the injured dog on Purok 1 while the rescue team is en route."*
        *   *"📢 Lost Pet Search: Help locate the registered lost Aspin 'Bantay'."*
