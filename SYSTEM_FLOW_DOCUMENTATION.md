STRAY-SAFE 2.0
Smart Stray Animal Reporting and Rescue System
System Planning & Flow Document
DETECT
VALIDATE
RESCUE
MONITOR
PROTECT


1.  System Overview
STRAY-SAFE 2.0 is a web-based, role-based, AI-assisted reporting and rescue management system designed to improve the reporting, validation, rescue, and monitoring of stray animals within communities.

The system connects citizens, subdivision leaders, barangay staff, and administrators in one coordinated rescue workflow supported by mapping, analytics, artificial intelligence, and a Pet QR Code system.

Core Framework

📋
Report
✅
Validate
🚑
Rescue
📊
Monitor


2.  User Roles and Functionalities

A.  Citizen (Reporter)
Citizens serve as the primary reporting source of stray animal incidents.

Citizen — Reporter
Primary source for stray animal incident reports
Features
• Submit stray animal reports with image/video, GPS location, and description
• View and track active report status in real time on the Home Feed
• Choose Public or Private report visibility
• View report location on interactive map
• Comment on reports with subdivision leaders and barangay staff
• View all past reports (including closed ones) on their Profile page
• Register and manage pets with a unique QR code per pet
• Share pet QR cards and view who scanned them (Scan History)

Actions / Status (Visible to Citizens on Home Feed — Active Reports Only)
→ 1.  Reported       (Pending review by Subdivision Leader)
→ 2.  Verified       (Report validated, forwarded)
→ 4.  Escalated to Barangay  (Endorsed and sent to Barangay Staff)
→ 13. Approved       (Barangay approved the rescue request)
→ 5.  Rescue In Progress     (Team dispatched to location)
→ 6.  Picked Up      (Animal safely secured)
→ 7.  Under Observation      (Animal under medical observation)
→ 8.  Impounded      (Animal in holding facility)
→ 9.  Claimed by Owner       (Returned to owner)
→ 10. Released       (Animal released/rehomed)

Note: Resolved (11), Deceased (12), and Rejected (3) are HIDDEN from the citizen's
active home feed. They remain visible only on the citizen's Profile page (all past reports).


B.  Subdivision Leader (Validation Layer)
Subdivision leaders serve as the validation and filtering layer before reports reach barangay authorities.

Subdivision Leader — Validation Layer
Filters, validates, and manages reports before escalation
Login: /staff/login  |  Role ID: 2

Features
• Review incoming reports from citizens in the Active Reports list
• Detect and filter fake, spam, or duplicate reports (Reject action)
• Validate report legitimacy, description, and GPS location
• Escalate valid reports to Barangay with an official Endorsement Letter (PDF upload)
• Resolve reports directly if they have NOT been escalated to Barangay
• Monitor escalated missions via the Escalated Missions tracker
• View the full archive of all closed cases in the History Reports page
• View archived endorsement letters sent to Barangay
• Publish community Hazard Alerts/Announcements (published only — no drafts shown)
• View pet registrations within the subdivision

Actions / Status
→ Verify      (Status 1 → 2) Legitimacy confirmed
→ Reject      (Status → 3)   Spam/fake/duplicate — CLOSED, moves to History
→ Escalate    (Status → 4)   Sends report to Barangay with endorsement letter PDF
→ Resolve     (Status → 11)  Case closed by leader — ONLY if NOT yet escalated
                              Once escalated, the Resolve button is hidden/disabled

Key Rule: Once a report is escalated to Barangay (Status 4+), the Subdivision Leader
can no longer resolve the report. The Barangay manages all further status changes.

Pages & Routes
• /subd/dashboard        — Overview metrics and summary
• /subd/reports          — Active reports (excludes Resolved, Deceased, Rejected)
• /subd/reports/:id      — Detailed view + action buttons (Verify / Reject / Escalate / Resolve)
• /subd/history          — History archive: all closed reports (Status 3, 11, 12 only)
• /subd/escalated        — Real-time mission tracker for escalated reports
• /subd/endorsements     — Archive of all endorsement letters sent to Barangay
• /subd/hazard-alert     — Publish and manage community hazard announcements
• /subd/pet-records      — View registered pets in the subdivision
• /subd/profile          — Leader profile and settings


C.  Barangay Staff (Action Layer)
Barangay staff handle rescue operations and the full case lifecycle after escalation.

Barangay Staff — Action Layer
Manages rescue operations and the full animal case lifecycle
Login: /staff/login

Features
• Operation Command Center: Real-time tactical oversight for all field operations
• AI-Prioritized Incident Feed: Automatic sorting of cases by medical urgency and aggression
• Receive and review validated rescue requests from Subdivision Leaders
• Approve or reject incoming rescue requests
• Dispatch response teams with real-time mission tracking
• Perform field rescue and animal pickup
• Manage post-rescue states: Under Observation, Impoundment, Released, Deceased
• Manage the Holding Facility (animals currently in care)
• Publish community alerts for the barangay area

Rescue Request Status Flow (Barangay-side)
→ 1. Pending Approval    (Waiting for Barangay review)
→ 2. Approved            (Report auto-updates to Status 13 — Approved)
→ 3. Rejected            (Request declined by Barangay)
→ 4. Operation Started   (Report updates to Status 5 — Rescue In Progress)
→ 5. Dispatched          (Field team en route)
→ 6. Resolved            (Rescue operation complete)

Report Status Updates Managed by Barangay
→ 13. Approved           (After rescue request approval)
→ 5.  Rescue In Progress (After operation starts)
→ 6.  Picked Up          (Animal secured in field)
→ 7.  Under Observation  (Animal receiving care)
→ 8.  Impounded          (Moved to holding facility)
→ 9.  Claimed by Owner   (Returned to rightful owner)
→ 10. Released           (Rehomed or set free)
→ 12. Deceased           (Animal did not survive) — CLOSED, moves to History

Pages & Routes
• /brgy/dashboard          — Operational overview and statistics
• /brgy/rescue-requests    — Incoming rescue requests from Subdivision Leaders
• /brgy/operations         — Active field operations management
• /brgy/holding-facility   — Animals currently in the holding facility
• /brgy/community-alerts   — Publish public hazard alerts
• /brgy/profile            — Staff profile settings


D.  Admin (System Controller)
Admin oversees the entire system, ensuring operational integrity and data accuracy.

Admin — System Controller
Full system oversight, configuration, and management
Login: /admin/login

Features
• Pet Management Registry: Oversee all registered pets, vaccination status, and ownership history
• Manage users with Role-Based Access Control (RBAC)
• Add, edit, and deactivate user accounts (Citizens, Leaders, Barangay Staff)
• Monitor all reports and rescue cases system-wide
• View geographic heatmaps and analytics dashboards
• Access full audit logs and system activity records
• Configure system settings and parameters

Pages & Routes
• /admin/dashboard         — System-wide statistics and overview
• /admin/users             — User management (all roles)
• /admin/incidents         — Read-only view of all reports across the system
• /admin/heatmap           — Geographic density map of stray incidents
• /admin/logs              — System activity audit logs
• /admin/pets              — Manage all registered pets
• /admin/pet-records       — Pet documentation and records
• /admin/account-settings  — Admin profile settings


3.  Report Status Reference (Complete)

Status ID │ Status Name            │ Managed By              │ Type
──────────┼────────────────────────┼─────────────────────────┼────────────
    1     │ Reported               │ (auto — on submission)  │ Active
    2     │ Verified               │ Subdivision Leader      │ Active
    3     │ Rejected               │ Subdivision Leader      │ CLOSED ⛔
    4     │ Escalated to Barangay  │ Subdivision Leader      │ Active
   13     │ Approved               │ Barangay Staff          │ Active
    5     │ Rescue In Progress     │ Barangay Staff          │ Active
    6     │ Picked Up              │ Barangay Staff          │ Active
    7     │ Under Observation      │ Barangay Staff          │ Active
    8     │ Impounded              │ Barangay Staff          │ Active
    9     │ Claimed by Owner       │ Barangay Staff          │ Active
   10     │ Released               │ Barangay Staff          │ Active
   11     │ Resolved               │ Subdivision Leader      │ CLOSED ✅
   12     │ Deceased               │ Barangay Staff          │ CLOSED ✅

CLOSED statuses (3, 11, 12):
  - Hidden from Citizen Home Feed
  - Hidden from Subdivision Leader's Active Reports list
  - Archived in Subdivision Leader's History Reports (/subd/history)
  - Still visible in Citizen's Profile page (all-time report history)


4.  AI-Assisted Features

3.1
Animal Type Identification
Detects: Dog / Cat
3.2
Condition Detection
Injured / Sick / Normal
3.3
Automatic Prioritization
Emergency / High / Regular / Low
3.4
Decision Support
Breed suggestion, risk level, priority reason

Priority Levels

EMERGENCY / HIGH PRIORITY
Injured, aggressive, or possible rabies risk
REGULAR / MEDIUM PRIORITY
Weak or sick animal
LOW PRIORITY
Normal condition, no immediate threat


5.  System Workflow
The following step-by-step process describes how a stray animal incident moves through the STRAY-SAFE 2.0 system from initial report to full resolution.

Step 01  Citizen submits report with image/video, GPS location, category, and description
Step 02  Report stored and assigned a unique Report ID; Status set to Reported (1)
Step 03  AI module analyzes media — identifies species, condition, breed, and priority level
Step 04  Subdivision Leader reviews; verifies legitimacy or rejects (spam/duplicate)
Step 05  If valid: Leader escalates with official Endorsement Letter PDF → Status: Escalated (4)
         Alternatively: Leader resolves directly if no barangay action needed → Status: Resolved (11)
Step 06  Barangay Staff receives Rescue Request and reviews it
Step 07  Barangay approves request → Status: Approved (13); assigns rescue team
Step 08  Operation starts → Status: Rescue In Progress (5); team dispatched to GPS location
Step 09  Team performs field rescue → Status: Picked Up (6)
Step 10  Animal tracked through post-rescue stages: Observation (7) → Impounded (8)
Step 11  Final outcome recorded: Claimed (9), Released (10), Resolved (11), or Deceased (12)
Step 12  CLOSED reports removed from active feeds; archived in History
Step 13  System automatically updates Heatmaps and Analytics dashboards


6.  Core System Modules

A  Reporting Module
• Report submission with GPS capture and image/video upload
• Category tagging (Injured Animal, Aggressive Stray, Possible Rabies Risk, Roaming Pack, Animal Rescue Needed)
• Public/Private visibility option
• Comment section and real-time map pin display

B  Validation Module
• Report verification and duplicate/spam detection by Subdivision Leaders
• Fake report filtering via Reject action
• Official Endorsement Letter generation and upload for escalation
• Escalation workflow management with audit trail

C  Rescue Management Module
• Operation Command Center for tactical mission control (Barangay)
• AI-Assisted Prioritization Feed
• Rescue request approval and dispatch management
• Full case lifecycle tracking (13-status model)
• Real-time status updates with visual evidence photos
• Rescue documentation and case records

D  History & Archive Module  ← NEW
• Closed reports (Resolved, Deceased, Rejected) automatically archived
• Subdivision Leader History Reports page (/subd/history)
• Citizen Profile shows all-time reports including closed ones
• Endorsement Archive for all escalation letters sent

E  AI-Assisted Module
• Animal classification (dog/cat)
• Condition detection (Injured/Sick/Normal)
• Breed suggestion and color identification
• Automatic priority scoring: Emergency / High / Regular / Low
• Risk level suggestion with reason

F  Pet QR Code Module  ← NEW
• Citizens register pets with profile details and photo
• Unique QR code generated per pet
• QR card download/share functionality
• Public scan page accessible by anyone with the QR link
• Scan history — owner can see who scanned their pet and when

G  Monitoring & Dashboard Module
• Interactive map visualization with GPS pins
• Heatmaps for stray density by area
• Analytics charts and hotspot monitoring
• Escalated Mission Tracker with real-time status

H  Hazard Alert / Announcement Module
• Subdivision Leaders publish community hazard alerts
• Published announcements only shown (no draft visibility)
• Barangay Staff publish community alerts for their area

I  User Management Module
• Role-Based Access Control (RBAC)
• Account administration and role assignment (Admin)
• Session verification on every route change (auto-logout if session invalid)

J  Notification & Audit Module
• Status updates and alerts for active reports
• System activity audit logs (Admin)
• Full incident history and rescue records


7.  Technology Stack

Layer              │ Technology        │ Handles
───────────────────┼───────────────────┼──────────────────────────────────────────
Frontend           │ React + Vite      │ Dashboards, forms, maps, interactive UI
Backend            │ FastAPI (Python)  │ APIs, business logic, auth, workflow
Database           │ MySQL             │ Users, reports, AI results, rescue records
AI Module          │ TensorFlow.js     │ Animal image analysis, priority scoring
Mapping            │ Leaflet.js        │ Interactive map pins, GPS, navigation
Geolocation        │ Geolocation API   │ Precise GPS capture for report submissions
HTTP Client        │ Axios             │ Frontend API communication
Routing            │ React Router DOM  │ SPA navigation and protected routes


8.  UI Color Palette

Swatch     │ Name          │ Usage
───────────┼───────────────┼──────────────────────────────────────
#F97316    │ Burnt Orange  │ Primary — Rescue, urgency, warmth
#FACC15    │ Soft Amber    │ Primary — Hope, positivity
#86EFAC    │ Sage Green    │ Secondary — Care, healing
#FAFAF9    │ Off White     │ Secondary — Clean interface background
#EF4444    │ Soft Red      │ Alert — Urgent or injured animal reports
#8B5CF6    │ Purple        │ History, archive, and closed case indicators


9.  Key Innovations

01  Multi-layer report validation through subdivision leaders ensures accuracy before barangay action
02  AI-assisted animal detection and condition-based prioritization speeds up rescue response
03  Heatmap-based stray monitoring helps authorities identify high-density problem areas
04  Community reporting with Public/Private options protects privacy while enabling broad coverage
05  Real-time rescue workflow with full 13-status case lifecycle tracking from report to resolution
06  Decision support for local authorities reduces response time and improves outcomes
07  History archive separates active from closed cases, keeping workflows clean and organized
08  Pet QR Code system enables instant pet identification and owner contact via scannable cards
09  Escalation guard prevents resolution conflicts — once escalated, only Barangay can close a case
10  Session verification on every page load auto-logs out users whose accounts are deactivated


System Framework
DETECT
VALIDATE
RESCUE
MONITOR
PROTECT

Last Updated: June 2026 | StraySafe 2.0
