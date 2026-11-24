# AI in report analysis: proposal

- **Status:** Proposal only. Nothing is built and no code was changed.
- **Date:** 2026-11-23
- **Builds on:** [AI_COMPONENTS.md](../01-system/AI_COMPONENTS.md) (YOLOv8 nano, optional Gemini, rule-based fallback)

## 1. Idea

Use the AI components StraySafe already has to help the Subdivision Leader read and analyze reports faster. The AI only **suggests**. The leader decides every status, priority and outcome.

## 2. Where AI could help

### A. Per-report analysis (case page)

| Idea | What the AI does | The leader still decides |
|---|---|---|
| Urgency suggestion | Reads the description and photos for signs such as bleeding, aggression or a trapped animal, and proposes a priority | Priority and Urgency in the Assessment |
| Report summary | Gives a 2–3 line summary of the report, its updates and sightings | Nothing; read-only |
| Evidence check | Flags photos that are blurry, show no animal, or contradict the description | Evidence sufficiency |
| Category check | Suggests when a report is filed under the wrong category (for example "found animal" when it describes a bite) | Category and merging |
| Duplicate and related reports | Spots reports about the same animal or incident from text, photos and location | Linking |
| Animal details from photo | Suggests species, breed and colours (YOLO crops, Gemini describes) | Edits to the record |

### B. Cross-report analysis (Reports page)

- Plain-words trend summaries, for example "bite reports on one street doubled this month".
- Hotspot explanations next to the heatmap.
- Repeat complaint patterns, for example several noise complaints about the same household.
- A monthly digest for the leader.

## 3. Rules it must follow

1. **Suggest only.** Results appear as "AI suggestion". The AI never changes a status, priority or closes a case.
2. **Fail closed.** If Gemini is off, unreadable or times out, the screen works exactly as it does today.
3. **No personal data leaves the server.** The AI may see animal descriptions, photos and area names. It must never see reporter or owner names, phone numbers, addresses, or complaints about a named neighbour (those stay private).
4. **Show reasoning and confidence.** Say so when information is missing; do not guess.
5. **Administrator control.** Reuse the Admin Settings switch (`gemini_vision_matching`) or add one beside it.
6. **Log every AI use** (what was asked, what it suggested, and what the leader chose) so it can be reviewed.
7. **Keys and test data.** The API key stays in `.env` only. Do not send real identity, medical or payment data while the system uses test or mock data.
8. **Timeouts.** Keep the existing limits: 15 s per call and 35 s in total, then fall back.

## 4. Recommended order

1. **Urgency and summary suggestion** on the case Assessment. Most useful and lowest risk, because it reads only one report.
2. Evidence check and category check.
3. Trend summaries and hotspot explanations on the Reports page.
4. Duplicate and related-report suggestions (the matching code already exists; reuse it).

## 5. Open questions

- Photos only, or text and photos together?
- May report text go to Gemini (cloud), or must it stay local? This changes the design a lot.
- Is this for the defence demo or for real use? A demo can use the demo data freely.
- Who may see AI suggestions: the Subdivision Leader only, or also the Administrator?

## 6. Before building

- Run `backend/scripts/evaluate_ai.py` on a labelled photo set. The AI test set has 0 photos today, so no accuracy can be quoted yet.
- Write a short spec for the chosen first step and get it approved.
- Add the change record and update [docs/README.md](../README.md) with the build.
