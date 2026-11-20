# Multi-attribute animal matching

Status: Current (2026-11-19). Engine: `backend/app/utils/match_scoring.py`. Used by `backend/app/services/lost_found_matching.py` (lost-pet ↔ found-animal reports) and `backend/app/routes/matches.py` `calculate_match_details` (report ↔ registered pet in the Pet Registry). Leader review: `frontend/src/admin/dialogs/MatchDialogs.tsx`, `frontend/src/admin/components/MatchParts.tsx`. Tests: `backend/tests/test_multi_attribute_matching.py`, `backend/tests/test_lost_found_matching.py`.

Matching results are **suggestions for a person to review**. Nothing here confirms ownership, links reports, resolves a Lost report, marks a Found report returned, transfers a pet or declares a reunion. Those stay with the existing flows: a Leader's confirmation links two reports ([LOST_FOUND_MATCHING.md](LOST_FOUND_MATCHING.md)), only the owner's confirmation recovers a pet ([LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md)), and registry matches keep their staff-and-owner verification ([PET_REGISTRATION_AND_MATCH_REVIEW.md](PET_REGISTRATION_AND_MATCH_REVIEW.md)).

## What changed

Before 2026-11-19, the lost/found score added fixed points from the reports' text and never looked at photos or breed. The registry score was **either** the Gemini Vision photo score alone (when the AI answered) **or** a rule-based score. Both now use one engine that compares five attributes and combines them.

## The five attributes

Each attribute gets a 0–100 score only when both records say enough about it. Otherwise it is "not compared", which is never treated as a zero.

| Attribute | Default weight | What is compared |
| --- | ---: | --- |
| Visual similarity | 35 | The stored Gemini Vision comparison of the two photos (`utils/ai_matching.py`, same prompt as before). For lost/found pairs it is run when a Leader asks ("Compare photos (AI)"). For registry candidates it runs on the top candidates of a scan, as before. Only when the administrator has the AI switched on. |
| Location | 20 | Haversine distance between the two pins: **Very Near** (≤200 m, 100), **Nearby** (≤600 m, 85), **Same Subdivision** (≤2 km or same subdivision, 65), **Farther Away** (50 falling to a floor of 20, never 0), **Unknown** (no pins, not compared). Without pins, the same subdivision scores 60 and different subdivisions score 35. A registered pet's location is its registered home pin. Distance is never a reason to reject a candidate. |
| Breed | 15 | Names are normalized (spelling variants, local names such as askal → Aspin and Pusang Pinoy → Puspin, "X mix"). The same breed scores 100. Aspin or Puspin vs mixed scores 65. Mixed or native vs a named breed scores 40. Related names score 55. Different named breeds score 10. "Unknown", "not sure" or a blank on either side means Insufficient Breed Information (not compared). |
| Coat colour | 15 | Colours are grouped into families (cream/beige, tan/fawn, golden/yellow …). Shared families count fully and near shades count half, with a bonus when the main (first-named) colour agrees. Coat patterns (spotted, patched, tabby, brindle, merle, tricolor, tuxedo …) adjust the score when both records name one. Marking phrases ("a white chest", "white socks") are not coat colours: the description compares them. |
| Physical description | 15 | About 30 characteristics are read from the descriptions, markings, condition and colour text. Distinctive ones (scars, eye marks, ear notches, a white tail tip, a kinked tail, odd eyes, a missing eye) weigh 3. Others (white paws, a short tail, curly fur, a tag) weigh 2. Generic ones (floppy ears, short fur, size) weigh 1. The score is the shared weight over the smaller description's weight, minus contradictions (floppy vs erect ears, long vs short fur, small vs large, left vs right eye mark). Generic-only overlap is capped at 55. With no recognisable characteristic, shared wording counts up to 60. "No collar" is not a collar. Nothing is inferred or invented. |

A different kind of animal (dog vs cat) is excluded before scoring. For lost/found pairs, an animal reported found more than 12 hours before the pet was last seen missing is held at Low Similarity.

## Combining them

- **Combined score:** the weighted average of the attributes that could be compared. The weights of the missing attributes are spread over the rest ("effective weight").
- **Coverage:** the share, by weight, of the comparison that was possible. It is shown on every candidate ("4 of 5 attributes compared · 80% of the information").
- **No inflation:** below 50% coverage the score is reduced in proportion (one attribute at 100% with 20% coverage shows 40%), and a note says so.
- **Classification** (configurable thresholds):
  - **Strong Possible Match:** score ≥ 75, with at least 3 attributes compared and coverage ≥ 50%.
  - **Potential Match:** score ≥ 55.
  - **Low Similarity:** below 55, or held there by a contradiction.
  - **Insufficient Information:** fewer than 2 attributes compared, or coverage under 35%.
- **What gets suggested:** lost/found pairs are suggested only when Strong or Potential. Registry pets need Strong or Potential, plus the existing minimum score and no "NOT A MATCH" photo verdict.
- **Wording:** every result says that similarity is not a probability of ownership.

**Configuration** lives in `system_settings.matching_config` (JSON with weights, thresholds and distances), validated over the defaults. The Leader can read it at `GET /lost-found/matching-config`; only the Administrator can change it at `PUT /lost-found/matching-config` (audited as `MATCHING_CONFIG_UPDATED`). Undecided suggestions use the new values when they are recalculated; decided ones keep their result.

## Explanations

Every attribute carries one sentence built from the comparison itself, for example "Nearby: approximately 336 m from where the pet was last seen.", "Strong breed match: both records say Aspin.", "Coat colour match: both records describe a brown and white animal.", or "Description match: both records mention a mark near the left eye, a white chest marking, a medium size." Attributes that could not be compared say why. Explanations are never generated beyond what the two records contain.

## Lost and found review (Leader)

- **Statuses:**
  - `pending`: Suggested Match.
  - `under_review`: Under Review.
  - `confirmed`: Verified Match; the reports are linked through the existing confirmation.
  - `rejected`: Not a Match.
  - `moot`: no longer applies.
- **Stored on each suggestion:**
  - `analysis`: the full breakdown;
  - `algorithm` (`multi-attribute-v1`);
  - `history`: earlier results, each with its score, classification, attribute scores and why it was replaced;
  - `visual`: the stored AI photo comparison;
  - `review_note`: the reviewers' notes, each line with name and time.
- **Recalculation:** happens when the reports are checked again, after new photos or details (the AI follow-up job), on "Recalculate", or after a photo comparison. The earlier result is moved to `history`, never silently overwritten. An unchanged result adds nothing, and a decided match keeps the result it was decided on.
- **Decisions:**
  - `POST /lost-found/matches/{id}/decision` with `{"decision": "under_review" | "confirm" | "reject" | "reopen", "note"}`.
  - A confirmation or rejection records the lost and found reports, the reviewer (`decided_by`), the date and time (`decided_at`), the notes and the final status.
  - Every decision is audited with the previous status and the scores.
- **Actions in the comparison dialog:**
  - the breakdown (overall similarity, classification, coverage, each attribute's score, bar, explanation and effective weight, what could not be compared);
  - Recalculate, and Compare photos (AI), which needs a photo on both reports and the AI switched on;
  - review notes;
  - Mark as Under review, Not a match, and Confirm verified match: link them;
  - earlier results.
- **Under review** still counts as waiting: it stays in the work queue and on both reports.
- **The Leader's notification** ("Potential Animal Match Detected") names both report references and the similarity, never a resident, and links to the report. One is sent per new suggestion batch, and a pair is never suggested twice.

## Pet Registry candidates

`calculate_match_details` scores a registered pet with the engine, using the Gemini result as the visual attribute when there is one. The stored `ai_evidence` keeps its earlier fields and adds `multi_attribute` (the full breakdown) and `single_engine_score` (what the old single-engine score would have been). A recalculated suggestion keeps its earlier score in `ai_evidence.history`. The existing verification flow (`POST /matches/{id}/verify`, the owner's confirmation) is unchanged. Duplicate-sighting detection (report ↔ report) still uses its own scoring, because it is a different question that depends on time.

## Privacy

- Explanations give distances, never addresses.
- Lost/found matches are visible only to the Leaders of the subdivision and the Administrator.
- For registry matches, a resident who is not the pet's owner never sees the distance to that owner's home pin: `_redact_for_resident` removes it and keeps only the proximity class.
- Audit rows hold scores and explanations, never contact details.

## Schema

There are five nullable columns on `lost_found_matches`: `analysis` JSON, `algorithm` VARCHAR(40), `history` JSON, `visual` JSON and `review_note` TEXT. `under_review` fits the existing status column. They are added at start-up by the case alignment step (`ensure_lost_found_match_columns`) and also in `backend/migrations/2026-11-19_multi_attribute_matching.sql`. Both are additive and idempotent. Registry matches needed no schema change.

## Limits

- The AI photo comparison for lost/found pairs runs only when a Leader asks, so as to keep Gemini calls (cost, latency) under control. Without it, the visual weight is spread over the other attributes and the coverage shows it.
- The description reader is a fixed vocabulary of English characteristics. Words outside it are only compared as shared wording, with a capped score.
- There is no Leader screen for registry candidates in the current Leader app (none existed before): their improved scores and explanations reach the existing match endpoints and the owner's flow.
- The default weights and thresholds are starting values, not calibrated on real cases yet.
