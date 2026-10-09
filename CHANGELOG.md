# Changelog

## 1.1.0 – 2026-10-09

### Standard details
- New **Standard Details** (Tools → Standard Details…, the package button in the Markups List, the Takeoff Summary
  or a markup's Properties). A standard detail is a rule:
  **IF** *[column]* = *value* **→ ADD** material (Subject, Size, Length) **@ spacing OC**, **× quantity** or
  **full length**.
- The column and the value are picked from drop-downs; the value list holds the values that column has in the
  takeoff (with counts). Conditions can also be *≠* or *contains*, and several conditions can be combined (AND).
- Material is added to every matching markup as read-only rows under it in the Markups List (Type
  *Standard Detail*). They get the size as Member Size, so formula columns such as Weight compute, and they appear
  in the Takeoff Summary (marked *std. detail*), the CSV exports and the printed report.
- Spacing rules count pieces along the measured length (or an area's perimeter), with an optional end piece;
  quantity rules count per markup or per counted item; the markup's Qty multiplies both.
- Live preview of pieces, length and weight while editing; import/export details as JSON; example details;
  *Detail material* switch to show or hide the added material.
- Rebar sizes (#3–#18) now have weights in `PLF()`.

### Split view
- Any split pane can be **detached** into its own window (pane header ↗ button, or Window → Detach Active Pane):
  a separate window in the desktop app that can go to another monitor, or a movable, resizable window inside the
  app where pop-ups are not available. Detached panes use the main window's toolbar, menus and panels; the window
  or pane you click is the active one. Put a pane back with its header button or Window → Return Detached Panes.
- Tools stay active when you switch panes or windows; a measurement in progress stays with its pane.
- The **count** tool starts a new count when you switch to another pane, window or sheet.
- Three-pane layout (two over one) when one of four panes is closed or detached.

## 1.0.0 – 2026-10-09

- First Windows desktop release: NSIS installer with the Terms of Service, desktop and Start Menu shortcuts.
- BuildSuite branding, size tools and hidden tools in the Tool Chest, count editing (quantity, split, resume),
  split view, dockable and floating panels and toolbar.
