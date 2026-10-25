# Code Review Practices

## Engineering Topic 5: Code Review Practices

**When to run this:** Ongoing — use this to periodically check whether the team's actual review habits match its stated process, not just once.

**Goal of this pass:** Keep review effective and fast rather than either a rubber stamp or a bottleneck.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 5: Code Review Practices

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-05-01 | Small PRs | Large PRs get worse review (reviewers skim or rubber-stamp) and take longer to land. | Is there a rough size norm for PRs, and are oversized PRs flagged for splitting? |
| ENG-05-02 | Clear description | A reviewer without context re-derives the 'why' from the diff alone, which is slower and more error-prone than being told. | Does every PR description explain what changed and why, not just restate the diff? |
| ENG-05-03 | Constructive feedback | Feedback that reads as personal or vague either gets ignored or damages the reviewer/author relationship over time. | Is feedback phrased around the code/tradeoff rather than the author, with a suggested direction, not just a criticism? |
| ENG-05-04 | Nitpick vs blocker | Without this distinction, minor style opinions can block a merge as if they were correctness issues. | Are non-blocking comments explicitly labeled (e.g. 'nit:') so the author knows what's optional vs required? |
| ENG-05-05 | Fast turnaround | A PR that sits for days loses context for both author and reviewer and blocks downstream work. | Is there a target turnaround time for first review, and is it generally being met? |
| ENG-05-06 | Automated checks first | Humans shouldn't spend review time on things a linter/CI can catch automatically. | Do lint, format, and test checks run and pass before a human reviews the PR? |
| ENG-05-07 | Context before code | Reviewing code without understanding the surrounding system leads to reviews that miss integration-level problems. | Does the reviewer understand the relevant part of the system before diving into line-by-line comments? |
| ENG-05-08 | Approve vs request changes | Conflating 'I have a question' with 'this is blocked' slows things down or sends mixed signals. | Is the approve/comment/request-changes distinction used deliberately, not defaulted to whichever is habit? |
| ENG-05-09 | Self-review first | Authors catch a meaningful fraction of their own issues by re-reading the diff before asking someone else to. | Does the author review their own diff (and leave self-notes where useful) before requesting review? |
| ENG-05-10 | Learning from reviews | Review comments that aren't retained just repeat themselves across future PRs instead of becoming shared knowledge. | Do recurring review comments get turned into a lint rule, style-guide entry, or documented convention? |
