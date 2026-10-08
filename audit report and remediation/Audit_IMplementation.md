# STRAYSAFE 2.0
## CONSULTATION SUMMARY
### Important Improvements, Action Items, and Key Points to Remember

**Basis:** Consultation notes provided for StraySafe 2.0. This document summarizes the identified improvements and priorities discussed during the consultation, updated according to the current StraySafe 2.0 workflow and project scope.

## 1. Main Direction

The overall direction of StraySafe 2.0 is already acceptable. The main recommendation is to avoid adding more features for now and instead strengthen, test, document, and connect the existing features.

- Focus on the existing AI, GPS, QR, rescue management, holding facility, lost-pet matching, adoption, messaging, notification, audit logs, and multi-role functions.
- Prioritize system logic, accuracy, security, human verification, and end-to-end testing.
- Make every major system decision explainable and defensible during the panel defense.

## 2. PRIORITY: AI Accuracy and Validation

- Clearly document the four technologies identified in the consultation: **YOLOv8, Gemini, OpenCV, and Pillow**.
- **YOLOv8** – animal object detection.
- **Gemini** – multimodal analysis / decision support.
- **OpenCV** – image/video processing.
- **Pillow** – image and fur-color processing.
- Add or measure AI confidence scores where applicable.
- Test and document correct detections, false positives, and false negatives.
- Do not simply claim that the AI is accurate because YOLOv8 is being used.
- Test difficult conditions such as low lighting, different angles, partial visibility, small animals, and different breeds.

## 3. Risk Classification: Low / Medium / High / Emergency

- Define how the system determines the risk level.
- Identify the data or indicators used by the classification.
- Provide a numerical or logical explanation for why a case becomes Low, Medium, High, or Emergency.
- The consultation discussed a possible **1–100 scoring concept**, but the exact thresholds were not finalized. Validate and justify the final thresholds before using them in the system or paper.
- Prepare to explain the risk-classification logic during the panel defense.

## 4. Human Intervention in Critical Decisions

AI must remain an assistive tool and should not automatically make critical decisions.

- **AI recommendation → Human review → Authorized decision.**
- Human verification should remain for AI classification, duplicate reports, ownership claims, adoption, report rejection, rescue/dispatch, and case resolution.
- The system should not automatically reject a legitimate report based only on AI output.
- Ownership claims should be reviewed before approval.
- Completing adoption requirements should not automatically mean that an animal is adopted.
- The authorized Barangay personnel responsible for the adoption process must still review and approve or reject the application.

## 5. Duplicate Report Protection

- If multiple reports concern the same animal while the case is still ongoing, they may be linked or merged into one ongoing case.
- If the original case has already been resolved and a new report is submitted later, treat the later report as a **new case**.
- Test scenarios involving two or more duplicate reports.
- Test cases where one of several reports is resolved while other reports remain active.
- Allow authorized personnel to reject or appropriately handle duplicate/invalid reports.
- Document how the system confirms that an animal has already been secured or picked up.
- Once an active animal case has been confirmed as a specific registered pet, duplicate reports belonging to that same case should not be linked to a different registered pet.
- One active animal case should have only **one confirmed registered-pet identity**.

## 6. Lost Pet Matching

The consultation considered this feature acceptable overall. Improvements should focus on making the matching logic clearer rather than adding another feature.

- Improve similarity-score presentation where reliable.
- Use location/distance as supporting information.
- Consider registered pet information, appearance, additional photos, and veterinary/vaccination evidence.
- Maintain human review before confirming a possible match.
- Once a possible match has been confirmed as the correct registered pet, other suggested pets should no longer be confirmable for the same active animal case.
- Be ready to explain how the system determines that two pets are a possible match.

## 7. Adoption Workflow

The adoption process will be **managed by the Barangay through StraySafe 2.0**.

The system should support the complete adoption process while ensuring that important decisions remain under authorized human control.

- Barangay personnel may manage animals that become eligible or available for adoption.
- Residents may view animals available for adoption and submit adoption applications.
- The Barangay should review submitted adoption applications and requirements.
- Adoption processing may include applicant verification, interview, home visit or suitability assessment when required, application review, approval/rejection, handover, and post-adoption monitoring.
- Record submitted requirements and documents.
- Record adoption status and application history.
- Record the Barangay personnel assigned to handle the application where applicable.
- Maintain messaging and notifications between the applicant and authorized Barangay personnel where needed.
- Completing all adoption requirements must **not automatically approve an adoption**.
- Final adoption approval or rejection must require an authorized human decision.
- Adoption actions and status changes should be included in the system's audit trail.

Recommended workflow:

**Animal Eligible for Adoption → Available for Adoption → Resident Application → Requirements/Verification → Interview/Assessment → Barangay Review → Human Approval/Rejection → Handover → Post-Adoption Monitoring → Completed**

## 8. Privacy and GPS

- Citizen reports should not expose sensitive information to everyone.
- A citizen should be able to view their own reports.
- Subdivision Leaders should see reports within their authorized subdivision.
- Sensitive/private information should be restricted according to role.
- Do not expose the owner's full home address in public pet/QR information.
- Use only necessary contact information for public-facing information, such as an appropriate phone contact where applicable.
- Review how exact GPS information is displayed and who can access it.
- Sensitive adoption applicant information and submitted documents should only be accessible to authorized personnel.

## 9. Complete Workflow: Citizen to Rescue

The complete workflow should be tested from the first report until the case is completed.

1. Citizen submits a report.
2. Subdivision Leader reviews the report.
3. Report is validated/accepted.
4. Report is escalated to Barangay when necessary.
5. Barangay performs authorized verification/approval.
6. Rescue is approved and a rescuer is assigned.
7. Rescuer arrives and picks up/secures the animal.
8. Animal is placed in the appropriate holding/facility process.
9. The animal may be returned to its owner, resolved, transferred, remain under the appropriate holding process, or become eligible for adoption depending on the case.
10. If eligible for adoption, the Barangay manages the appropriate adoption process.
11. The case is completed after the appropriate final outcome is recorded.

The system should preserve the history of the animal/case even when it moves between rescue, holding, ownership, and adoption processes.

## 10. Timestamp / Case Tracking

- Record timestamps for major stages of the case.
- Recommended tracking points include:
  - citizen submission
  - subdivision review
  - validated report
  - Barangay escalation
  - rescue approval
  - rescuer assignment
  - rescuer arrival
  - animal pickup
  - holding/facility entry
  - adoption-related stages where applicable
  - case completion
- The purpose is to show the complete history and current status of an animal case.

## 11. Audit Logs

Audit logs should make system changes traceable.

Audit records should answer:

- **WHO** – who performed the action.
- **WHAT** – what action was performed.
- **WHICH RECORD** – which record was affected.
- **WHEN** – when the action occurred.
- **OLD VALUE** – previous value.
- **NEW VALUE** – updated value.

Important actions involving reports, rescues, registered pets, ownership, holding, adoption, users, and status changes should be traceable where appropriate.

## 12. User Roles and Jurisdiction Access

- Use role-based access control.
- A Subdivision Leader should only access authorized reports and users within their subdivision.
- Subdivision A should not be able to view private reports belonging to Subdivision B.
- Barangay should receive reports that are properly escalated to it.
- Barangay adoption functions should only be accessible to authorized Barangay personnel.
- Admin access should follow authorized administrative responsibilities.
- If multiple subdivisions are introduced later, verify that data isolation works correctly.
- Backend authorization should enforce these restrictions and should not depend only on hiding frontend buttons or pages.

## 13. Account Security

- Consider Multi-Factor Authentication (MFA) for stronger login security.
- Review secure password-reset procedures.
- Implement appropriate session expiration.
- Ensure proper logout behavior.
- Maintain account and authentication-related audit records where appropriate.

## 14. GPS Accuracy

- Compare actual location with reported GPS location.
- Measure and document location error.
- The consultation mentioned checking around a **5–10 meter range**. Treat this as a testing/checking point rather than an automatically accepted standard.
- Test reports created in areas with weak GPS or connectivity.
- Do not claim a specific GPS accuracy unless it has been demonstrated through testing.

## 15. Poor Connectivity / Offline Handling

- A report should not disappear if the user's internet connection drops while filling it out.
- Preserve entered information as a draft when possible.
- Allow the user to continue/edit and submit after the connection returns.
- Test behavior when the backend/database is temporarily unavailable.
- Test behavior when Gemini is unavailable.
- At minimum, protect user-entered data from being lost during interruptions.

## 16. Top 5 Priorities

| Priority | Area | Main Action |
|---|---|---|
| 1 | AI Testing | Validate accuracy, confidence, false positives/negatives, and explain the AI logic. |
| 2 | Duplicate Protection | Finalize duplicate detection, linking/merging, registered-pet identity protection, rejection, and resolved-case rules. |
| 3 | End-to-End Workflow | Test Citizen → Subdivision → Barangay → Rescue → Holding → Completion. |
| 4 | Adoption Workflow | Strengthen the Barangay-managed adoption workflow and ensure final decisions require authorized human approval. |
| 5 | Security & Audit | Strengthen privacy, role access, audit logs, account security, and data protection. |

## 17. Important Things to Remember for the Panel

**“AI is an assistive tool, not the final decision-maker.”**

**“Ongoing duplicate reports may be linked/merged; a new report after a resolved case should be treated as a new case.”**

**“One active animal case should only have one confirmed registered-pet identity.”**

**“StraySafe supports the Barangay in managing the adoption process, but final adoption decisions still require authorized human approval.”**

**“Completing adoption requirements does not automatically mean the applicant is approved.”**

**“Do not expose full home addresses or unnecessary sensitive personal information.”**

**“Subdivision Leaders must only access reports within their authorized jurisdiction.”**

**“Audit logs should answer: Who, What, Which Record, When, Old Value, and New Value.”**

**“GPS accuracy should be tested using actual versus reported location.”**

**“User-entered report data should not be lost because of connectivity problems.”**

## 18. Final Recommended System Direction

The system should focus on making the existing features **solid, measurable, secure, and logically connected** rather than continuously adding new features.

The main chain to demonstrate is:

**AI Analysis → Report Submission → Human Validation → Duplicate Protection → Escalation → Rescue/Dispatch → Holding Facility → Resolution / Barangay Adoption Process → Case Completion → Audit Log**

For adoption cases:

**Holding/Eligible Animal → Available for Adoption → Application → Verification/Assessment → Barangay Human Review → Approval/Rejection → Handover → Monitoring → Completion**

For registered-pet matching:

**AI Possible Match → Human Review → Confirmed Pet Identity → Protect Case from Conflicting Pet Links**

The main objective before the final defense should be to prove that StraySafe 2.0's existing features work correctly together from beginning to end.

---

**Prepared from the provided StraySafe 2.0 consultation notes and updated according to the current Barangay-managed adoption workflow.**