# StraySafe 2.0 — Barangay Head/Officer Role & Hierarchy Implementation Guide 🛡️🐾

---

## 1. Executive Summary & Architectural Overview

This document outlines the complete architectural design, database schema updates, backend API specification, frontend UX workflows, and operational state transitions for introducing the **Barangay Head / Officer-in-Charge (OIC)** tier within the StraySafe ecosystem.

### 🏛️ The 3-Tier Governance & Chain of Responsibility

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1. SYSTEM ADMIN (Governance)                    │
│   • Global System Oversight & Configuration                            │
│   • Barangay Registry Management & Jurisdictions                       │
│   • Assigns / Designates Head Officer per Barangay                     │
│   • Audits System Logs, Personnel Accounts & High-Level Analytics     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             2. BARANGAY HEAD / OFFICER (Command & Coordination)        │
│   • Assigned to a Specific Barangay Jurisdiction                       │
│   • Reviews Incoming Escalated Reports & Endorsement Letters           │
│   • Creates Tactical Teams & Assigns Personnel to Missions             │
│   • Coordinates, Dispatches & Monitors Rescue/Pickup Operations        │
│   • Manages Facility Admissions, Holds, and Case Final Approvals       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│           3. BARANGAY PERSONNEL / FIELD STAFF (Field Operations)       │
│   • Subordinate to their Barangay Head Officer                         │
│   • Receives Direct Report & Rescue Mission Assignments                │
│   • Executes Field Animal Pickups & Captures                           │
│   • Submits Real-Time Evidence (Photos/GPS/Telemetry) & Status Updates │
│   • Handles Daily Shelter/Facility Care & Animal Feeding               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Role Comparison & Permissions Matrix

| Capability / Action | System Admin | Barangay Head / Officer | Barangay Field Staff | Subdivision Leader | Citizen / Resident |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Assign Barangay Head** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Create/Manage Staff Accounts** | ✅ Global | ✅ Own Barangay | ❌ No | ❌ No | ❌ No |
| **View Barangay Jurisdictional Feed** | ✅ All | ✅ Own Barangay | ✅ Own Barangay | ❌ Subdivision Only | ❌ Public Feed Only |
| **Approve / Reject Escalated Reports** | ❌ No | ✅ Yes (Sole Authority) | ❌ Read Only | ❌ Pre-escalation Only | ❌ No |
| **Dispatch & Assign Rescue Teams** | ❌ No | ✅ Yes (Sole Authority) | ❌ Read Only | ❌ No | ❌ No |
| **Accept Task & Update Field Status** | ❌ No | ❌ Supervise Only | ✅ Yes (Assigned Tasks) | ❌ No | ❌ No |
| **Upload Field Evidence (Pickup/Rescue)** | ❌ No | ✅ Review/Override | ✅ Yes (Field Capture) | ❌ No | ❌ Report Media Only |
| **Manage Holding Facility & Intake** | ❌ View Only | ✅ Yes (Authorize Intake/Discharge) | ✅ Yes (Daily Logs & Observations) | ❌ No | ❌ No |
| **Resolve / Close Escalated Cases** | ❌ Audit Only | ✅ Yes (Final Sign-off) | ❌ Marked as Field Complete | ❌ Pre-escalation Only | ❌ No |

---

## 3. Database Architecture & Schema Changes

### 3.1 Entity Relationship Diagram (ERD Updates)

```
 +--------------------+        1:N        +-------------------------+
 |     BARANGAYS      |<------------------|          USERS          |
 |--------------------|                   |-------------------------|
 | barangay_id (PK)   |                   | user_id (PK)            |
 | barangay_name      |                   | name, email, password   |
 | city, contact_no   |                   | role_id (FK -> roles)   |
 | hq_lat, hq_lng     |                   | position_id (FK)        |
 +---------+----------+                   | barangay_id (FK) [NEW]  |
           | 1:1 (Current Head)           | is_head_officer [NEW]   |
           +----------------------------->| status                  |
                                          +------------+------------+
                                                       | 1:N (Assigned By)
                                                       v
                                          +-------------------------+
                                          |   RESCUE_ASSIGNMENTS    |
                                          |-------------------------|
                                          | assignment_id (PK)      |
                                          | rescue_id (FK)          |
                                          | user_id (FK: Staff)     |
                                          | assigned_by (FK: Head)  |
                                          | team_name [NEW]         |
                                          | assignment_status       |
                                          | assigned_at             |
                                          +-------------------------+
```

### 3.2 SQL Migration Script (`V3.4__barangay_officer_hierarchy.sql`)

```sql
-- =============================================================================
-- STRAYSAFE 2.0: BARANGAY HEAD / OFFICER HIERARCHY MIGRATION
-- =============================================================================

-- Step 1: Add Barangay Head Officer Role (or configure Role 5)
INSERT INTO `roles` (`role_id`, `role_name`) 
VALUES (5, 'Barangay Head')
ON DUPLICATE KEY UPDATE `role_name` = 'Barangay Head';

-- Step 2: Add specific positions if missing
INSERT INTO `positions` (`position_id`, `position_name`) 
VALUES 
  (7, 'Barangay Officer-in-Charge (OIC)'),
  (8, 'Animal Control Operations Head')
ON DUPLICATE KEY UPDATE `position_name` = VALUES(`position_name`);

-- Step 3: Extend USERS table with barangay_id and is_head_officer flag
ALTER TABLE `users`
  ADD COLUMN `barangay_id` INT DEFAULT NULL AFTER `subdivision_id`,
  ADD COLUMN `is_head_officer` TINYINT(1) DEFAULT 0 AFTER `barangay_id`,
  ADD CONSTRAINT `fk_users_barangay` 
    FOREIGN KEY (`barangay_id`) REFERENCES `barangays` (`barangay_id`) 
    ON DELETE SET NULL;

CREATE INDEX `idx_users_barangay_role` ON `users` (`barangay_id`, `role_id`, `is_head_officer`);

-- Step 4: Extend RESCUES and RESCUE_ASSIGNMENTS to track dispatch authority
ALTER TABLE `rescues`
  ADD COLUMN `dispatched_by_head_id` INT DEFAULT NULL AFTER `leader_id`,
  ADD COLUMN `dispatch_notes` TEXT DEFAULT NULL AFTER `dispatched_by_head_id`,
  ADD CONSTRAINT `fk_rescues_head` 
    FOREIGN KEY (`dispatched_by_head_id`) REFERENCES `users` (`user_id`) 
    ON DELETE SET NULL;

ALTER TABLE `rescue_assignments`
  ADD COLUMN `team_name` VARCHAR(100) DEFAULT NULL AFTER `rescue_id`,
  ADD CONSTRAINT `fk_assignments_assigned_by` 
    FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`) 
    ON DELETE SET NULL;

-- Step 5: Update Seed User (San Vicente Head Officer)
UPDATE `users` 
SET 
  `role_id` = 5,
  `position_id` = 6, -- Barangay Captain / Head
  `barangay_id` = 1,  -- San Vicente
  `is_head_officer` = 1
WHERE `email` = 'kylabiancafrias@gmail.com';
```

---

## 4. End-to-End Operational Workflow

```
[1. CITIZEN]
  │ Submits Incident Report (Dog/Cat, GPS, Photo)
  ▼
[2. SUBDIVISION LEADER]
  │ Reviews, filters fake reports, verifies legitimacy
  │ Uploads Endorsement Letter PDF
  │ Escalates to Barangay (Status 4: Escalated to Barangay)
  ▼
[3. BARANGAY HEAD / OFFICER-IN-CHARGE]
  │ 1. Receives notification of incoming Escalated Report in Command Center
  │ 2. Reviews Endorsement Letter, AI Priority & Medical Assessment
  │ 3. Approves Rescue Request (Status 13: Approved)
  │ 4. Organizes Rescue Team & Dispatches specific Barangay Field Staff
  │    (Status 5: Rescue In Progress | Rescue Status: Rescuer Assigned / En Route)
  ▼
[4. BARANGAY PERSONNEL / FIELD STAFF]
  │ 1. Receives mobile/dashboard assignment alert with GPS navigation
  │ 2. Marks arrival on scene (Rescue Status: On Site)
  │ 3. Captures animal & uploads pickup evidence photo (Status 6: Picked Up)
  │ 4. Transports animal to Barangay Holding Facility
  ▼
[5. BARANGAY HEAD / HOLDING FACILITY INTAKE]
  │ 1. Head Officer logs intake confirmation (Status 7: Under Observation / Status 8: Impounded)
  │ 2. Assigns kennel slot, monitors veterinary observation or owner claim
  │ 3. Authorizes final disposition: Claimed (9) / Rehomed (10) / Resolved (11)
```

---

## 5. Backend Implementation Specifications

### 5.1 RBAC Authorization Middleware (`middleware/authMiddleware.js`)

```javascript
// Middleware: Verify Admin Access
exports.requireAdmin = (req, res, next) => {
  if (req.user && req.user.role_id === 4) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
};

// Middleware: Verify Barangay Head / Officer Access
exports.requireBarangayHead = (req, res, next) => {
  if (req.user && (req.user.role_id === 5 || (req.user.role_id === 3 && req.user.is_head_officer))) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden: Barangay Head/Officer access required.' });
};

// Middleware: Verify Barangay Staff or Head (General Barangay Level)
exports.requireBarangayAccess = (req, res, next) => {
  if (req.user && [3, 5].includes(req.user.role_id)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden: Barangay personnel access required.' });
};
```

---

### 5.2 Admin Endpoints (`controllers/adminBarangayController.js`)

```javascript
/**
 * GET /api/admin/barangays
 * Lists all barangays with their active Head Officer details and staff counts
 */
exports.getBarangaysOverview = async (req, res) => {
  const query = `
    SELECT 
      b.barangay_id,
      b.barangay_name,
      b.city,
      b.contact_no,
      b.hq_lat,
      b.hq_lng,
      head.user_id AS head_id,
      head.name AS head_name,
      head.email AS head_email,
      head.phone AS head_phone,
      p.position_name AS head_position,
      (SELECT COUNT(*) FROM users u WHERE u.barangay_id = b.barangay_id AND u.role_id IN (3, 5)) AS total_personnel,
      (SELECT COUNT(*) FROM reports r JOIN subdivisions s ON r.subdivision_id = s.subdivision_id WHERE s.barangay_id = b.barangay_id AND r.current_status_id NOT IN (3, 11, 12, 14)) AS active_cases
    FROM barangays b
    LEFT JOIN users head ON b.barangay_id = head.barangay_id AND head.is_head_officer = 1
    LEFT JOIN positions p ON head.position_id = p.position_id
    ORDER BY b.barangay_name ASC;
  `;
  const [results] = await db.query(query);
  res.json({ success: true, data: results });
};

/**
 * POST /api/admin/barangay/assign-head
 * Designates or swaps the Head Officer for a specific Barangay
 */
exports.assignBarangayHead = async (req, res) => {
  const { barangay_id, user_id, position_id } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Demote any existing head in this barangay to regular staff
    await connection.query(
      `UPDATE users 
       SET is_head_officer = 0, role_id = 3 
       WHERE barangay_id = ? AND is_head_officer = 1`,
      [barangay_id]
    );

    // Promote the selected user to Head Officer
    await connection.query(
      `UPDATE users 
       SET barangay_id = ?, is_head_officer = 1, role_id = 5, position_id = COALESCE(?, position_id)
       WHERE user_id = ?`,
      [barangay_id, position_id, user_id]
    );

    // Log action to audit logs
    await connection.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details) 
       VALUES (?, 'ASSIGN_BARANGAY_HEAD', 'BARANGAY', ?, ?)`,
      [req.user.user_id, barangay_id, `Assigned User #${user_id} as Head Officer of Barangay #${barangay_id}`]
    );

    await connection.commit();
    res.json({ success: true, message: 'Barangay Head Officer successfully assigned.' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};
```

---

### 5.3 Barangay Head Endpoints (`controllers/barangayHeadController.js`)

```javascript
/**
 * GET /api/brgy-head/personnel
 * Lists all field staff under the Head's barangay jurisdiction with live status
 */
exports.getBarangayPersonnel = async (req, res) => {
  const barangay_id = req.user.barangay_id;

  const query = `
    SELECT 
      u.user_id,
      u.name,
      u.email,
      u.phone,
      u.profile_picture,
      p.position_name,
      u.status,
      u.is_head_officer,
      (SELECT COUNT(*) FROM rescue_assignments ra 
       WHERE ra.user_id = u.user_id AND ra.assignment_status IN ('Assigned', 'In Transit', 'On Site')) AS active_missions_count,
      (SELECT r.report_id FROM rescue_assignments ra 
       JOIN rescues r ON ra.rescue_id = r.rescue_id
       WHERE ra.user_id = u.user_id AND ra.assignment_status IN ('Assigned', 'In Transit', 'On Site') 
       LIMIT 1) AS current_report_id
    FROM users u
    LEFT JOIN positions p ON u.position_id = p.position_id
    WHERE u.barangay_id = ? AND u.role_id IN (3, 5)
    ORDER BY u.is_head_officer DESC, u.name ASC;
  `;

  const [personnel] = await db.query(query, [barangay_id]);
  res.json({ success: true, data: personnel });
};

/**
 * POST /api/brgy-head/dispatch-rescue
 * Approves incoming escalated report, creates a rescue mission, and assigns personnel team
 */
exports.dispatchRescueOperation = async (req, res) => {
  const { report_id, team_name, assigned_staff_ids, dispatch_notes, scheduled_at } = req.body;
  const head_id = req.user.user_id;
  const barangay_id = req.user.barangay_id;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verify report belongs to a subdivision under this barangay
    const [reportRows] = await connection.query(
      `SELECT r.report_id, r.current_status_id, s.barangay_id 
       FROM reports r
       JOIN subdivisions s ON r.subdivision_id = s.subdivision_id
       WHERE r.report_id = ? AND s.barangay_id = ?`,
      [report_id, barangay_id]
    );

    if (reportRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Report not found or outside jurisdiction.' });
    }

    // 2. Create or Update Rescue Record
    const [rescueResult] = await connection.query(
      `INSERT INTO rescues (report_id, status_id, assigned_team, notes, scheduled_at, dispatched_by_head_id, dispatch_notes)
       VALUES (?, 2, ?, ?, COALESCE(?, NOW()), ?, ?)
       ON DUPLICATE KEY UPDATE 
         status_id = 2, assigned_team = VALUES(assigned_team), notes = VALUES(notes), 
         dispatched_by_head_id = VALUES(dispatched_by_head_id), dispatch_notes = VALUES(dispatch_notes)`,
      [report_id, team_name, dispatch_notes, scheduled_at, head_id, dispatch_notes]
    );

    const rescue_id = rescueResult.insertId || rescueResult.insertId;

    // 3. Assign Personnel to Team
    for (const staff_id of assigned_staff_ids) {
      await connection.query(
        `INSERT INTO rescue_assignments (rescue_id, user_id, assigned_by, team_name, assignment_status, remarks)
         VALUES (?, ?, ?, ?, 'Assigned', ?)`,
        [rescue_id, staff_id, head_id, team_name, `Assigned by Head Officer #${head_id}`]
      );

      // Trigger Push Notification to assigned personnel
      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id)
         VALUES (?, 'rescue_assignment', '🚨 New Rescue Mission Assigned', 
                 ?, ?)`,
        [staff_id, `You have been dispatched by your Head Officer for Incident Report #${report_id}.`, report_id]
      );
    }

    // 4. Update Report Status to '5' (Rescue In Progress)
    await connection.query(
      `UPDATE reports SET current_status_id = 5 WHERE report_id = ?`,
      [report_id]
    );

    // 5. Append to Status History
    await connection.query(
      `INSERT INTO status_history (report_id, report_status_id, rescue_status_id, updated_by, remarks, rescue_id)
       VALUES (?, 5, 2, ?, ?, ?)`,
      [report_id, head_id, `Dispatched Team: ${team_name} with ${assigned_staff_ids.length} personnel.`, rescue_id]
    );

    await connection.commit();
    res.json({ success: true, message: 'Rescue operation successfully created and dispatched.' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};
```

---

## 6. Frontend UI / UX Architecture

### 6.1 Admin Navigation & Head Designation UI
*   **Location:** `/admin/barangays` & `/admin/users`
*   **Key Controls:**
    1.  **"Designate Head Officer" Action Modal:** Filter by user, select barangay, choose title (`Barangay Captain`, `Operations Head`), confirm swap.
    2.  **Barangay Card Badge:** Displays avatar, name, and contact details of the Head Officer alongside total active personnel.

### 6.2 Barangay Head Command Portal
*   **Location:** `/brgy/head/command`
*   **Core Modules:**
    1.  **Tactical Dispatch Board:** Shows incoming escalated cases with AI Priority badges. A "Dispatch Team" modal allows one-click multi-selection of idle personnel.
    2.  **Personnel Availability Roster:** Real-time roster showing each staff member's availability:
        *   🟢 `Available / On Standby`
        *   🟡 `En Route (Report #104)`
        *   🔵 `On Site / Capturing`
        *   ⚪ `Off Duty`
    3.  **Live Mission Telemetry Map:** Real-time view of field units and active incident pins.
    4.  **Holding & Facility Authorization:** Approves animal intake, medical isolation, owner claims, and final release sign-offs.

### 6.3 Barangay Field Staff Interface
*   **Location:** `/brgy/staff/my-missions`
*   **Core Modules:**
    1.  **"My Assigned Missions" Priority Tray:** Clear notification banner indicating the assigning Head Officer and assigned team members.
    2.  **Field Action Stepper:**
        *   `[Accept & Start Navigation]` (Updates status to *En Route*)
        *   `[Arrived at Scene]` (Updates status to *On Site*)
        *   `[Animal Secured / Capture Photo Evidence]` (Updates status to *Picked Up*)
        *   `[Deliver to Facility]` (Hands over to holding facility)

---

## 7. Security, Integrity & Edge Case Safeguards

1.  **Single Head Officer per Barangay Invariant:**
    *   The database and transactional endpoints strictly enforce that assigning a new Head automatically clears any previous `is_head_officer = 1` flag for that `barangay_id`.
2.  **Jurisdictional Isolation:**
    *   Barangay Heads and Staff cannot view, assign, or alter incident reports originating outside their assigned `barangay_id`.
3.  **Audit Trail & Accountability:**
    *   Every dispatch, team reassignment, and status transition explicitly logs the `assigned_by` (Head ID) and `updated_by` user IDs in `rescue_assignments`, `rescues`, and `status_history`.
4.  **Fallback Dispatch:**
    *   If a Barangay has no active Head designated, the System Admin retains fallback override authority to assign personnel or approve critical emergency rescues directly.
