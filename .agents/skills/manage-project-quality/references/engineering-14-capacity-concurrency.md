# Capacity, Concurrency, and Resource Management

Use this review for load-sensitive services, shared resources, and systems with concurrent state changes.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-14-01 | Capacity model | Demand and limits should be explicit. | Are peak throughput, latency, storage, and headroom assumptions measured? |
| ENG-14-02 | Bounded concurrency | Unlimited work can exhaust every dependency. | Are worker, connection, and request counts bounded at each layer? |
| ENG-14-03 | Backpressure | Overload should be controlled rather than amplified. | Does the system reject, queue, or slow work using documented thresholds? |
| ENG-14-04 | Timeouts and cancellation | Abandoned work should release resources. | Are timeouts budgeted end-to-end and cancellation signals propagated? |
| ENG-14-05 | Contention testing | Shared locks and hot keys appear under load. | Do tests exercise realistic contention and skew rather than uniform traffic only? |
| ENG-14-06 | Autoscaling signals | Scaling on the wrong signal can worsen overload. | Do scaling signals lead demand and respect dependency capacity? |
| ENG-14-07 | Resource cleanup | Leaks turn normal operation into delayed failure. | Are connections, files, memory, and temporary objects bounded and observable? |
| ENG-14-08 | Degradation plan | Capacity exhaustion must preserve critical work. | Are admission control and priority rules defined for overload conditions? |
