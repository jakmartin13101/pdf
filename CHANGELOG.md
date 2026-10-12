# Changelog

## 1.4.1 – 2026-10-12

### Automatic takeoff: members on continuous lines
- A member line that does not stop at its columns (a girder drawn straight through, one label per span) is now taken
  off span by span: the line is split at the column symbols drawn on it – squares, filled squares, round and I-shaped
  columns – using the nearest column on each side of each label.
- Where no column is drawn between two labels on the same line, the line is split halfway between the labels. These
  ends are marked *est. end* in the list and with an orange square on the drawing; the panel says how many to check.
- Collinear pieces of a line that touch (broken where other beams frame in) are joined before splitting, so each
  label measures its whole span instead of the piece beside it. Several labels can now share one line; before, the
  first label took the whole line.

## 1.4.0 – 2026-10-12

### Settings menu
- New **Settings** menu in the menu bar: *Settings & Preferences…* (`Ctrl+,`, also under Edit) opens one dialog with
  **General** (author, theme, mouse wheel, labels, reuse, hidden tools), **Units & Totals** (the project's units and
  decimals), **Drawing & Editing** (snapping, ortho, arrow-key step, end adjustment step), **Auto Takeoff** (line styles,
  finding defaults) and **Workspace** (lock, toolbar position, reset). Quick switches for snapping, ortho, reuse,
  labels, theme and the layout are in the menu itself.
- Arrow keys can move a selection by a drawing length (e.g. 1" at each markup's own scale) instead of screen pixels.

### Auto takeoff line styles by subject
- Rules set the line of automatic takeoff measurements by subject: *starts with*, *contains* or *is* a text → colour,
  width, solid/dashed/dotted and opacity, e.g. **W** → green solid line. The first matching rule wins; rules can be
  reordered, switched off, tried on a subject, and reset to the defaults (W green, HSS blue dashed, Pipe teal dashed,
  MC/C purple, L orange dotted). Without a matching rule the Tool Chest tool for the size, or a colour per size, is
  used.
- The preview on the drawing uses the same lines. *Apply to Existing Auto Measurements* restyles measurements already
  made (one undo step); measurements made by the automatic takeoff are marked as such.

### Fine adjustment
- Auto Takeoff preview: drag the square at either end of a member – it slides along the member and snaps to the
  drawing (Alt: free, Ctrl: no snapping). Pick a member in the list for − / + buttons per end and both ends with a step
  from 1/16" to 1'-0" (or mm). Adjusted members are marked and can be put back as found.
- **Properties → Adjust Ends** for straight length measurements, one or many at once: − / + per end by the step, or
  type an exact length.

## 1.3.0 – 2026-10-12

### Automatic takeoff (beams and tubing)
- New **Auto Takeoff** panel (toolbar *Auto*, or *Tools → Automatic Takeoff (Beams & Tubing)…*): **Find Members**
  reads the member-size labels on a plan – W, S, M, HP beams; HSS, TS and Pipe tubing; C/MC channels; optionally
  angles – and finds the line each label names (parallel, beside it, under its middle; solid and heavy lines preferred
  over dashed grid lines and hairline dimensions). Column labels are skipped.
- Lengths use the sheet's scale (and viewport scales). Sheets without a scale use the scale printed on the drawing
  (e.g. `SCALE: 1/8" = 1'-0"`), which is set on the sheet when the measurements are created.
- Members are previewed on the drawing in a colour per size; the panel lists them by size with counts and total
  lengths. Leave out sizes or single members (in the list or by clicking them on the drawing), skip members already
  taken off, add a length to each end, search one sheet or all sheets.
- **Create** adds one labelled length measurement per member (one undo step) with the size as Subject and Member Size,
  using the Tool Chest tool for that size when there is one.
- The sample roof framing plan has a tube-steel entrance canopy; the example takeoff's roof beams and tubes were made
  with the automatic takeoff.

### Standard details by hand
- Select several markups and right-click → **Standard Details** to add a detail to all of them (or take it off), or
  **New Detail for These N…**. The Properties panel shows a checkbox per detail for the selection.
- A detail can be by-hand only (*Apply automatically* off). Details with a rule can still be added to other markups or
  taken off single markups by hand; *Back to Rules Only* undoes that. The editor has *Add to / Take off Selected* and
  shows how many markups each detail covers by rule and by hand.

### Other
- Submenus stay inside the window near the screen edges.
- The Terms of Service, About box and documentation no longer name other companies' products.

## 1.2.0 – 2026-10-12

### Overlay / compare sheets
- **Document → Compare / Overlay Sheets…** (or the **Compare** toolbar button and panel) draws one sheet over
  another: each sheet's line work in its own colour, multiplied, so unchanged work shows dark and
  anything that differs shows in sheet A's or sheet B's colour. The revision of the same sheet number in another PDF
  is suggested automatically.
- **Colour and intensity per sheet** (colour picker, intensity slider, presets, swap), show/hide either sheet, and
  switch the overlay on and off. Changes are instant – the drawings are not re-rendered.
- **Auto Align** matches the text the two sheets share (sheet title, notes, grid bubbles, member labels) and fits the
  shift, scale and rotation, so a revision plotted at a different size or offset lines up. Drawings without text
  (scans) are aligned by image correlation. The panel reports how much of the line work matches.
- **Manual alignment**: Align by Points (click 2 or 3 features on sheet A, then the same features on sheet B, with
  snapping to each sheet's line work), Move by Hand (drag sheet B), arrow nudges and exact X/Y offset, rotation and
  scale fields, and Reset.
- **Find Changes** boxes every difference – line work compared as images, text compared as text so a single changed
  digit is caught – lists them (only on A / only on B / changed) and zooms to each. **Add Clouds** turns them into
  Revision Change cloud markups in one undo step.
- Overlays are saved with the project; sheets with an overlay show a badge in the Sheets panel. Works in split and
  detached panes. The example takeoff includes Addendum 2 of S1.02 with an overlay ready to switch on.

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
