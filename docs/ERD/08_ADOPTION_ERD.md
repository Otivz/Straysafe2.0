# Module 08 — Adoption (index)

> **Source of truth:** `backend/app/models/report.py` (the nine `Adoption*` classes), checked against the live MySQL
> schema. Documentation only.

## 1. Module purpose

Adopting an animal from the holding facility, end to end:

- the application and its stages;
- applicant verification;
- staff task assignments, the interview and the home visit;
- approval and handover, which creates a new pet record for the adopter;
- the adoption certificate;
- post-adoption monitoring;
- the history of which staff member owns the case.

## 2. Why this module is split into four

As one diagram, Module 08 has **9 tables, 178 columns and 35 relationship lines** (25 of them to `users`). It is the
largest module, and three of its tables have 25–48 columns. It is presented as **four submodules**, one per adoption
phase.

| Submodule                                                                       | Tables defined in full                                                      | Reference entities                                     | Lines                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| [08A — Application &amp; Verification](08A_APPLICATION_VERIFICATION_ERD.md)     | `adoptions`, `adoption_verifications`, `adoption_timeline_logs`       | `holding_animals`, `users`, `pets`               | 11                                     |
| [08B — Staff Assignments &amp; Screening](08B_ASSIGNMENTS_SCREENING_ERD.md)     | `adoption_assignments`, `adoption_interviews`, `adoption_home_visits` | `adoptions`, `users`, `adoption_monitoring_logs` | 12                                     |
| [08C — Post-Adoption Monitoring](08C_POST_ADOPTION_MONITORING_ERD.md)           | `adoption_monitoring_logs`                                                | `adoptions`, `adoption_assignments`, `users`     | 4                                      |
| [08D — Certificate &amp; Case Ownership](08D_CERTIFICATE_CASE_OWNERSHIP_ERD.md) | `adoption_certificates`, `adoption_ownership_history`                   | `adoptions`, `users`                               | 8                                      |
| **Total**                                                                 | **9 tables**                                                          |                                                        | **35** (all of the module's FKs) |

## 3. Module map (keys only)

How the nine tables connect. All of them hang off `adoptions`; the assignment ↔ monitoring pair links both ways.
Raw code: [`mermaid/08_adoption.mmd`](mermaid/08_adoption.mmd).

```mermaid
---
config:
  theme: base
  themeVariables:
    background: "#ffffff"
    primaryColor: "#ffffff"
    primaryTextColor: "#000000"
    primaryBorderColor: "#000000"
    lineColor: "#000000"
    textColor: "#000000"
    secondaryColor: "#ffffff"
    tertiaryColor: "#ffffff"
    attributeBackgroundColorOdd: "#ffffff"
    attributeBackgroundColorEven: "#f2f2f2"
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
  er:
    layoutDirection: LR
    entityPadding: 12
    minEntityWidth: 120
    fontSize: 16
    useMaxWidth: false
---
erDiagram
    adoptions {
        int adoption_id PK
    }
    adoption_verifications {
        int verification_id PK
        int adoption_id FK
    }
    adoption_timeline_logs {
        int timeline_id PK
        int adoption_id FK
    }
    adoption_assignments {
        int assignment_id PK
        int adoption_id FK
        int monitoring_log_id FK
    }
    adoption_interviews {
        int interview_id PK
        int adoption_id FK
        int assignment_id FK
    }
    adoption_home_visits {
        int visit_id PK
        int adoption_id FK
        int assignment_id FK
    }
    adoption_monitoring_logs {
        int log_id PK
        int adoption_id FK
        int assignment_id FK
    }
    adoption_certificates {
        int certificate_id PK
        int adoption_id FK,UK
    }
    adoption_ownership_history {
        int history_id PK
        int adoption_id FK
    }
    adoptions ||--o{ adoption_verifications : "adoption_id"
    adoptions ||--o{ adoption_timeline_logs : "adoption_id"
    adoptions ||--o{ adoption_assignments : "adoption_id"
    adoption_monitoring_logs |o--o{ adoption_assignments : "monitoring_log_id"
    adoptions ||--o{ adoption_interviews : "adoption_id"
    adoption_assignments |o--o{ adoption_interviews : "assignment_id"
    adoptions ||--o{ adoption_home_visits : "adoption_id"
    adoption_assignments |o--o{ adoption_home_visits : "assignment_id"
    adoptions ||--o{ adoption_monitoring_logs : "adoption_id"
    adoption_assignments |o--o{ adoption_monitoring_logs : "assignment_id"
    adoptions ||--o| adoption_certificates : "adoption_id"
    adoptions ||--o{ adoption_ownership_history : "adoption_id"
```

## 4. Differences between the models and the live database (documentation only)

| Item                                                                                                                                    | Model | Live database | Drawn as   |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------- | ---------- |
| `adoptions.staff_handover_by → users`                                                                                                | FK    | no FK         | FK (model) |
| 7 walk-in columns on `adoptions` (`manual_applicant_*`, `manual_id_type_number`, `is_manual_walkin`, `handover_evidence_url`) | —    | exist, unused | not shown  |

## 5. Links to other modules

| Link                                                                                                                       | Module |
| -------------------------------------------------------------------------------------------------------------------------- | ------ |
| `adoptions.holding_id → holding_animals`: the animal comes from the holding facility (facility status *For Adoption*) | 07B    |
| `adoptions.created_pet_id → pets`: the adopted animal becomes the adopter's registered pet                              | 03A    |
| Applicant, reviewers, case owners, staff, signatories                                                                      | 01     |
