# Neighbor-to-Neighbor Lost Pet Sighting Ping

- **Date:** 2026-11-02 15:51 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:**
  - backend:
    - new: `backend/app/models/lost_pet_alert.py`, `backend/app/routes/lost_pet_alerts.py`;
    - changed: `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/utils/case_closure.py`, `backend/app/utils/push_categories.py`;
    - test: `backend/tests/test_lost_pet_sighting_ping.py`;
  - frontend:
    - new: `frontend/src/utils/lostPets.ts`, `frontend/src/components/LostPets/LostPetAlertView.tsx`, `frontend/src/components/LostPets/LostPetTrackingMap.tsx`, `frontend/src/components/LostPets/SpottedHereForm.tsx`, `frontend/src/components/LostPets/LostPetAlertSummary.tsx`, `frontend/src/components/LostPets/LostPetDashboardSection.tsx`, `frontend/src/pages/citizen/ResiLostPets.tsx`, `frontend/src/pages/Subd_Leaders/SubdLostPetAlerts.tsx`;
    - changed: `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/SubdSidebar.tsx`, `frontend/src/components/Navbars/ResiNavbar.tsx`, `frontend/src/components/Navbars/SubdNavbar.tsx`, `frontend/src/utils/dataRefresh.ts`, `frontend/src/pages/citizen/ResidentPet.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdDashboard.tsx`;
    - tests: `frontend/tests/lostPets.test.mjs`, `frontend/tests/lostPets.browser.mjs`, `frontend/tests/fixtures/lostPets.html`, `frontend/tests/fixtures/lostPets.tsx`;
  - other: `Database3.3.txt`, `docs/01-system/LOST_PET_SIGHTING_PING.md`, `docs/README.md`.
- **Authorization:** Developer request in Claude Code: "STRAYSAFE 2.0 – Neighbor-to-Neighbor Lost Pet Sighting Ping". FREEZE was OFF. No Git commits.
- **Type:** Feature

## Summary

This adds community lost-pet reunification inside the subdivision:
- the owner requests a Neighborhood Alert from the Lost Pet Report form or the report page;
- the subdivision's Leader reviews and broadcasts it to the subdivision's residents;
- residents submit "Spotted Here" sightings (map pin or one-time device location after consent, reported time, optional photo and notes, accuracy confirmation);
- the owner and the Leader are notified of each sighting;
- the alert page shows the tracking map (last known location and separate sighting pins, never a route) and the sighting timeline;
- the Leader reviews sightings, closes alerts or marks the case "Resolved – Pet Reunited".

Closing the report by any path closes the alert. Sightings are kept. There is no rescue, no Barangay endorsement and no tracking. Details: `docs/01-system/LOST_PET_SIGHTING_PING.md`.

**Also corrected:** the existing Lost Pet Report confirmation said "Alert broadcast / An alert was sent to your neighborhood" although nothing was broadcast. It now says the report was filed and whether an alert was requested.

**Note:** a compiled leftover `backend/app/models/__pycache__/sighting_ping.cpython-314.pyc` (no source file, no history) was deleted. It was a stale cache file.

## Validation evidence

- **Backend:**
  - `tests/test_lost_pet_sighting_ping.py`: 51/51 on its own temporary SQLite file. It covers:
    - who may request and activate;
    - the broadcast reaching only the subdivision's residents;
    - no rescue or endorsement created;
    - privacy (no phone, email or address; neighbors see "A neighbor"; other subdivisions and Barangay staff refused);
    - sighting validation (accuracy confirmation, coverage area, future time);
    - reported time kept apart from the database submission time;
    - duplicate submission id and double tap;
    - sighting notifications with time and date;
    - photo upload (mocked) and device location;
    - map and timeline order;
    - Leader review;
    - dashboard stats;
    - "reunited" resolving the report, closing the alert and thanking the residents who reported sightings;
    - the owner's Pet Recovered closing the alert;
    - closing without resolving and requesting again;
    - the Leader preparing an alert for the owner.
  - Every backend test script that sets its own SQLite database ran: **104 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty. The 14 scripts that don't name SQLite were not run.
  - The models match `Database3.3.txt` (checked by script).
- **Frontend:**
  - `lostPets.browser.mjs` passed 10 scenarios at 390 and 1280 px on three runs. The first attempt, made while Vite was still preparing the new files, failed once. It covers:
    - the resident list;
    - the alert card, map markers (no route line) and timeline order;
    - the latest sighting flag and reported vs submitted times;
    - no reporter names for neighbors, and no horizontal overflow;
    - the Spotted Here flow: consent before device location, pin by tapping the map, accuracy required, multipart submit;
    - the Leader dashboard;
    - the Leader activating a requested alert.
  - `phase5Pets.browser.mjs` passed 26 scenarios.
  - Both browser suites made zero backend requests, on a local Vite server on port 5175, stopped afterwards.
  - `npm run build` passed.
  - `node --test tests/*.test.mjs`: 89/89, including 3 new timeline tests.
  - ESLint: new files clean, and no findings on changed lines of existing files.
- **Not verified:**
  - real push delivery;
  - real device geolocation;
  - Cloudinary uploads;
  - the live MySQL database (the tables are created at startup).
