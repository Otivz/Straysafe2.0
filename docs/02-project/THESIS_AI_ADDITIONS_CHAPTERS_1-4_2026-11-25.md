# Adding the AI Features to Chapters 1 to 4

> **Status:** Current
> **Date:** 2026-11-25
> **Checked against:** `STRAY-SAFE_Chapters1-4_Revised_9_f_41 (1).pdf`. Page numbers are the printed page numbers of that file.

## 1. The AI the system uses

| AI | Where it runs | What it does |
| :--- | :--- | :--- |
| **YOLOv8n** (Ultralytics) | On the application server | Detects dogs and cats in photos and video frames |
| **Google Gemini API** | Google's cloud | Suggests animal details, checks photos (no animal, possibly AI-generated), compares look-alike pets, and writes case insights and analytics summaries |

**Not AI** (do not describe these as AI): Pillow colour reading (the backup when Gemini is unavailable), OpenCV video frame selection, and the rule-based starting priority, same-occurrence suggestions and match scoring.

## 2. Where AI is missing in the manuscript

| Chapter | Place | What to do |
| :--- | :--- | :--- |
| 1 | Related Literature | Nothing on AI. Add a short subsection (3.1) |
| 1 | Conceptual Framework and Figure 1.1 (pp.28–30) | Only "rule-assisted". Add AI in the text and the figure |
| 1 | Definition of Terms (pp.31–35) | Add "AI-Assisted Suggestion" (3.2) |
| 1 | Delimitations (pp.22–23) | Add the availability limit (3.3) |
| 2 | Functional Requirements, Module 3 (p.59) | No AI requirement (3.4) |
| 2 | Tools and Technologies, Table 2.6 (pp.109–112) | YOLOv8 and Gemini are not listed (3.5 and 3.6) |
| 2 | Ethical Considerations (p.49) | Does not say that photos go to a third-party AI (3.7) |
| 3 | Results | Already covered (p.121 and TC-TRI-14 to TC-TRI-16) |
| 4 | Summary of the Study and Findings, Objective 3 (pp.178, 180) | AI is left out, unlike Chapter 1 (3.8 and 3.9) |

## 3. Text to paste

### 3.1 Chapter 1, Related Literature: "AI-Assisted Image and Text Analysis"

> Object detection models can locate and classify animals in images, and generative AI models can describe visual content and summarize text. In STRAYSAFE, a YOLOv8 model (Jocher et al., 2023) detects dogs and cats, and the Google Gemini API suggests animal details, checks submitted photos, and summarizes cases. Because automated results can be wrong, the system treats them as suggestions that a person reviews.

This is a starting paragraph. Add one or two published studies to it before submission.

### 3.2 Chapter 1, Definition of Terms (Operational)

> **AI-Assisted Suggestion.** In STRAYSAFE, an advisory output of an AI model, such as suggested animal details, a photo check, a look-alike pet, or a case summary with a suggested priority. It never blocks a report, decides identity or ownership, or closes a case. A Resident or Subdivision Leader confirms, edits, or ignores it.

### 3.3 Chapter 1, Delimitations

> The AI-assisted suggestions depend on the availability and usage limits of a third-party service. When the service is unavailable, reports are still accepted, only basic local checks are performed, and breed and size are not suggested.

### 3.4 Chapter 2, Functional Requirements, Module 3

> **AI-Assisted Suggestions:** The system shall suggest animal details from photos and videos, flag images that show no animal or appear AI-generated, suggest look-alike registered pets, and provide an optional case summary with a suggested priority and category check. Every suggestion shall be editable or ignorable, shall never block a report, and shall never confirm identity or ownership.

### 3.5 Chapter 2, Tools and Technologies: "Artificial Intelligence Services"

> STRAYSAFE uses YOLOv8n, which runs on the application server, to detect dogs and cats in photos and video frames selected with OpenCV. The Google Gemini API analyzes images and redacted text to provide advisory suggestions. When it is unavailable, the system falls back to local detection and basic color reading.

### 3.6 Table 2.6, new rows

| Category | Tool / Technology | Purpose |
| :--- | :--- | :--- |
| Object Detection | YOLOv8n (Ultralytics) | Detects dogs and cats |
| AI Analysis | Google Gemini API | Suggests details, checks photos, summarizes cases |
| Media Processing | OpenCV, Pillow | Selects video frames and reads basic colors |

### 3.7 Chapter 2, Ethical Considerations

> Submitted photos may be sent to the Google Gemini API for analysis. For case summaries, personal details are removed from the text before it is sent. Residents are informed that AI results are advisory and are reviewed by a person.

**Keep the last sentence only if the consent form or the app really tells Residents this.**

### 3.8 Chapter 4, Summary of the Study: replace item (3)

> (3) rule-assisted and AI-assisted report review for duplicate and same-occurrence checking, animal characteristic recording with details suggested from photos, and lost-and-found matching;

### 3.9 Chapter 4, Findings for Objective 3: add

> On a sample of 46 checks, the AI-assisted suggestions gave the expected result in 43 (93.5%). The three misses were corrected or matched manually by the Subdivision Leader.

## 4. Errors to fix while editing

1. **Table 3.10 (p.155) has wrong counts.** Its rows add up to 64, not 77. The test cases and passes should be: Objective 1 = 18, Objective 2 = 17, Objective 3 = 8, Objective 4 = 8, Objective 5 = 12, Objective 6 = 14.
2. **TC-TRI-14 (p.138)** still says "see AI Accuracy Evaluation tab", a leftover from a spreadsheet. Delete it.
3. **Hotspots:** the application now has a hotspot overlay on the cases map and an AI trend and hotspot summary on Analytics, but the manuscript says there is no hotspot analysis (for example pp.23, 34, 62, 110 and TC-CLO09). Reword the manuscript or hide the feature.

## 5. Sources to verify

- Jocher, G., Chaurasia, A., & Qiu, J. (2023). *Ultralytics YOLOv8* [Computer software]. https://github.com/ultralytics/ultralytics

Open the link and check the citation before using it. The literature subsection also needs one or two published studies.
