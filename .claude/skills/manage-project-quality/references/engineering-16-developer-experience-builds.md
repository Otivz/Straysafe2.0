# Developer Experience & Reproducible Builds

## Engineering Topic 16: Developer Experience & Reproducible Builds

**When to run this:** When onboarding, local setup, generated artifacts, build reliability, or local/CI differences slow delivery.

**Goal of this pass:** Make a clean checkout understandable, repeatable, and consistent with CI and release behavior.

## Concepts — Topic 16: Developer Experience & Reproducible Builds

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-16-01 | Explicit prerequisites | Hidden tool assumptions create onboarding failures. | Are supported runtime, package manager, platform, and external-service prerequisites versioned and documented? |
| ENG-16-02 | Clean-checkout path | Existing machine state can hide missing setup. | Can a contributor build and test from a clean checkout using documented commands? |
| ENG-16-03 | Deterministic dependency install | Floating dependency resolution makes failures hard to reproduce. | Does CI use the committed lockfile and reject unexpected dependency drift? |
| ENG-16-04 | Local and CI parity | Different commands allow defects to appear only after push. | Do local guidance and CI invoke the same core build, test, and validation entry points? |
| ENG-16-05 | Generated artifact ownership | Hand edits to generated files are silently overwritten. | Are canonical inputs, generated outputs, and regeneration commands explicit and checked for drift? |
| ENG-16-06 | Actionable failures | Cryptic output turns routine setup into specialist work. | Do common setup and validation failures name the cause and the next safe action? |
| ENG-16-07 | Bounded setup side effects | Install hooks and implicit mutations reduce trust. | Are downloads, writes, services, and environment changes explicit and previewable where practical? |
| ENG-16-08 | Supported environment matrix | Untested combinations create accidental promises. | Are supported operating systems and runtime versions tested or clearly marked unverified? |
