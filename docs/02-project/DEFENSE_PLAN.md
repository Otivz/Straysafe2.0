# STRAYSAFE Capstone Defense Plan

For: Arriola, Kyla Joy · Frias, Kyla Bianca S. · Vito Cruz, Emmanuel F.
Adviser: Herliza F. Estrada, M.I.T.

Fill in the blanks marked **[ ]** once the panel confirms them. Facts about the system come from the code and the project docs as of 2026-10-26; recheck anything you change after that date.

| Item | Value |
|---|---|
| Defense date and time | **[ ]** |
| Room, projector, internet | **[ ]** (ask whether Wi-Fi is available; plan as if it isn't) |
| Time limit | **[ ]** (this plan assumes 20–25 minutes plus Q&A) |
| What the panel expects to see | **[ ]** Chapter 1 only, or Chapters 1–3, or the full study with results |

---

## 1. Where you stand (be ready to say this honestly)

| Area | Status | Action |
|---|---|---|
| System | All four modules built and working locally | Freeze features 5 days before (section 3) |
| Chapter 1 | Rated 8.4/10; 4 statements don't match the system | Apply the copy-paste fixes in [MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md](MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md) |
| AI accuracy (for Chapter 4) | **Not measured yet**: the test tools exist, **0 of about 170 test photos** collected | Collect, label and run them (section 3), or say clearly that it is the next step |
| TAM and ISO/IEC 25010 survey results | **[ ]** status unknown here | If not done, present the instrument and procedure, not results |
| Hosting | Runs on a laptop; cloud deployment (Aiven, Render, Vercel) planned, not done | Demo locally; mention the plan ([DEPLOYMENT_GUIDE](../05-operations/DEPLOYMENT_GUIDE.md)) |
| Priority gap | Residents' app can still send a priority; the manuscript says residents don't set it | Either let the developer fix it before the freeze, or use the reworded manuscript text |

---

## 2. Roles (suggested; adjust to your strengths)

| Person | Presents | Answers questions on |
|---|---|---|
| **Kyla Joy Arriola** | Act 1: problem, rationale, gap, objectives | Background, interviews, literature, SDGs, scope |
| **Kyla Bianca Frias** | Acts 2 and 5: framework, methodology, evaluation, conclusion | IPOF, iterative model, TAM, ISO/IEC 25010, hypothesis, statistics |
| **Emmanuel Vito Cruz** | Acts 3–4: live demo | Architecture, AI, security, database, geofence, deployment |

Rules:
- Whoever is presenting is the only one talking; the others watch the clock and the laptop.
- A question goes to the person who owns that area. If they're unsure, they say "Let me add to that" and hand over, never two people at once.
- One person holds the printed backup sheet (section 9).

---

## 3. Countdown

| When | Task | Owner |
|---|---|---|
| **T−14 days** | Apply the Chapter 1 fixes; number the Specific Problems and Objectives 1–7 | Kyla Joy |
| T−14 | Decide: fix the priority gap in code, or use the reworded text | Team + developer |
| T−14 | Start collecting AI test photos (folders and counts in `AI_TODO.md` section 3) | All three |
| **T−10** | Slides draft, following section 4 | Kyla Bianca |
| T−10 | Clean demo database (section 6) and a written demo script (section 5) | Emmanuel |
| T−7 | Label the AI test set (two people separately), run `check_test_set.py` then `evaluate_ai.py`, put the numbers in a slide | Kyla Joy + Kyla Bianca |
| **T−5** | **Feature freeze.** Only fix bugs; commit everything; take a database backup | Emmanuel |
| T−5 | Record the full demo as a video (the backup if anything fails live) | Emmanuel |
| T−4 | Rehearsal 1 with a timer; note every stumble | All |
| T−3 | Rehearsal 2 with someone acting as the panel and asking the section 8 questions | All |
| T−2 | Test the demo on the **defense laptop** with phone hotspot only (no home Wi-Fi) | Emmanuel |
| T−1 | Charge everything; print the backup sheet and manuscript copies; final dry run; **don't use the AI features** (save the Gemini quota) | All |
| **T−0** | Arrive early; start the system (section 6) at least 30 minutes before | Emmanuel |

---

## 4. Presentation outline (about 22 minutes)

| Time | Act | Content | Slides |
|---|---|---|---|
| 0:00–3:00 | **1. Problem** | Bite and rabies figures (cite them), how San Vicente reports today (Facebook, Messenger), what the interviews found: delays, lost and duplicate reports, no records | 3–4 |
| 3:00–5:00 | **2. Gap and solution** | The gap: no single system combines image checks, duplicate detection, heatmaps and subdivision-to-barangay validation. STRAYSAFE in one picture: four roles, four modules | 2 |
| 5:00–6:30 | **2. Objectives and scope** | 7 objectives; what is out of scope (no veterinary diagnosis, no SMS, AI only as decision support) | 2 |
| 6:30–16:30 | **3–4. Live demo** | The story in section 5 | (live) |
| 16:30–19:30 | **5. Method and evaluation** | IPOF framework, iterative incremental model, TAM (PEOU, PU) and ISO/IEC 25010:2023, one-tailed one-sample t-test against 2.51; AI test set and results (or plan) | 3–4 |
| 19:30–22:00 | **6. Conclusion** | What it improves (efficiency, transparency, accountability), limitations, next steps (deployment, wider pilot, more AI data) | 2 |

Keep slides light: one idea per slide, large text, real screenshots from the system.

---

## 5. Live demo script (10 minutes, one story)

Tell it as one case following one dog, so the panel sees the whole workflow. Use **three browser windows side by side or switch tabs** (resident, subdivision leader, barangay staff), all already signed in.

| # | Who | Do | Say (one line) |
|---|---|---|---|
| 1 | Public | Open the landing page, then scan a pet QR card with a phone | "Anyone can scan a tag and reach the owner, no account needed." |
| 2 | Resident | Report a stray: photo, condition, pin on the map inside the coverage area | "One form instead of a Facebook post: photo, location, condition." |
| 3 | Resident | Show the AI checks on the report (dog detected, photo check) | "AI suggests; people decide." |
| 4 | Leader | Open the dashboard map, tap the pin, open the report, show the duplicate suggestion | "Duplicates are flagged before anyone wastes a trip." |
| 5 | Leader | Validate, set priority, endorse to the barangay with the letter | "Tier one: the subdivision validates." |
| 6 | Barangay | See the endorsed report, assign a rescuer, show directions from the hall | "Tier two: the barangay dispatches with routing." |
| 7 | Barangay | Move the rescue to on site, then intake in the holding facility | "Every step is timestamped." |
| 8 | Resident | Show the report timeline updated and the notification | "The reporter finally knows what happened." |
| 9 | Barangay | Review an owner's claim with proof (vaccination card or photos) and hand the animal back | "Owners get their pet back only with proof." |
| 10 | Barangay | Impound an animal that passed the stay limit unclaimed | "Unclaimed animals are impounded on record." |
| 11 | Admin | Show the audit log entry for one of the actions above, and the heatmap | "Every action is traceable." |

Prepare steps 7–10 **before** the defense (a case already in holding, a pending claim, and an animal past the stay limit), so you only open them live.

---

## 6. Demo setup on the day

**Start the system** (from [setup.md](../05-operations/setup.md); three terminals):
1. Backend: `cd backend` → `..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000` (no `--reload` for the demo).
2. AI worker: `cd backend` → `..\.venv\Scripts\python.exe -m app.ai_worker`.
3. Website: `cd frontend` → `npm run dev:https` (the phone's camera, QR scanner and GPS need https).

**Before the panel arrives:**
- [ ] Sign in to the resident, leader, barangay staff and admin accounts in separate browser profiles (one account per browser; see the sign-in note in the app).
- [ ] Open every page you will show once, so it's loaded.
- [ ] Phone on the same network (hotspot), opened at `https://<laptop-IP>:5173`, certificate warning already accepted.
- [ ] The demo dog photo is on the laptop, ready to upload.
- [ ] Projector resolution checked; browser zoom at 100–110%.
- [ ] Notifications and messengers on the laptop turned off.

**Demo data:**
- Use the seed accounts (`backend/scripts/seed_admin.py`); **don't show real residents' names, phones or addresses.** If the database holds real people's data, make a demo copy.
- Back up the database the day before (`mysqldump`), so you can restore it if a rehearsal changes data.

---

## 7. Risks and backups

| Risk | Why it matters | Backup |
|---|---|---|
| **Gemini free quota** (about 20 requests per model per day) | AI photo checks stop working when it runs out | Don't use AI features the day before or during rehearsals that day; prepare a report whose AI results already exist; mention that YOLO runs locally |
| No internet at the venue | Maps (OpenStreetMap), directions (OSRM), Gemini, Cloudinary photos and email all need internet | Phone hotspot; the recorded demo video; screenshots in the slides |
| Laptop fails | — | Second laptop with the project, database backup and video |
| A page errors live | — | Stay calm: "Let me show the recording of this step," then continue |
| Phone can't reach the laptop | Different network, firewall | Same hotspot for both; allow Python and Node through Windows Firewall; or show the phone part in the video |
| Running over time | Panel cuts the demo | Rehearse with a timer; mark steps 8 and 11 as optional |

---

## 8. Likely panel questions and how to answer

Answer short, then offer to show it in the system.

**About the AI**
- *How accurate is your AI?* If measured: give the numbers from `evaluate_ai.py`. If not: "We built the evaluation tools; the labeled test set is our next step. In the system, the AI only suggests; every decision is confirmed by an official." Don't invent a percentage.
- *Why YOLOv8 and Gemini?* YOLOv8 runs locally and quickly to detect cats and dogs (Terven et al., 2023); Gemini checks photo authenticity and describes the animal. Both are decision support.
- *What if the AI is wrong?* Nothing happens automatically: leaders confirm duplicates, priorities and matches; residents can dispute a wrong match.
- *What is "photo authenticity"?* A check for AI-generated or edited images, so fake reports don't waste a trip.

**About the workflow**
- *Why two tiers?* Subdivision leaders know their area and filter false or duplicate reports, so the barangay only gets verified cases, matching the barangay system.
- *How do you prevent duplicate reports?* Duplicate suggestions by image similarity and location; a leader merges them and the audit log keeps both.
- *How is priority decided?* Use the wording you chose in section 1 (system-suggested, confirmed by officials).
- *What is the geofence?* Reports are accepted only within a radius around the subdivision center that the administrator sets; outside reports are refused by the server.

**About security and privacy (RA 10173)**
- *How do you protect personal data?* Role-based access enforced on the server; private reports are visible only to the reporter and officials; reporter names are hidden from other residents; passwords hashed; sign-in tokens expire; admins sign in with an emailed code; every action is in the audit log.
- *Can a user give themselves more access?* No: a person can only edit their own personal details; roles and Head Officer status are set by the administrator (tested).
- *What about consent?* **[ ]** Show where users accept the privacy notice at registration; if it isn't there, say it is part of deployment.

**About the evaluation**
- *Why a four-point scale and 2.51?* No neutral middle option forces a stance; 2.51 is the lower bound of "Agree/Acceptable".
- *Why a one-sample t-test?* You compare the mean rating to a fixed benchmark; one-tailed because the hypothesis is "higher than 2.51". Know your sample size and how respondents were chosen.
- *Why are the ISO ratings descriptive?* There are few IT experts, too few for an inferential test.
- *Why do end users skip Maintainability?* They can't judge the code.

**About scope and technology**
- *Why a web app and not a mobile app?* One system works on any device; it is also packaged as an Android app.
- *Does it work offline?* No, stated in the delimitation; it needs internet.
- *Why no SMS?* Cost and scope; in-app, email and push notifications cover it.
- *Can other barangays use it?* The design supports it, but the pilot and results are limited to Selera Homes and San Vicente.
- *What is novel here?* The combination for the Philippine barangay hierarchy, not a new algorithm (your Chapter 1 says this well; use the same words).
- *How long did development take, and how did you test?* Iterative increments; automated tests for permissions, chat privacy, reports and claims (about 77 backend test scripts), plus browser checks.

### 8.1 More possible questions, by topic

Practice these in rehearsal 2 (section 3). The person in brackets answers first (section 2). Where the answer depends on your data, it says **[ ]**.

**Opening and general** [Kyla Joy]
1. Explain your system in one minute. *(Problem → two-tier reporting → rescue → holding → claim or impound → records; AI suggests, people decide.)*
2. Who are your clients, and did they agree to the study? *(Selera Homes leaders and Barangay San Vicente; show the endorsement or permission letter **[ ]**.)*
3. What made you choose this topic?
4. What is the single most important feature, and why?
5. If the barangay could use only one module, which one?

**Problem and rationale** [Kyla Joy]
6. How did you confirm the problem actually exists in San Vicente? *(Interviews; who, how many, when **[ ]**.)*
7. How are reports handled today, and what goes wrong? *(Facebook/Messenger posts, no tracking, duplicates, no record of outcomes.)*
8. Where do your bite and rabies figures come from, and are they recent?
9. Why is stray-animal reporting a barangay matter and not only the city veterinary office's? *(Cite the law or ordinance you used.)*
10. How does your system support the Anti-Rabies Act (RA 9482) and Animal Welfare Act (RA 8485)?

**Literature and gap** [Kyla Joy]
11. Name three similar systems and how yours differs.
12. Why didn't you just use an existing app (e.g., a Facebook group or a shelter platform)?
13. Which related study influenced your design most?
14. Your novelty is "integrative"; isn't that just combining existing tools? *(Yes, for a real gap: no system fits the subdivision → barangay hierarchy with validation, AI checks and owner claims in one place.)*

**Objectives and scope** [Kyla Bianca]
15. Read Specific Objective **[n]**. Where is it in the system? *(Be ready to show each objective live in under 30 seconds.)*
16. How will you know each objective was met?
17. Why only one subdivision and one barangay?
18. What is not included and why? *(Veterinary diagnosis, SMS, payments, offline use, other barangays.)*
19. What happens to reports from outside Selera Homes? *(The server refuses them; outside the coverage radius.)*

**Framework and methodology** [Kyla Bianca]
20. Explain your IPOF framework using one real report.
21. Why the iterative incremental model and not Agile/Scrum or Waterfall?
22. What were your increments, and what did each deliver?
23. Why TAM and not UTAUT or SUS?
24. Define Perceived Ease of Use and Perceived Usefulness in your own words.
25. Which ISO/IEC 25010:2023 characteristics did you evaluate, and why those?
26. Who are your respondents, how many, and how were they chosen? **[ ]**
27. How did you validate your questionnaire? *(Expert validation, pilot test, reliability such as Cronbach's alpha **[ ]**.)*
28. Why a four-point scale; doesn't it force answers? *(It removes the neutral midpoint on purpose.)*
29. State your null and alternative hypotheses.
30. What is your level of significance, and what if you fail to reject the null?
31. What are the assumptions of a one-sample t-test, and does your data meet them? *(Normality; with a small sample, check it **[ ]**.)*
32. How will you interpret a mean of, say, 3.2?

**AI and image processing** [Emmanuel]
33. What model did you use for cat/dog detection, and was it trained by you? *(Pre-trained YOLOv8; not retrained; say so.)*
34. What dataset will you test it on, and how big is it? *(About 170 photos, 10 videos, 40 pairs planned; status **[ ]**.)*
35. Which metrics will you report? *(Accuracy, precision, recall, F1, from `evaluate_ai.py`.)*
36. How does duplicate detection work? *(Image similarity plus distance and time between reports; a leader confirms.)*
37. How does lost-pet matching work, and what stops false matches?
38. What happens if Gemini is down or the quota runs out? *(The report is still saved; AI results are retried or marked unavailable; people decide.)*
39. Do you send residents' photos to Google? Is that allowed under RA 10173? *(Yes, to the Gemini API for analysis; mention it in the privacy notice **[ ]**.)*
40. Can someone fool the AI with a photo from the internet? *(The authenticity check flags likely edited or AI-made images; the leader still validates.)*
41. **Why don't you use machine learning? / Why didn't you train your own model?**
    - First, correct the premise politely: "We do use machine learning. YOLOv8 is a deep-learning model, a type of machine learning, and Gemini is a machine-learning model too. What we didn't do is **train our own model from scratch**."
    - Why not train our own:
      1. **No local dataset.** Training needs thousands of labeled photos of San Vicente strays; none exist, and collecting and labeling them is a study by itself.
      2. **Pre-trained models already do the job.** YOLOv8 is trained on large public datasets that include cats and dogs; detecting "is this a cat or a dog" doesn't need a custom model.
      3. **Scope and focus.** Our study is an information system for the reporting and rescue workflow, not an AI research study. Our novelty is integrative (Chapter 1), not a new algorithm.
      4. **Time and hardware.** Training and tuning need GPUs and months; the pre-trained model runs on an ordinary laptop.
      5. **Accountability.** The AI is decision support only; officials make every final decision, so a pre-trained model with human checking is enough and safer.
    - Why priority and the geofence use rules, not ML: rules are **explainable and predictable**. An official can see why a report is high priority or why it was refused; an ML guess can't be explained to a resident.
    - Future work: once the system collects real, labeled reports, that data can be used to fine-tune a model for local conditions.
    - Don't claim an accuracy figure until `evaluate_ai.py` has been run on your test set.

**Database and architecture** [Emmanuel]
42. Draw or explain your architecture. *(React web app and Android app → FastAPI → MySQL; Cloudinary for photos; AI worker; Gemini; email.)*
43. How many tables, and which are the main ones? *(Users, reports, rescue assignments, holding animals, pets, pet claims, audit logs.)*
44. Show your ERD and explain one relationship.
45. Why MySQL and FastAPI?
46. How do you handle two officials editing the same report at once? *(Server-side state checks; status changes are validated.)*
47. How do notifications reach users? *(In-app, email and web push; near-real-time by refresh, no SMS.)*
48. How does the map get routes? *(OpenStreetMap tiles and OSRM routing; needs internet.)*

**Security and data privacy** [Emmanuel]
49. Where is the role check done: in the page or on the server? *(On the server; hiding a button is not security.)*
50. What if someone copies a resident's token? *(Tokens expire; logout revokes them; refresh is limited.)*
51. How are passwords stored? *(Hashed, never plain text; 12+ characters with a policy.)*
52. Where are API keys stored? *(Server environment only, never in the app code or the repository.)*
53. How long do you keep data, and can a user delete their account? **[ ]**
54. Who can see a reporter's name and phone number?
55. Can a resident read another person's report chat? *(No; access is checked per thread on the server, and it is tested.)*
56. Can a barangay staff member make themselves Head Officer? *(No; only the administrator; tested.)*
57. Can a pet owner erase their dog's bite history? *(No; verified history comes from incident reports and can only be changed by officials.)*

**Testing and quality** [Emmanuel / Kyla Bianca]
58. How did you test the system? *(Automated backend tests, browser checks, user acceptance testing **[ ]**.)*
59. What was the hardest bug, and how did you fix it?
60. Did real users try it? What did they say? **[ ]**
61. How does it perform with many reports? *(Paged lists; not load-tested; say so.)*
62. Does it work on low-end phones and slow internet?

**Deployment and sustainability** [Emmanuel]
63. Is the system online now? *(Not yet; the deployment plan is ready: database on Aiven, API on Render, website on Vercel.)*
64. Who will maintain it after you graduate? Who pays for hosting?
65. How much does it cost to run per month? *(Free tiers for the pilot; list the paid limits **[ ]**.)*
66. What training do barangay staff need? *(User manual and an orientation **[ ]**.)*
67. How do you back up the data?

**Claims and records** [Kyla Bianca]
68. How do you check that a claimant really owns the pet? *(Vaccination card, veterinary records or photos, reviewed by Barangay staff before handover.)*
69. Why is there no adoption? *(The panel did not approve it, so it was removed; unclaimed animals are impounded.)*
70. Can the barangay keep an animal longer than the stay limit? *(Planned: staff can extend the hold at any time before impounding **[ ]**.)*
71. What happens to an animal no one claims? *(After the stay limit it is impounded and the case is closed on record.)*

**Limitations, ethics and future work** [all]
72. What are the biggest limitations of your system?
73. What would you add with six more months?
74. Could the system be misused, for example false reports against a neighbor's pet? *(Leader validation, audit log, disputes.)*
75. How does your study support the SDGs you cited?
76. If the panel asks for a change to the system, how long would it take you? *(Be honest; ask for the exact requirement.)*

**Quick demo requests the panel may make** [Emmanuel]
Be ready to show any of these within 30 seconds:
- a report outside the coverage area being refused;
- a duplicate report being merged;
- the audit log entry for an action you just did;
- a resident trying to open a page for officials (blocked);
- the certificate verification page with a wrong number;
- the heatmap filtered to one month.

**How to handle a question you can't answer**
- "That's a good point. We haven't measured that yet; it's part of our next step." Then write it down.
- Never invent numbers, sources or features. If unsure whether something exists in the system, say you'll confirm and show it after.

---

## 9. Printed backup sheet (one page, keep on the table)

- The 7 objectives, numbered, one line each.
- The demo story (section 5), steps only.
- Key numbers: bite and rabies figures with sources, San Vicente population (PSA 2025), the 2.51 benchmark, sample sizes **[ ]**, AI results **[ ]**.
- Account list for the demo (names only; passwords stay with the developer).
- Commands to start the system (section 6).

---

## 10. Day-of checklist

- [ ] Laptop and backup laptop charged; chargers; HDMI and USB-C adapters
- [ ] Phone charged, hotspot tested, QR card printed
- [ ] System started 30 minutes before; all four accounts signed in
- [ ] Demo video on the desktop and on a USB drive
- [ ] Slides on the laptop, USB drive and cloud
- [ ] Printed manuscript copies for the panel, backup sheet, pens
- [ ] Laptop notifications off; screen sleep off
- [ ] Water

After the defense: write down every panel comment and who raised it, the same day; it becomes your revision list.
