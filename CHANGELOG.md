# Changelog

## 1.8.0 – 2026-10-14

### Combine report
- *Tools → Combine Report…* (also *File → Export → Combine Report*, and *Combine* in the Takeoff Summary): the stock
  lengths to order for every size. It reads the size (Member Size, else the label) and the length of each length
  measurement and nests the pieces of each size on the lengths you can order for its shape, using as little material
  as it can (the best plan exactly for up to 12 pieces of a size, a close one above that); of plans that use the same
  length, the one with fewer bars. 3 × W8x10 at 5' fit on one 20'; 15' + 2 × 18' need one 40' and one 20' when W comes
  in 20' and 40'.
- **Machine allowance** per bar (1'-0" to start with) and **kerf** per cut (1/8"), set in the report or in
  *Settings → Combine*.
- *Settings → Combine*: the stock lengths for each shape (W, HSS, L, C, MC, WT, S, HP, PIPE to start with) – add or
  remove lengths, add or remove shapes, reset to the defaults; *Other* for sizes whose shape is not listed (none to
  start with: those sizes are listed, not planned).
- Each size shows its pieces, cut length, what to order (`1 × 40'-0" + 1 × 20'-0"`), length ordered, drop and weight;
  click it for the cutting plan, every bar drawn to scale with its pieces, the allowance and the drop. Qty counts as
  pieces; standard detail material is included (or not); all sheets or the current one. Pieces longer than the longest
  stock are spliced over several bars and flagged.
- Export as CSV (order list and cutting plan) or a printable page (Print / Save as PDF).

## 1.7.0 – 2026-10-14

### Subjects are shapes
- A markup's subject is the shape it takes off – W, HSS, L, C, MC, WT, S, HP, PL, BP, BO, PIPE to start with – picked
  from a list rather than typed (Subject cell of the Markups List, Properties, Tool Chest tool editor). The size is
  the Member Size and the label.
- *Settings → Subjects*: add and remove shapes, reorder, reset to the defaults; the list is per user and applies to
  every file. Each shows how many markups in the open file use it.
- New markups, size tools and the automatic takeoff take the shape of their size from the list (W24x55 → W,
  HSS6x6x3/8 → HSS, MC12x10.6 → MC). Markups whose size has no shape in the list have no subject. The built-in Tool
  Chest tools have shape subjects (Base Plate: BP).
- The Takeoff Summary lists each size on its own line (W24x55, W18x35…).
- Subjects from earlier files (W24x55, HSS Column…) show in italics; *Change Sizes to Shapes* turns them into shapes
  (the size goes into Member Size), *… and Clear the Rest* clears subjects that name no shape. Revision clouds from
  overlay compare have no subject (their label says what they are).
- The built-in standard detail examples match on Subject, Category and Type; searching the Markups List keeps the
  material standard details add with the markups it finds. The example takeoff was made again with shape subjects.

### Text colour
- Labels and text have their own colour, separate from the line: *Properties → Text colour* (or *Same as line*), the
  Tool Chest tool editor, size tools (*Label colour*) and each automatic takeoff line style rule (*Text*). Used on the
  drawing and in flattened PDFs.

## 1.6.0 – 2026-10-14

### Every PDF is its own document
- Opening a PDF opens it as its own document (in a new tab), no longer as part of a combined project. Its markups,
  sheet labels, scales and viewports, custom columns, layers, standard details and overlays belong to that file only,
  and each document has its own undo history and selection. The Sheets panel, Markups List, Summary and the other
  panels show the active document.
- **The takeoff is saved inside the PDF** (as an embedded file the PDF carries along; the drawing looks unchanged in
  other PDF viewers). Opening that PDF again brings the takeoff back. *File → Save* (`Ctrl+S`) writes back to the
  file it was opened from in the desktop app; *Save As…* (`Ctrl+Shift+S`) asks where; *Save All*. In a browser the
  PDF is downloaded. PDFs protected against changes are saved as a `.takeoff.json` file instead.
- Tabs show a dot for unsaved changes; closing a changed document asks to save it first (*Save*, *Don't Save*,
  *Cancel*); *File → Close* and *Close All*. Open documents, with unsaved changes, come back when the program starts.
- Standard details belong to the file they are made in and work only there (export/import them to reuse elsewhere).
- Overlay compare can overlay a sheet from another open document (a revision opened as its own PDF); the Compare
  panel says when that document needs opening.
- Opening a file that is already open shows its tab. Takeoff project files from earlier versions open as one
  document per PDF. *File → Add PDF to Set* and *New Project from PDF* are gone.

### Markups List layout per file, with a default
- Rename column headers (double-click, or right-click → *Rename Column…*), move columns by dragging their headers
  (or *Move Left / Right*), hide them from the header menu; *Columns…* renames too. Each file keeps its own layout.
- *Save as Default Style*: files opened from now on start with this layout (columns shown, order, widths, header
  names and the custom columns). *Apply Default Style*, *Reset to Built-in Style*.
- *Export This Style… / Export Default Style…* save the layout to a file as a backup; *Import Style…* and *Import as
  Default Style…* bring it back. Also in the new *Settings → Markups List*.

### Fixes
- The sheet title bar no longer picks up the document tab style.

## 1.5.0 – 2026-10-14

### Document tabs
- Every PDF in the project has a tab across the top of its pane. *File → Open PDF…* (`Ctrl+O`), the Open button and
  dropping PDFs on a pane open each file in a new tab of the active pane (and add it to the sheet set); *File → New
  Project from PDF…* starts a new project instead (what *Open PDF* did before).
- Tabs remember their sheet. `Ctrl+Tab` / `Ctrl+Shift+Tab` (and `Ctrl+Shift+]` / `[`) switch tabs, `Ctrl+F4`, × or a
  middle click closes one – the document stays in the project and opens again from **+** or the Sheets panel.
- Drag a tab onto another pane's tabs or drawing to move it there (`Ctrl` to keep it in both), along the strip to
  reorder, or into a detached window. Right-click a tab (or *Window → Document Tab*) for *Move to Pane*, *Also Show
  in Pane*, *Move to New Pane* and *Move to New Window*. A pane whose last tab moves away closes.
- A sheet dragged from the Sheets panel onto a pane shows there. The pane's sheet picker lists the sheets of the
  document on show first.

### Add Detail from the right-click menu
- With one or more markups selected, right-click → **Add Detail to N Markups…** opens a window listing the standard
  details already made: tick one to add it to all of them, untick to take it off (a dash shows it is on some), with a
  preview of the material that results. **New Detail for These N…** makes a new detail for them. Also in Properties.

### Custom keyboard shortcuts
- *Settings → Keyboard* lists every command with its keys: add a shortcut by pressing it, remove one, put a command
  back to its default or reset all. Clashes with another command are shown with the choice to move the key. Search by
  command or key. Menus, toolbar tooltips and *Help → Keyboard Shortcuts* show your keys; detached windows use them too.

### Flatten markups
- *Edit → Flatten Markups…* (and on the right-click menus) draws the selected markups, the sheet's or all of them into
  the PDF itself, with or without measurement labels. They leave the list, or stay as takeoff data on a hidden, locked
  *Flattened* layer. One undo step brings everything back.

### Page labels from a box
- Draw a box around the sheet number, title or both on one page (*Document → Page Labels from a Box…* or right-click
  the drawing); the same spot is read on all pages or only the ticked ones (*All*, *None*, *This File*, *Unlabelled*).
  The dialog shows the text found in the box on each page; what the box holds is guessed and can be changed.
- Captions are dropped more carefully: a title such as *COVER SHEET* keeps its last word.

### Faster opening and rendering
- Rendered pages are kept (as GPU-backed bitmaps) and the next and previous sheets are rendered ahead while idle, so
  paging back and forth is near instant; thumbnails share these renders. Background rendering gives way as soon as
  the sheet on screen needs drawing.
- Page sizes are read in parallel, and large sets (over 12 pages) show the drawing before reading sheet numbers.
- PDFs draw on hardware-accelerated canvases. New *Settings → Speed & Graphics*: hardware acceleration On / On for
  untrusted drivers / Off in the desktop app (with the graphics features in use), rendering ahead, how many rendered
  pages to keep, and when to read labels.

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
