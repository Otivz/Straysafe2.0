# Query Performance & Slow Query Diagnosis

## Engineering Topic 1: Query Performance & Slow Query Diagnosis

**When to run this:** When a query, endpoint, or report is running slower than expected, or before shipping a new query against a table that will grow.

**Goal of this pass:** Work through the standard diagnostic order for a slow query instead of guessing at fixes — read the plan first, fix the cheapest thing, and don't reach for denormalization until indexing is exhausted.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 1: Query Performance & Slow Query Diagnosis

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-01-01 | Start with the explain plan | Reveals whether the DB is scanning, sorting, or joining in a way that doesn't match intent — guessing at fixes without this wastes time. | Have you run EXPLAIN (or EXPLAIN ANALYZE) on the slow query and read where the time actually goes? |
| ENG-01-02 | Add the missing index | Full table scans get linearly worse as data grows; the right index turns O(n) into O(log n). | Does the WHERE/JOIN/ORDER BY column set have a supporting index? |
| ENG-01-03 | Stop selecting * | Pulling unused columns wastes I/O and network, and can defeat a covering index. | Does the query request only the columns actually used downstream? |
| ENG-01-04 | Fix N+1 queries | One query per row in a loop turns a single request into hundreds; batching/joining collapses it back to one or few. | Does any code path issue a query inside a loop over another query's results? |
| ENG-01-05 | Use a covering index | An index that includes all selected columns lets the DB answer from the index alone, skipping the table lookup. | For hot read queries, does the index include every column the query selects? |
| ENG-01-06 | Cache repeated queries | Identical, expensive, low-volatility queries don't need to hit the DB every time. | Are the same expensive read queries re-run frequently with unchanged results, and if so, are they cached? |
| ENG-01-07 | Prune partitions | Partition pruning lets the DB skip irrelevant partitions entirely instead of scanning the whole table. | For large time-series/partitioned tables, does the query filter on the partition key so pruning can kick in? |
| ENG-01-08 | Denormalize for reads | Trading write complexity/redundancy for fewer joins can be the right call once indexing alone isn't enough. | Has indexing been exhausted before reaching for denormalization, and is the redundancy kept in sync deliberately? |
| ENG-01-09 | Batch your writes | Many small write round-trips cost more in overhead than one larger batched write. | Are writes that happen together (e.g. in a loop or transaction) batched instead of issued one at a time? |
| ENG-01-10 | Update table statistics | A stale planner (out-of-date row-count/distribution stats) can pick a bad plan even with the right indexes present. | Are table statistics refreshed on a schedule (ANALYZE / equivalent), especially after large data changes? |
