# StraySafe 2.0: Reporting Process & Lifecycle Guide

This document outlines the step-by-step instructions for a citizen to report a stray animal, followed by the systematic process of how the report is handled by the StraySafe 2.0 system from submission to resolution.

---

## 1. How to Report a Stray Animal (Citizen Steps)

When a citizen spots a stray animal, an injured pet, or a potentially dangerous animal, they should follow these steps to file a report:

### Step 1: Access the Reporting Tool
- Open the StraySafe 2.0 application.
- Navigate to the **Home** or **Dashboard** screen.
- Click the **"Report Stray"** or **"+"** action button.

### Step 2: Upload Evidence (Media)
- **Capture or Upload:** Take a clear photo or video of the animal in real-time, or upload recent media from your gallery. 
- *Note: Clear media is required for the AI to accurately identify the animal, breed, and physical condition.*

### Step 3: Pin the Location
- **GPS Tagging:** The app will automatically attempt to tag your current location.
- **Manual Adjustment:** You can drag the pin on the map to specify the exact location where the animal was spotted if it is different from your current location.

### Step 4: Provide Incident Details
- **Category:** Select the most appropriate category (e.g., *Injured Animal, Aggressive Stray, Possible Rabies Risk, Roaming Pack, Animal Rescue Needed*).
- **Description:** Provide additional context (e.g., "The dog is limping near the subdivision gate").
- **Visibility:** Choose whether the report should be **Public** (visible on community feeds) or **Private** (visible only to admins/leaders).

### Step 5: Submit
- Review the information and click **Submit**.
- A **Success Modal** will appear confirming the submission, and you will receive a unique **Report ID** to track the status.

---

## 2. The Resolution Process (What Happens Next)

Once the citizen submits the report, it enters the StraySafe 2.0 automated and human-verified workflow.

### Stage 1: AI Analysis & Automated Categorization
- **AI Processing:** The system's AI immediately analyzes the uploaded media and description.
- **Insights:** It determines the species (Dog/Cat), estimates the breed, detects physical conditions (e.g., injured, normal), and suggests a priority level (Emergency, High, Regular, Low).
- **Status:** The report is officially logged with Status: `1 (Reported)`.

### Stage 2: Subdivision Leader Verification
- **Notification:** The designated Subdivision Leader receives an alert about the new report.
- **Action:** The Leader reviews the AI insights and the submitted evidence.
  - *If it is a False/Spam Report:* They reject it. (Status: `3 - Rejected`)
  - *If handled locally:* They resolve it without barangay help. (Status: `11 - Resolved`)
  - *If valid & requires rescue:* They **verify** the report (Status: `2`) and generate a PDF endorsement to escalate it to the Barangay. (Status: `4 - Escalated`)

### Stage 3: Barangay Command Center Review
- **Review:** Barangay Staff receives the endorsed request.
- **Approval:** If resources are available and the request is valid, the Barangay approves the rescue operation. (Status: `13 - Approved`)

### Stage 4: Field Rescue Operations
- **Dispatch:** The Barangay dispatches a Field Rescue Team to the GPS coordinates provided by the citizen. (Status: `5 - Rescue In Progress`)
- **Capture:** The team secures the animal safely and uploads photographic evidence of the capture. (Status: `6 - Picked Up`)
- **Transfer:** The animal is transported to the Barangay holding facility or kennel. (Status: `7 - Under Observation` or `8 - Impounded`)

### Stage 5: Final Outcome & Archiving
Depending on the situation, the case reaches one of the final resolutions:
- **Claimed:** An owner identifies their pet via the system and reclaims it. (Status: `9`)
- **Released/Rehomed:** The animal is successfully adopted or rehomed. (Status: `10`)
- **Deceased:** Unfortunately, the animal did not survive its injuries or illness. (Status: `12`)

*Once a report reaches a terminal status (3, 9, 10, 11, or 12), it is automatically CLOSED, removed from active feeds, and stored securely in the system's History and Archives.*
