# Adoption and impoundment of an animal that has an owner: plan

- **Status:** Proposal. Nothing in this plan is built yet.
- **Written:** 2026-11-03, from a test run of the scenario on a throwaway database.
- **Scope:** a registered pet (the report is linked to a pet record that has an owner) that is in the Barangay holding place past the stay limit and has not been claimed.

## Explanation

### The situation

- A registered, owned dog ends up in the Barangay holding place.
- The Barangay's stay limit (one server-side value, default 7 days) passes and nobody claims the animal.
- Question: can staff impound it or put it up for adoption?

### What the system does today (tested 2026-11-03)

- **Promote to adoption (the Adopt button):** refused with "This animal is linked to a registered pet with an owner, so it cannot be put up for adoption. Return it to the owner through a claim, or unlink the pet record if the match is wrong."
- **Set For Adoption directly (the status update API):** allowed. This is a gap. The owned-pet rule lives only in the promote route (`routes/adoptions.py`), not in the holding status update (`PATCH /holding/{id}`). The pet is then marked For Adoption while the catalog hides it. The same applies to setting Adopted.
- **Impound after the stay limit:** allowed, for regular Barangay staff too. The case closes (report status 11, custody "Impounded") and the pet stays registered to its owner. Nothing checks whether the animal has an owner or whether the owner was contacted.
- **The owner's claim after the impound:** refused (409): "The animal was released from the holding place; nobody is holding it now." A claim filed before the impound works.
- **Unlinking the pet record** (the escape route named in the adoption message) is controlled: staff can do it only when the owner rejected the match or staff marked it "Not a match", and it is refused once both confirmed it.

### Why it matters

- An owner's registered dog can be impounded without the owner being told, and the owner then can't use the claim flow.
- The adoption rule can be bypassed by calling the status update directly.
- A panel member could test either one.

### Proposed rules

- **Adoption of an owned pet:** never. It goes back to its owner through a claim. Enforce this in every path (promote and the direct status update), not only the Adopt button.
- **Adoption of an animal with no owner:** unchanged. Allowed after the stay limit. Before it, only the Head Officer or an Administrator, with a reason (already built).
- **Impounding an owned pet:**
  - only the **Head Officer or an Administrator**, not regular staff;
  - only after the stay limit, or earlier with the existing early-override reason;
  - the person must **confirm the owner was contacted** and record a note (for example "Called, no answer", "Visited the house");
  - the confirmation and note are saved in the audit log and on the animal's timeline.
- **Impounding an animal with no owner:** unchanged (stay limit, early override with a reason).
- **Owner claims after an impound:** decided later (see Phase 3). Impounding does not normally end an owner's right to redeem the animal, and the claim fees already cover the RA 9482 fine.

### The owner who never responds (abandoned owned pet)

- **Today there is no path for it.** The system treats "has an owner but is silent" the same as "has an owner who is claiming".
- Putting the animal up for adoption is refused, and the unlink route doesn't apply: unlinking works only when the owner rejected the match or staff marked it "Not a match". A silent owner did neither, and marking "Not a match" for the real owner's dog would be wrong.
- The animal's only exit is impoundment, which closes the case. If nothing is done it stays in holding.
- Setting For Adoption directly (the loophole above) doesn't help either: the catalog never lists an owned animal, and applications on it are refused.
- **Options for the Barangay:**
  1. **Notice and deadline:** tell the owner their registered pet is in holding. If it is not claimed within the **allotted time** (see below), the Head Officer records an abandonment decision with a reason and the contact attempts made.
  2. **Release, then adopt:** that decision ends the registration, clears the owner link, and only then allows the adoption process.
  3. **Voluntary surrender:** the owner releases the pet to the Barangay from their own account.
  4. **Keep the current rule (recommended for now):** an owned pet never goes to adoption; after the stay limit it can only be impounded.
- **Allotted time for the owner (needed for option 1):**
  - It is a fixed period the owner is given to claim the animal before the Barangay may treat it as abandoned. It is separate from the stay limit.
  - **One value for the whole Barangay,** stored on the server and changed only by the Head Officer or an Administrator, the same pattern as the stay limit. Suggested starting value: **7 days**, to be agreed with the Barangay. It would not apply to animals with no owner.
  - **The clock starts when the owner has been notified, not when the animal was taken in.** The owner gets an in-app notice (and a push or email notice if enabled) saying their registered pet is in holding, who to contact and the deadline. If the owner can't be reached by the system (no account, or no working contact), staff record each contact attempt (date, method, result) and the clock starts on the first recorded attempt.
  - **The earliest decision date** is the stay limit or the end of the allotted time, whichever is later. With a 7-day stay limit and a 7-day allotted time, an animal can't be treated as abandoned until about day 14 at the earliest, and only if the owner was notified by day 7.
  - **Visible countdown:** the animal's card shows "Owner has until <date> to claim" and, for the owner, a banner on their pet.
  - **A claim at any time before the decision stops the clock.** The owner can still claim until the Head Officer records the decision.
  - **One extension** is possible with a written reason (for example the owner is in the hospital), by the Head Officer or an Administrator, audited like the observation extension.
  - **After the allotted time:** the Head Officer may record the abandonment decision. It is never automatic: the system doesn't release ownership or list the animal by itself.
- **Recommendation:** choose option 4 for now. Option 1 is the right long-term answer, but it changes ownership records, so it needs Barangay agreement, a privacy review and an audit trail, not a rushed addition before the defense.

### What stays the same

- The stay limit, the early override and its audit.
- Claims before an impound.
- Adoption of strays and the adoption pipeline.
- Who can unlink a pet match.

### Risks and decisions

- **Policy question for the Barangay:** may an owner still redeem an animal after it is impounded? Recommended yes. Ask the Barangay what they actually do.
- **Why Phase 3 waits:** reopening claims after an impound changes the claim flow, case closing and fee handling, which is risky close to the defense.
- **Timing:** Phases 1 and 2 are small backend changes with tests. Phase 3 is not planned before the defense.
- **What to say if asked before it is built:**
  - "An owned pet can't be put up for adoption; it has to go back to its owner through a claim."
  - "After the stay limit, the Head Officer can impound an unclaimed animal. Requiring a recorded contact with the owner first, and letting the owner redeem an impounded pet, are planned refinements."
  - Don't say an owned pet can never be impounded; today it can.
  - If asked about an owner who never responds: "The animal can't be adopted out while it has an owner. The Barangay can contact the owner and, after the stay limit, impound it. A formal abandoned-pet process, with notice to the owner, a deadline and a Head Officer decision before adoption, is a recommended next step."

## Worked example: Brownie

This story shows what happens today and what each phase changes. The names are made up.

### Setup

- **Maria** owns **Brownie**, a registered Aspin in Selera Homes.
- Brownie wanders out. A neighbor reports a stray dog and the Barangay team picks him up. The report is linked to Brownie's pet record, so the system knows he has an owner.
- Brownie enters the Barangay holding place on **Nov 1**.
- Stay limit: 7 days. Allotted time for the owner (Phase 5): 7 days.
- **Staff Cruz** is regular Barangay staff. **Head Reyes** is the Head Officer.

### Part 1: Staff try to adopt him out early

- **Day 2, the Adopt button:** refused, today and after the plan. The stay limit hasn't passed, and Brownie has an owner.
- **Day 2, the shortcut:** Cruz sets the status to "For Adoption" directly.
  - Today: it works (the loophole); Brownie is marked For Adoption although the public catalog hides him.
  - After Phase 1: refused, with the same message as the Adopt button.

### Part 2: Nobody claims him

- **Day 7:** the stay limit passes and Maria has not claimed Brownie. Maybe she never saw the notice.
- **Day 7, Head Reyes wants to clear space and impounds him.**
  - Today: it works at once and nobody checks whether Maria knows. The case closes. If Maria then tries to claim Brownie, the system says nobody is holding him. He is still registered to her.
  - After Phase 2: only the Head Officer or an Administrator can impound an owned pet, so Cruz cannot. Reyes must confirm the owner was contacted and write a note such as "Called, no answer. Visited the house, nobody home." It is saved in the audit log and on Brownie's timeline.

### Part 3: The long-term question (Phases 3 and 5)

Suppose Maria never answers. Today Brownie can't be adopted (he has an owner) and his only exit is impoundment. With the allotted time:

| Day | What happens |
|---|---|
| Nov 1 | Brownie enters holding. Maria gets an in-app notice: "Your registered pet Brownie is in holding. Contact the Barangay. You have until Nov 8 to claim him." Her pet page shows a banner. |
| Nov 6 | A reminder goes to Maria. |
| Nov 8 | The stay limit and Maria's time have both passed. The system does nothing by itself; Brownie's card shows "Owner has until Nov 8 (passed)". |
| Nov 9 | Reyes records the abandonment decision with the reason and the contact attempts (calls, a visit). Only now can the Barangay release the owner link and offer Brownie for adoption. |

- **Ending A, Maria shows up on Nov 6:** she claims Brownie and pays the RA 9482 fine. The clock stops and he goes home. Nothing was decided about him.
- **Ending B, Maria never answers:** after the allotted time and Reyes's decision, Brownie is released for adoption. His behavior history stays with him. Maria's own warnings, if any, stay with her.
- **Safeguard:** if Maria is in the hospital, Reyes can grant one extension with a written reason, and the audit log records it.

### The example on one page

| Step | When | Phase | Before the defense? |
|---|---|---|---|
| Block the "For Adoption" shortcut for owned pets | Day 2 | 1 | Yes |
| Impound an owned pet only by Head Officer or Administrator, with a recorded contact | Day 7 | 2 | Yes |
| The owner can still claim after an impound | Later | 3 | No, needs the Barangay's decision |
| Notice, allotted time, abandonment decision | Days 1 to 9 | 5 | No, a policy and privacy decision |

## Checklist

### Phase 0: Decisions

- [x] Adoption of an owned pet stays blocked (already the rule).
- [ ] Confirm: impounding an owned pet is limited to the Head Officer or an Administrator, with a recorded owner contact.
- [ ] Ask the Barangay: may an owner still claim an impounded pet? (needed for Phase 3)
- [ ] Ask the Barangay: how do they handle an owner who never responds? Choose among the options under "The owner who never responds" (needed for Phase 5; the recommended default is to keep the current rule).
- [ ] If they choose notice and release: agree the **allotted time** (suggested 7 days), when it starts (owner notified, or first recorded contact attempt), and whether one extension is allowed.

### Phase 1: Close the adoption loophole

- [ ] In the holding status update (`PATCH /holding/{id}`), refuse status 6 (For Adoption) and 7 (Adopted) for an owned pet, with the same message as the promote route.
- [ ] Reuse the existing owned-pet check (`_owned_holding_ids`) instead of copying the rule.
- [ ] Keep the existing "claimed and handed over" check.
- [ ] Tests: an owned pet is refused on promote and on direct 6 and 7; a stray is unaffected; an animal already listed before the change is not broken.
- [ ] Browser check: the Adopt button on an owned pet shows the refusal.
- [ ] Documentation: update `docs/01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md` and add a change record.

### Phase 2: Impounding an owned pet needs a Head Officer or Administrator and a recorded owner contact

- [ ] Send an `owner_contacted` confirmation and `owner_contact_note` with the impound request; refuse an owned-pet impound without them (400) and for regular staff (403).
- [ ] Save the note and who confirmed in the audit log (for example `IMPOUND_OWNED_PET`) and on the animal's timeline.
- [ ] Keep the stay limit and the early override unchanged and independent.
- [ ] A stray (no owner) is unchanged.
- [ ] The Holding Facility page: mark an owned animal; the impound dialog asks for the contact confirmation and note; regular staff see why the button is unavailable.
- [ ] Tests: owned pet by regular staff, by the Head Officer without a note, with a note; a stray; the audit entry; the timeline note.
- [ ] Documentation: update the holding rules doc and add a change record.
- [ ] Database change: none expected (fields in the request, audit log and timeline). Ask before any schema change.

### Phase 3: Owner claim after an impound (not before the defense)

- [ ] Decision recorded from the Barangay (Phase 0).
- [ ] If yes: let the owner of an impounded pet file a claim and pay the RA 9482 fine; define what the claim does to the closed case and the animal's record.
- [ ] Update the claim eligibility rules (`utils/claim_custody.py`) and their tests.
- [ ] Notify the owner when their registered pet is impounded.
- [ ] Review the claim fee and handover steps for an impounded animal.
- [ ] If no: record it as a documented limitation and keep the Phase 2 safeguards.

### Phase 4: Verify and record (after Phases 1 and 2; repeat after any later phase)

- [ ] Backend suites for holding, adoption, claims, custody and the stay limit pass.
- [ ] Browser tests for the Holding Facility page pass.
- [ ] Strict documentation audit passes.
- [ ] Update the defense plan's panel answers if the behavior changed.

### Phase 5: Abandoned owned pet (not before the defense; only if the Barangay chooses notice and release)

- [ ] Decision recorded in Phase 0 (notice and deadline, voluntary surrender, or keep the current rule).
- [ ] Store the **allotted time** as one Barangay-wide server setting (default 7 days, range to be decided), changed only by the Head Officer or an Administrator and audited, the same way as the stay limit (`holding_stay_limit_days`).
- [ ] Notify the owner when their registered pet enters holding, with who to contact and the deadline; remind them before it ends.
- [ ] Start the clock when the owner is notified; for an owner who can't be reached, when staff record the first contact attempt (date, method, result). Show "Owner has until <date> to claim" on the animal card and a banner for the owner.
- [ ] The earliest decision date is the later of the stay limit and the end of the allotted time; the server refuses the decision before then.
- [ ] One extension, with a written reason, by the Head Officer or an Administrator (audited).
- [ ] A claim before the decision stops the clock and keeps the animal held for the owner.
- [ ] A Head Officer abandonment decision: requires a reason, the contact attempts made (dates and methods) and the elapsed period; refused before the deadline.
- [ ] On the decision: end the owner link on the pet record without deleting the pet or its history, record who decided and why, and only then allow the adoption process.
- [ ] Keep the pet's verified behavior and incident history with the animal; the former owner's warnings and observations stay with them (see [OWNER_HISTORY_AND_PET_TRANSFER_PLAN](OWNER_HISTORY_AND_PET_TRANSFER_PLAN.md)).
- [ ] Optional: a voluntary "release this pet to the Barangay" action for the owner, recorded the same way.
- [ ] Audit entries for the notices, the decision and any reversal. Staff can't undo it silently.
- [ ] Tests: refused before the deadline and without a reason or contact record; the clock starts only after a notice or recorded attempt; the extension works once and needs a reason; allowed for the Head Officer after; the owner can still claim before the decision; other animals unaffected.
- [ ] Privacy review (it ends a person's registration of their pet), documentation and a change record.
- [ ] Database change: likely needed to store the decision and the notices. Ask before any schema change.
