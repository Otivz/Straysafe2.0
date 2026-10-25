# Frontend Quality & Accessibility

## Engineering Topic 17: Frontend Quality & Accessibility

**When to run this:** When building or changing a website, browser UI, documentation portal, or interactive developer experience.

**Goal of this pass:** Make important workflows usable across keyboards, assistive technology, screen sizes, and supported browsers.

## Concepts — Topic 17: Frontend Quality & Accessibility

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-17-01 | Semantic structure | Native semantics improve navigation and reduce custom behavior. | Do headings, landmarks, lists, tables, buttons, and links match their actual purpose? |
| ENG-17-02 | Keyboard operation | Pointer-only interactions exclude many users. | Can every action be reached, operated, and exited using a keyboard with visible focus? |
| ENG-17-03 | Status announcements | Visual-only feedback is missed by assistive technology. | Are copy, validation, loading, and error results exposed through an appropriate live status? |
| ENG-17-04 | Contrast and non-color cues | Meaning can disappear with low vision or color differences. | Do text, focus, errors, and state indicators meet the selected WCAG target without relying on color alone? |
| ENG-17-05 | Responsive and zoom behavior | Fixed layouts break on small screens and magnification. | Do critical flows remain usable at supported viewport sizes and text zoom levels? |
| ENG-17-06 | Reduced motion and input preferences | Unnecessary motion can cause discomfort or obscure state. | Does the interface respect reduced-motion settings and avoid motion as the only explanation? |
| ENG-17-07 | Browser behavior tests | Static markup checks miss real interaction failures. | Do automated browser tests cover the highest-value interactions, errors, and navigation paths? |
| ENG-17-08 | Manual accessibility review | Automation cannot establish all usability outcomes. | Is a dated keyboard and assistive-technology review retained for important releases? |
