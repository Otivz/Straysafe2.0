# Message Queues

## Engineering Topic 9: Message Queue Concepts

**When to run this:** When designing or reviewing a system that uses a message queue/event stream (Kafka, RabbitMQ, SQS, etc.) for async communication between services.

**Goal of this pass:** Confirm the delivery, ordering, and failure-handling guarantees the system actually needs match what the queue setup actually provides.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 9: Message Queue Concepts

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-09-01 | Producer / consumer | The basic decoupling pattern — getting the boundary wrong (e.g. producer waiting on consumer) defeats the purpose of using a queue at all. | Are producers and consumers actually decoupled, with the producer not blocked waiting on consumer processing? |
| ENG-09-02 | Topic + partition | Partitioning enables parallel consumption, but choosing the wrong partition key can cause hot partitions or lost ordering guarantees. | Is the partition key chosen deliberately (e.g. by entity ID) rather than defaulted, and does it avoid hot-partitioning? |
| ENG-09-03 | Consumer group | Lets multiple consumer instances share the work of one topic without processing the same message redundantly (within the group). | If there are multiple consumer instances, are they correctly grouped so work is distributed, not duplicated? |
| ENG-09-04 | At-least-once delivery | The common default guarantee — means consumers WILL sometimes see the same message twice and must handle that. | Does every consumer assume at-least-once delivery and handle duplicate messages correctly? |
| ENG-09-05 | Dead letter queue | Without one, a message that repeatedly fails processing either blocks the queue or is silently dropped. | Do failed messages, after retry limits, go to a dead letter queue instead of blocking or vanishing? |
| ENG-09-06 | Backpressure | If consumers can't keep up, the system needs a defined behavior (slow producers, buffer, drop) rather than unbounded queue growth. | Is there a defined response when consumer lag grows unbounded, rather than assuming it will always catch up? |
| ENG-09-07 | Fan-out | Delivering one message to multiple independent consumers (e.g. via separate subscriptions) needs the right topology — a single queue with one consumer group won't do it. | If multiple independent services need the same message, is the topology (e.g. separate subscriptions/topics) actually set up for fan-out? |
| ENG-09-08 | Message ordering | Most queues only guarantee order within a partition/shard, not globally — code that assumes global order will break. | Does any consumer logic assume strict global ordering, and if so, does the actual queue setup guarantee that? |
| ENG-09-09 | Idempotent consumer | Given at-least-once delivery, consumers must be able to safely process the same message twice without double-effecting (e.g. double-charging). | Is consumer processing logic idempotent (e.g. keyed on a unique message/operation ID) so redelivery is safe? |
| ENG-09-10 | Offset commit | Committing the offset too early risks losing a message if processing then fails; committing too late risks reprocessing more than necessary. | Is the offset committed only after successful processing (not before), matching the delivery guarantee the system actually needs? |
