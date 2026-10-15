# Pet Records: One Record per Pet When an Owner Without an Account Signs Up

> **Status:** implemented (2026-10-15), sections A, B and C.
> - Decisions: claims reuse `pet_owner_confirmations` (`source = "resident_claim"`, no schema change); the
>   registration check matches on phone + pet type only; the pet's Subdivision Leader or an Admin approves claims.
> - Added after the plan: when the record to keep belongs to a resident's account, a leader can't merge into it
>   (existing rule), so the leader asks the owner, who combines the records or says they are different pets
>   ("merge requests", kept in the audit log).
> - Tests: `backend/tests/test_pet_record_duplicates.py`.
> **Date:** 2026-10-15
> **Main files:** `routes/pets.py`, `routes/pet_ownership.py`, `utils/pet_ownership.py`, `ResidentPet.tsx`,
> `AddPetModal.tsx`, the Pet Records pages

---

## 1. The problem

A leader registers a pet for an owner who has no StraySafe account (for example Ramirez Ramos and his dog Bantay).
Since 2026-10-15 no account is created: the owner's name, number and address are saved on the pet record.

Later Ramirez creates his own account and registers Bantay again from **My Pets**. Today this makes a **second
record for the same dog**:

| | Leader's record (owner without account) | Ramirez's new record |
|---|---|---|
| Past cases, sightings, QR code | here | none |
| What he adds from now on (vaccines, photos) | none | here |
| Look-alike matching | compares against both | compares against both |

The dog's history is split between two records, and nobody is told.

---

## 2. What exists today (checked in the code)

- **Registration duplicate check** (`POST /pets/`): only finds a pet under the **same account** with the same
  name, type and breed. The leader's record has no account, so it is never found.
- **Ownership requests** (`pet_ownership`): staff propose an owner, and the resident accepts or rejects. They only
  go from staff to the resident.
- **Merge tool** (`POST /pets/{id}/merge-into`, staff): moves reports, claims, suggestions, history, vaccinations and
  warnings onto the kept record and archives the duplicate (nothing is deleted, a reason is required, it is logged).
  It works, but someone has to notice the duplicate first.
- **Saved owner details:** `pets.emergency_contact_name`, `emergency_contact_phone` and `registered_address`.

---

## 3. Recommendation

Prevent the duplicate when the owner registers, and keep a safety net for staff in case one gets through. Every
change of ownership is approved by a person; the system never moves a pet to an account on its own.

### A. When a resident registers a pet: "Is this your pet?"

Before a new record is created, the server looks for **pet records with no account** where:

1. the saved owner **phone number equals the resident's account phone** (both in the stored phone format), and
2. the **pet type** (dog / cat) is the same.

The name is not required to match (the leader may have written "Bantay", the owner "Ban-ban").

If one or more are found, the resident sees, instead of the form's normal success:

> **Your subdivision may already have registered this pet for you**
> [photo] **Bantay**, Aspin, brown, registered on Oct 15 by Selera Homes
> **This is my pet** · **No, register a new pet**

- **"This is my pet":** no new record. A **claim request** goes to the subdivision leader (section B). The resident
  sees "Waiting for your subdivision to confirm" on My Pets.
- **"No, register a new pet":** the new record is created as today, and the pair is remembered as "owner said
  different pets", so section C does not flag it.

What the resident sees is only the pet itself (photo, name, breed, colour). The match exists only because the number
on the record is their own, so no one else's details are shown.

### B. The leader approves the claim

The leader gets a notification and a **"Pet ownership requests"** item on Pet Records:

> **Ramirez Ramos** (resident account) says **Bantay** is his.
> On the record: owner without account **Ramirez Ramos**, 0977 032 8167 · matches his account number.
> **Approve** · **Decline (with reason)**

- **Approve:** Bantay's `owner_id` becomes Ramirez's account. The saved owner details stay as the emergency contact.
  This is recorded in the pet history and the audit log, and Ramirez is notified.
  - The resident already said it is his pet, so no second "do you accept?" step is needed.
- **Decline:** nothing changes on the pet. Ramirez is notified with the reason and can register a new pet.

The leader approves because an account phone number is typed in by the person and isn't verified: anyone could put
Ramirez's number in their profile.

### C. Safety net: a possible-duplicate flag on Pet Records

If a duplicate still gets created (a different number, or the owner pressed "No"), Pet Records shows it to staff:

> **Possible duplicate:** Bantay (Ramirez Ramos's account) and Bantay (Ramirez Ramos, no account)
> **Merge into one** · **Not the same pet**

Flagged when two active records of the same type have:

- the same owner phone (one from an account, one saved without an account), or
- the same owner name (ignoring case and spacing) and the same pet name.

**Merge into one** opens the existing merge tool, keeping the record that has the account and moving the history onto
it. **Not the same pet** hides the flag for that pair.

---

## 4. What does not change

- This plan uses no AI: every match is an exact comparison (phone number, pet type, names) and a person confirms it.
  Existing features elsewhere (look-alike suggestions, duplicate-report detection) are not touched.
- The existing staff "Assign Owner" flow and owner confirmations.
- The merge tool itself (only a new way to reach it).
- Privacy: residents never see another owner's details; staff see what they see today.
- No database changes for A and C. B needs somewhere to keep the claim requests; see the decision in section 6.

---

## 5. Edge cases

| Case | What happens |
|---|---|
| Two records match the phone | All are shown; the resident picks one or "none of these". |
| The pet already has an account owner | Never offered (only records with no account). |
| The resident's account has no phone | Only section C can catch it (same owner name + pet name). |
| The resident claims, the leader declines | Pet unchanged; the resident may register a new pet. |
| A claim is pending and the pet gets a new case | The case uses the record as it is (owner without account) until the claim is approved. |
| The pet is in a holding facility or up for adoption | No claim from registration; the existing claim / adoption flows apply. |

---

## 6. Decisions for you

1. **Where claim requests are kept (B).** Either a new table `pet_ownership_claims` (clean, its own history; needs
   your OK for a schema change), or reuse `pet_owner_confirmations` with a "resident asked" direction (no schema
   change, a little less clear). **Recommended:** reuse the existing table if its columns fit; otherwise a new table.
2. **Match on name too?** Matching only on phone + type is safest. Adding owner name + pet name finds more but risks
   offering a neighbour's pet. **Recommended:** phone only for A; name + pet name only for C (staff decide there).
3. **Barangay staff:** may they approve claims too, or only the Subdivision Leader? **Recommended:** the leader of
   the pet's subdivision, and Admin.

---

## 7. Build order

1. **C, the duplicate flag + merge:** small, staff only, and it also finds duplicates that already exist.
2. **A, the "Is this your pet?" check at registration.**
3. **B, the claim request and the leader's approval.**

## 8. Tests

- A registration matching a saved owner phone offers the record and creates no new pet until the resident chooses.
- "No, register a new pet" creates it and suppresses the flag for that pair.
- An approved claim moves ownership, keeps the history, and is logged and notified; a declined one changes nothing.
- A resident never sees another owner's name or number.
- The duplicate flag finds phone and name matches, merge keeps the account record, and "Not the same pet" hides it.
- Pets with an account owner are never offered.
