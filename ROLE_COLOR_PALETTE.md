# StraySafe Role Color Palette (proposal)

**Goal:** give the Subdivision Leader and Barangay Staff portals their own color, so you can tell at a glance which portal you're in, while everything still looks like StraySafe orange. The Barangay teal is replaced.

All three palettes stay in the same warm orange family: **Subdivision leans gold, StraySafe is the bright orange in the middle, Barangay leans deep rust.**

---

## 1. StraySafe brand (unchanged: Residents, Admin, login pages)

| Token | Hex | Tailwind | Use |
|---|---|---|---|
| Primary | `#F97316` | orange-500 | buttons, active items, links |
| Hover | `#EA580C` | orange-600 | button hover |
| Strong | `#C2410C` | orange-700 | headings/text on tint |
| Soft | `#FFF7ED` | orange-50 | page/card tint |
| Muted | `#FFEDD5` | orange-100 | chips, hover rows |
| Border | `#FED7AA` | orange-200 | outlines |

## 2. Subdivision Leader: "Amber Gold" (kept, now also on sidebar + navbar)

A golden orange, one step toward yellow from the brand.

| Token | Hex | Tailwind | Use |
|---|---|---|---|
| Primary | `#D97706` | amber-600 | buttons, active nav item |
| Hover | `#B45309` | amber-700 | hover |
| Strong | `#92400E` | amber-800 | text on tint |
| Soft | `#FFFBEB` | amber-50 | sidebar background |
| Muted | `#FEF3C7` | amber-100 | sidebar hover |
| Border | `#FDE68A` | amber-200 | sidebar/navbar dividers |

## 3. Barangay Staff: "Rust" (new, replaces teal)

A deeper, burnt orange, one step toward red from the brand. It uses the brand's own *Strong* color (`#C2410C`) as its main color, so it's clearly StraySafe, just darker and more official.

| Token | Hex | Tailwind | Use |
|---|---|---|---|
| Primary | `#C2410C` | orange-700 | buttons, active nav item |
| Hover | `#9A3412` | orange-800 | hover |
| Strong | `#7C2D12` | orange-900 | text on tint |
| Soft | `#FFF1EA` | (custom) | sidebar background |
| Muted | `#FDDCCB` | (custom) | sidebar hover |
| Border | `#F8BFA3` | (custom) | sidebar/navbar dividers |

## Side by side

```
Subdivision   ███ #D97706   gold-orange
StraySafe     ███ #F97316   bright orange (brand)
Barangay      ███ #C2410C   rust / burnt orange
```

---

## 4. How the sidebar and navbar will use it

| Element | Subdivision | Barangay |
|---|---|---|
| Sidebar background | Soft amber tint `#FFFBEB` | Soft rust tint `#FFF1EA` |
| Active menu item | Amber pill `#D97706`, white text | Rust pill `#C2410C`, white text |
| Menu hover | `#FEF3C7` | `#FDDCCB` |
| Sidebar divider | `#FDE68A` | `#F8BFA3` |
| Navbar | white, with a 3px amber strip on top | white, with a 3px rust strip on top |
| Portal label in navbar | "Subdivision Leader" chip in amber | "Barangay Staff" chip in rust |
| Mobile bottom nav | active icon amber | active icon rust |

Dark mode uses lighter versions of the same colors (amber `#F59E0B`, rust `#FB7A4A`) on the existing dark background.

## 5. Readability check (WCAG contrast)

| | White text on Primary | Strong text on Soft |
|---|---|---|
| StraySafe | 2.8 : 1 (fine for bold, large buttons) | 4.9 : 1 ✓ |
| Subdivision | 3.2 : 1 (fine for bold, large buttons) | 6.8 : 1 ✓ |
| Barangay | 5.2 : 1 ✓ | 8.5 : 1 ✓ |

4.5 : 1 is the standard for normal-size text. The Barangay rust passes everywhere.

## 6. Keeping every page consistent

- Every Subdivision and Barangay page reads its color from the same role tokens (`--role-accent`, etc.), so changing a value here changes the whole portal.
- **About 130 hard-coded teal colors** across the Barangay pages, dashboards and shared modals get switched to the role tokens.
- **Status colors don't change:** green = success/completed, red = danger/urgent, amber = warning, blue = info. They mean the same thing in every portal.
- Resident, Admin and login pages keep the plain StraySafe orange.

---

## 7. Applied (2026-10-06)

- `frontend/src/index.css`: Barangay tokens changed from teal to Rust (light and dark mode).
- Sidebars (`BrgySidebar`, `SubdSidebar`): tinted background, solid active item, role-colored hover, section titles, dividers and footer.
- Navbars (`BrgyNavbar`, `SubdNavbar`): 3px role-colored strip on top, role-colored bottom border. Bottom navs: role-colored top border.
- About 2,200 hard-coded brand-orange classes (`#F97316`, `orange-50…900`, etc.) on all Subdivision/Barangay pages and the shared components they use were switched to the role tokens, plus the dark-teal `#1A4543` on the Barangay dashboard. Outside the two portals the tokens equal the brand orange, so Resident, Admin and public pages look the same as before.

**Kept on purpose:**
- **Adoption certificate** (document and popup): always StraySafe brand orange, since it's an official printed document.
- **The STRAYSAFE logo text** in the sidebars stays brand orange.
- **Status colors**: teal for "Released/Adopted", the Home Visit stage, green success panels, red/amber alerts.
- **Map markers and colors set in code** (not CSS classes) are unchanged.
- **Admin dashboard** still uses its dark teal `#1A4543`; it wasn't in scope.
