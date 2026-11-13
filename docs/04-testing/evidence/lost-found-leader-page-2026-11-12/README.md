# The Leader's page for a missing pet and a found animal: before and after (2026-11-12)

Screenshots of the Subdivision Leader's page for a Lost Pet or a Found Animal report, before and after the page was redesigned after the developer's review ("competing actions before the Leader understands the animal", "Record owner confirmation is the bright primary action on a report that is only monitored"). They show the **real app** on a **throwaway database** filled with **synthetic** people and animals (`frontend/tests/_lostFoundScenario.mjs`); nothing is real and nothing came from the configured database. To look at the same screens yourself and click through them: `frontend/tests/demoLostFound.mjs` (see [the testing README](../../README.md)).

How they were made, and what they leave out: headless Chrome at 1280 px (desktop) and 390 px (phone), driven over the DevTools protocol. The isolated browser cannot reach the internet, so **map tiles are blank** (the outline and the pins still show) and the animals' pictures are **flat illustrations** swapped in for the photo host's addresses inside the page; a real photo takes the same place.

| File | What it shows |
|---|---|
| `01-before-calm-desktop.png` | **Before.** A missing cat that was just reported, so nothing is wrong. The first screen is a bright "Record owner confirmation", a menu, three more buttons, a status, four tabs and a record-style panel. The animal is a thumbnail; what happened is below the fold. |
| `02-before-busy-desktop-full.png` | **Before.** A busy case, whole page: eight stacked panels, three orange buttons, the same status said four times, the Barangay's unmade call shown twice. |
| `03-before-busy-phone.png` | **Before**, phone: the first screen is all buttons and tabs. |
| `04-before-found-desktop-full.png` | **Before**, a found animal: the same toolbar, four tabs and a map as large as the report. |
| `05-after-calm-desktop.png` | **After.** The same cat. The animal, what happened and who to call fill the first screen; one status; "Nothing needs you right now"; no strong button. |
| `06-after-busy-desktop-full.png` | **After.** The busy case, whole page (half the length): "Needs you" lists the two things that need the Leader, the first with the one strong button; what exists is below; "Resolve this report" is behind one line. |
| `07-after-busy-phone.png` | **After**, phone: the animal and the owner first, then what needs the Leader. |
| `08-after-match-waiting-desktop.png` | **After.** A possible match waiting: one item, one button. |
| `09-after-found-desktop.png` | **After.** A found animal: the same page ("This animal may be Coco"). |
| `10-after-resolved-desktop.png` | **After.** A resolved report: the pet is home (the owner's confirmation), with how and by whom, and "Reopen this report". |
| `11-after-help-panel-open.png` | **After.** An owner and a neighbour asked for help: the request opens in place, with both people's numbers. |
| `12-after-comparison-dialog.png` | **After.** The one dialog that decides a possible match. |
