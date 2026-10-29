# "Pet Recovered" only on lost-pet reports

- **Date:** 2026-10-29 08:34 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/pages/citizen/ResiViewReport.tsx`, this record
- **Authorization:** the developer, on `/resident/reports/2`: "i think there is a redundancy in the" owner follow-up panel and the header ("Dispute", "Pet Recovered").
- **Type:** Fix

## Intent

On a roaming complaint under an owner follow-up, the owner saw both the follow-up panel ("I received this and I'm acting on it", "Send an update") and a "Pet Recovered" button. Pet Recovered closes the report as recovered, which would end the leader's observation.

## Key changes

- The "Pet Recovered" button shows only on a lost-pet report (`isLostPetReport`: category 6 or the `[LOST PET REPORT]` marker), for the pet's owner or the reporter. The earlier conditions are kept: the report is not closed and the animal is not in a facility.
- A registered pet reported roaming is handled by the owner follow-up panel and the subdivision. Once Phase 6B is built, an animal nobody holds also gets the "Is it home with you?" question.
- "Dispute" is kept: it is how the owner contests the complaint or the identity.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- Not checked in a browser; to be checked by the developer on `/resident/reports/2`.
