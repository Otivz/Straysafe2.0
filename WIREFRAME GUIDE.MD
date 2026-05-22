# STRAY-SAFE Wireframe Guide: Function Descriptions

This guide outlines the wireframe layouts and functional descriptions for the modules within the STRAY-SAFE platform. It serves as a blueprint for the UI/UX design and frontend development.

---

### Screen 1 — Admin Global Layout ( `/admin/*` )

| Label | Name | Description |
| :--- | :--- | :--- |
| S1.1 | Logo Area | Image/Link in the top left. Clicking it navigates the user back to the Global Dashboard (`/admin/dashboard`). |
| S1.2 | Dashboard Sidebar Link | Sidebar navigation button. Navigates to the Global Dashboard (`/admin/dashboard`). |
| S1.3 | Users Sidebar Link | Sidebar navigation button. Navigates to the User & Access Management page (`/admin/users`). |
| S1.4 | Settings Sidebar Link | Sidebar navigation button. Navigates to the System Configuration page (`/admin/settings`). |
| S1.5 | Audit Logs Sidebar Link | Sidebar navigation button. Navigates to the Audit Logs ledger (`/admin/audit-logs`). |
| S1.6 | Announcements Sidebar Link | Sidebar navigation button. Navigates to the Global Announcements page (`/admin/announcements`). |
| S1.7 | Collapse Sidebar Button | Toggle button at the bottom of the sidebar. Shrinks the sidebar to icons only without navigating away. |
| S1.8 | Global Search Input | Text input field in the top header. Performs an active system-wide search without navigating. |
| S1.9 | Notification Bell Dropdown | Icon button in the top right. Opens a dropdown list of recent alerts without navigating. |
| S1.10 | Profile Dropdown | Avatar button in the top right. Opens a dropdown menu revealing "Account Settings" and "Logout" links. |
| S1.11 | Logout Dropdown Option | Link inside the Profile Dropdown. Ends the session and navigates to the Login screen (`/login`). |

---

### Screen 2 — Global Dashboard & Heatmap ( `/admin/dashboard` )

| Label | Name | Description |
| :--- | :--- | :--- |
| S2.1 | Total Active Cases Card | Display widget showing a static aggregate number of ongoing rescues. Does not navigate. |
| S2.2 | Pending Approvals Card | Clickable widget showing a counter of pending accounts. Clicking navigates to User Management (`/admin/users`). |
| S2.3 | System Health Card | Display widget showing AI operational status. Does not navigate. |
| S2.4 | Interactive Map View | Geographic map component rendering heat overlays. Allows zooming and panning without navigating. |
| S2.5 | Timeframe Filter Dropdown | Dropdown menu over the map. Changes heatmap data between 24h, 7d, 30d without navigating. |
| S2.6 | Boundary Toggle Switches | Checkbox/Switch list over the map. Displays or hides subdivision polygons on the map without navigating. |
| S2.7 | Analytics Trend Chart | Line chart visualizing report volume over time. Does not navigate. |

---

### Screen 3 — User & Access Management ( `/admin/users` )

| Label | Name | Description |
| :--- | :--- | :--- |
| S3.1 | Role Filter Tabs | Tabbed navigation buttons. Filters the data table below to show specific roles without navigating away. |
| S3.2 | "Add Official" Primary Button | Primary button at the top right. Opens an "Invite User" modal overlay without navigating. |
| S3.3 | Users Data Table | Data grid listing registered users (User ID, Name, Role, Jurisdiction, Status). Does not navigate. |
| S3.4 | Approve/Reject Action Buttons | Check and X icon buttons in the table row. Approves or rejects a pending account and refreshes the table. |
| S3.5 | Edit Action Button | Pencil icon button in the table row. Opens an "Edit User" modal overlay to change roles. |
| S3.6 | Deactivate Action Button | Lock icon button in the table row. Suspends a user account and updates their status badge. |

---

### Screen 4 — System Configuration & Settings ( `/admin/settings` )

| Label | Name | Description |
| :--- | :--- | :--- |
| S4.1 | Map Drawing Tool | Interactive map with cursor tools (Draw/Erase buttons). Allows admin to draw polygon boundaries without navigating. |
| S4.2 | Boundary Data List | Text list displaying saved geographical boundaries. Does not navigate. |
| S4.3 | Edit Boundary Button | Action button next to a boundary name. Activates the Map Drawing Tool to edit the selected polygon. |
| S4.4 | Delete Boundary Button | Action button next to a boundary name. Removes the polygon from the database. |
| S4.5 | Animal Categories Table | Editable data table for adding or removing recognized animal types. Does not navigate. |
| S4.6 | Priority Definition Slider | UI Slider input. Adjusts the AI confidence threshold required to flag reports as "Critical". |

---

### Screen 5 — Global Announcements ( `/admin/announcements` )

| Label | Name | Description |
| :--- | :--- | :--- |
| S5.1 | Title Text Input | Text field for composing the alert message title. Does not navigate. |
| S5.2 | Body Textarea | Multi-line text field for composing the alert message content. Does not navigate. |
| S5.3 | Audience Selector Dropdown | Multiple-choice dropdown menu. Targets specific roles (e.g., all Residents, Subdivision Leaders only). |
| S5.4 | "Publish Notification" Button | Primary submit button. Submits data to the database, triggers push notifications, and clears the form. |
| S5.5 | Broadcast History Table | Data grid listing past announcements (Date Published, Title, Targeted Audience, Read Rates). Does not navigate. |

---

### Screen 6 — Audit Logs ( `/admin/audit-logs` )

| Label | Name | Description |
| :--- | :--- | :--- |
| S6.1 | Date Range Picker Input | Calendar input component. Filters the ledger logs within specific start and end dates without navigating. |
| S6.2 | Action Type Dropdown | Select menu dropdown. Filters the ledger by specific event types like "Account Created". |
| S6.3 | Ledger Data Table | Data grid displaying historical actions (Timestamp, Actor, Action Performed, Target, IP Address). Does not navigate. |
| S6.4 | "Export Logs" Button | Secondary action button. Generates and triggers a file download (CSV/PDF) of the filtered audit trail. |
