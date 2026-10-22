# Changelog

## 1.22.0 – 2026-10-22

### Text and icon size
- The whole program larger or smaller, 75% to 200%: *Settings → General → Text and icon size*, *View → Text and Icon
  Size*, or `Ctrl+Shift+=` / `Ctrl+Shift+-` (*Normal Text and Icon Size* can be given a key in *Settings → Keyboard*).
  Kept for every project and the next start. The desktop app zooms every window (detached panes and reports too);
  drawing, dragging, menus and resizing still follow the mouse. The drawing's own zoom is unchanged.

### New names
- **Tool Library** (was Tool Chest), **Takeoff List** (was Markups List), **Path Length** (the multi-point length
  measurement), and the status-bar switches **DWG SNAP**, **MARKUP SNAP** and **KEEP TOOL**. Everything else works as
  before: your tool library, workspace layout, key bindings and tool defaults are brought over on the first start, and
  takeoffs saved by earlier versions open as before (their path lengths and the standard details that pick them by
  type included).

## 1.21.0 – 2026-10-22

### Drawing
- **A picked tool shows what it draws.** Picking a measuring or markup tool (toolbar, Measurements panel, Tool Library)
  opens Properties on the **next markup** – Subject, Label, Height, Finish, Style, every column and the layer, its
  sections open – and the Measurements panel on the next measurement (Depth, Width, Height, units). Change anything
  before drawing: a Tool Library tool keeps the changes, other tools keep them as their defaults (↺ goes back to the
  built-in ones). Drawn, Properties shows the new markup as before.
- **Paste at the pointer**: `Ctrl+V` puts the copied markups down with their farthest-left point – a box's bottom-left
  corner – at the mouse (right-click *Paste* at the point clicked). With the pointer off the drawing, and for
  *Duplicate*, the copy lands just below and right as before.
- **Full-screen crosshairs**: lines across the whole view through the pointer (its snapped point while drawing).
  *Settings → Full-Screen Crosshairs*, or *Settings → Drawing & Editing*: off, while drawing and measuring, or always.
  A key can be set for it in *Settings → Keyboard*.
- **The view moves at its edge while drawing**: pulling a length (or a path length, area, box, a markup being moved or
  an end being dragged) to the edge of the view, or past it while holding the button, scrolls the drawing along.
  Switch it off in *Settings → Drawing & Editing* or the Settings menu.

### Bent plate as a length
- A **Bent Plate** size tool in the Tool Library (*Misc Metals*): a length measurement where you type the bent plate
  size in its box (`BP3X3X1/4`, `BP6X4X3/8`…); each run weighs length × lb/ft. Added once to Tool Libraries from
  before. The plain Length tool works too: give it subject BP and the size as its label before drawing.

### Licenses tied to computers
- Every computer has a **computer ID** (`XXXX-XXXX-XXXX-XXXX`), shown with a copy button in *Help → License…*. The
  desktop app takes it from Windows (the same after reinstalling); a browser makes one up and keeps it.
- A license can list the computers it works on: it is refused on any other (“This license is for another computer.
  This computer’s ID is …”), on activation and at every start. The number of computers is set when the license is
  issued: `npm run license -- issue … --computers ID1,ID2 [--seats N]`, or the *Computer IDs* and *Number of
  computers* boxes of the *Issue license* workflow. Licenses without a list still work on any computer.

## 1.20.0 – 2026-10-21

### Plate and bent plate weights
- **Bent plate** (BP) weighs by the foot: a 12" piece of flat plate as wide as the legs added together, times the
  thickness (BP3X3X1/4: 12" × 6" × 1/4" × 0.2836 lb/in³ = 5.10 lb/ft). Any number of legs (BP4X6X4X3/8). In the
  Weight column, the Combine Report and the takeoff summary like other steel.
- `PLF()` and `PSF()` take several sizes and use the first they know. The default Weight column reads the Member Size,
  else the label: `Qty * (Length * PLF([Member Size], Label) + Area * PSF([Member Size], Label))`. Documents with the
  earlier default are changed when they open; formulas of your own are left alone.
- A **BP3X3X1/4** tool in the Tool Library, a **BP – Bent plate** family for size tools, and BP and PL sizes among the
  suggestions.
- BP is bent plate: the *Base Plate* tool's subject is PL (Tool Libraries from before are changed to match).

## 1.19.0 – 2026-10-21

### License
- Basic needs a license too. A new install runs a **7-day Basic trial** from its first start; the menu bar badge shows
  *Trial · Nd* (days left), and the License window the trial's days left.
- When the trial is over without a license, the program waits behind the License window (no close button, Escape and
  shortcuts do nothing) until a Basic or Pro key is entered; takeoffs are kept. An expired license counts as none.
- The badge reads Trial, Basic, Pro or Unlicensed.

## 1.18.0 – 2026-10-21

### License: Basic and Pro
- Two tiers. **Pro** adds the **Combine Report** (with Create Report) and the **Automatic Takeoff**; **Basic** has
  everything else. Without a license the program runs with the Basic features.
- *Help → License…* and the tier badge on the menu bar: the license (tier, licensed to, issued, expiry), the two tiers
  side by side, and the license key – pasted or loaded from a `.bslicense` file. *Remove License*.
- License keys are signed and checked offline; edited, foreign and expired keys are refused (an expired license falls
  back to Basic).
- Pro features without Pro are marked PRO (menus, the Auto toolbar button, their Settings pages) and open the license
  window; activating Pro there carries on to the feature.
- `scripts/license.mjs` (`npm run license`) makes the signing key pair, issues and checks keys; the *Issue license*
  GitHub workflow issues keys from the website using the `LICENSE_PRIVATE_KEY` secret.

## 1.17.0 – 2026-10-21

### Combine report: Create Report
- **Create Report** opens a window to choose a report made from the plan as set up (sheets, detail material, stock
  lengths):
  - **Order List** – each size and stock length to order with its quantity, one line each (`L3X3X1/4  40'-0"  6`).
    Sizes without stock lengths list their lengths as cut, marked *.
  - **Cut List** – each size's bars, those cut the same way together: how many, the stock, what is cut from each and
    the drop; whole bars *full length – no cut* (spliced ones marked ⧉).
- Print / PDF, CSV, or Copy as text in columns lined up with spaces.

### Units
- Unit choices for feet-inches no longer say "(your units)" (Measurements panel, Manage Columns); the Settings heading
  is *Measuring units*.
- Escape closes only the window on top when one window opens another.

## 1.16.0 – 2026-10-20

### Split view
- Split as many times as you want: each split – Split Vertical (Ctrl+Shift+2), Split Horizontal (Ctrl+Shift+3), Split
  Four Ways (Ctrl+Shift+4), the Window menu or the status-bar buttons – splits the active pane again, inside other
  splits in any mix. The new pane is the active one; panes split beside others the same way share the space evenly.
  There is no longer a limit of four panes (new panes from tabs and panes put back from their own window too).
- Panes are closed by hand with their ×. Pressing a split's keys again splits again (it no longer goes back to one
  view). *Window → Single View (Close Other Panes)* has no key by default (one can be set in Settings → Keyboard).
- Every divider resizes the panes beside it. Narrow panes keep their buttons; the sheet picker gives way.

## 1.15.0 – 2026-10-20

### Measurements panel
- Rebuilt: the measuring tools in a row (Calibrate, Length, Path Length, Area, Perimeter, Volume, Count, Angle), then
  *Page Scale* (the sheet's scale and viewports), *<Type> Measurement Properties* and *Totals & Display*, each folding
  open and shut.
- Measurement Properties of the selection: Subject, Label, **Depth** (with the unit its dimensions are written in),
  **Width**, a count's **Height**, and the **Length / Area / Volume** units the measurement is written in. A length
  has no Height.
- **A count with a Height takes off a length** – each piece counted that long (3 × 1'-2" = 3'-6") – in the Length
  column, labels, totals, selection totals, weight formulas and the Combine report. Width × Height gives its area,
  × Depth its volume. A length with a Width is a strip with an area (and a volume with a Depth); an area with a Depth a
  volume.
- A measurement's own units show on the drawing and in the Takeoff List; totals stay in the project's units. Tools
  made from a markup keep its Depth, Width and units.
- The Takeoff List has a Width column; Depth can be typed for counts and lengths too. Depth and Width aren't added up.

### Workspace
- The right dock stacks the Tool Library, Measurements and Properties, each sized by the splitter between them. Saved
  layouts get Measurements in its own section below the Tool Library once.
- Side panels resize at every window size: in a narrow window, where a panel lies over the drawing, by a grip on its
  edge. Docks can be made narrower (160 px) and wider (up to the window less 260 px).
- Sheets panel: a **slider for the thumbnail size**; small thumbnails sit side by side.

### Keyboard
- Split view from the keyboard: Ctrl+Shift+2 split vertical, Ctrl+Shift+3 split horizontal, Ctrl+Shift+4 four ways,
  Ctrl+Shift+1 single view (pressing a split's keys again goes back to one view). Changed in *Settings → Keyboard*;
  shown in the Window menu and on the status bar buttons.

## 1.14.0 – 2026-10-20

### Combine report
- A piece as long as a stock length (to 1/16") is ordered whole: that bar, with no cut, kerf or machine allowance.
  Such bars are drawn solid and marked *full length – no cut*; the order shows how many. Before, a 40'-0" piece on 40'
  stock was too long by the kerf and was spliced.
- Pieces longer than the longest stock are spliced from whole bars and one cut piece, choosing the bars that order the
  least (63'-0" of W: 40' + 23' cut from a 25', not 60' + 3'). The cut pieces (marked ⧉) are nested with the other
  pieces of the size instead of taking a bar each.
- A piece just shorter than the longest stock but too long to keep the machine allowance is trimmed from that bar
  rather than spliced.
- The CSV's cutting plan has a Note column (full length, trim) and marks spliced pieces; the printout shows the same.

## 1.13.0 – 2026-10-15

### Your units
- *Settings → Units & Totals → Your units*: measure in Feet-Inches (`1'-1"`, the default), Decimal Feet, Inches,
  Meters, Centimeters or Millimeters, with a precision (1/16" for feet-inches). Yours: kept on the computer, for every
  document.
- Measurements, heights, standard detail piece lengths and spacings, maximum lengths, the selection totals, the arrow
  key step and the Combine report are shown in your units. A sheet calibrated in the same units keeps its own
  precision; *Show each sheet's measurements in the units of its own scale* leaves every sheet as calibrated.
- Lengths you type are rewritten in your units when you finish: `0-28` → `2'-4"`, `1-1` → `1'-1"`. Bare numbers are
  feet in feet-inches (inches where a field is in inches), inches in inches, the metric unit in metric.

### Height is a length
- The Height column is a length: typed in your units in the Properties panel, the Takeoff List and Tool Library tools,
  kept exactly and totalled in the document's length unit. Height shows in the Takeoff List for new files; documents
  from before get the Height column as a length when they open.
- Columns can be lengths (*Manage Columns → Length*).

### Fixed
- Standard detail piece lengths on sheets measured in decimal inches showed 16 decimal places.

## 1.12.0 – 2026-10-15

### Sizes with a capital X
- Sizes are written with a capital X (W24X55, HSS6X6X3/8) in the Takeoff List and exports. `*` can be typed for the
  X (`w8*10` → `W8X10`); a space after the shape is kept (`W 8*10` → `W 8X10`). Member Size cells and fields, size
  tools, labels that are sizes, standard detail material, the Tool Library and the automatic takeoff.
- Files and Tool Libraries from earlier versions are brought up to date when they open.

### Properties panel
- Measurements and counts show the main fields – Subject, Label, Length (or Count, Area…), Height and Finish – then
  *Style* (line and text styles and colours) and *Properties* (a box for every other column, Comments, Status, Layer,
  Author) that fold open, and *Measurement* and *Standard Details*. Sections stay open or shut as left.
- *Properties* has a field chooser: hidden fields keep their values in the markups and the Takeoff List.
- The panel opens when a markup is drawn or selected (*Settings → General* to switch off). Properties has its own
  section below the Tool Library, so the Tool Library stays in view; saved layouts are changed once to match.
- New columns **Height** and **Finish** (Galvanize, Prime, Paint, Powder Coat, Bare); Finish shows in the Takeoff List.
  Documents from before get them when they open.

### Selection totals
- Selecting markups shows a box beside the selection with their total length, count and area, and the standard detail
  material on them (3 × 10'-0" beams: 30'-0"; 3 counts of 10: 30 EA).

### Standard details
- Material added by a quantity or a spacing shows the length of each piece in the Length column (with the number of
  pieces in Count); full-length material shows the measured run. Totals, weights and reports still use every piece.
- **Galv** tick per material: its Finish is Galvanize. Shown as GALV in the rule.

## 1.11.0 – 2026-10-15

### Maximum lengths by shape
- *Settings → Length Measurements* (new; also *Settings → Length Measurements…*): the longest piece of each shape
  (every subject, plus *Other shapes*), blank for none; *Set Every Shape*, *Clear All*.
- A length or path length measurement longer than its shape's maximum is taken off as pieces along the same line, each
  its own markup on the drawing and in the Takeoff List: with W at 40'-0", a 63'-0" line becomes 40'-0" + 23'-0".
  Full pieces first from the start of the line; path lengths are cut along their length.
- The shape is the markup's subject, else the shape of its Member Size or label. Members found by the automatic
  takeoff are broken too (can be switched off).
- *Split at Maximum Length* (right-click on the drawing or in the Takeoff List, *Edit* menu) breaks measurements
  already taken off; one undo puts them back.

## 1.10.0 – 2026-10-15

### Detail marks by shape
- *Settings → Detail Marks* (new; also *Settings → Detail Marks…*): how standard detail material is drawn, set for
  each shape (W, HSS, L, C, MC, WT, S, HP, PL, BP, BO, PIPE to start with, and **Other shapes**):
  - count marks (× quantity, @ spacing): show, symbol, size, colour, label on/off;
  - lines (full length): show, solid/dashed/dotted, width, colour, label on/off.
- Add and remove shapes, reset to the defaults; a sample of each look in the list. Text size and the space from the
  markup at the top (moved here from Drawing & Editing). Used on the drawing and in flattened PDFs.
- A material's shape comes from its size (L4x4x3/8 → L), else its subject. Detail marks no longer follow the Auto
  Takeoff line styles or the Tool Library.

### Docks split into sections
- Each dock (left, right, top, bottom) splits into up to four sections (three splits), each a group of tabs with its
  own open panel: the Sheets and the Tool Library on the left at the same time, the Takeoff List beside the Takeoff
  Summary.
- Drag a panel onto the end of a section to split a new section there (the place is highlighted), or onto a section
  to join its tabs; or *Split Below / Split Right (New Section)* and *Move to Section* in a panel's layout menu.
- Drag the splitters between sections to size them, and the dock's edge for its width or height. Sections collapse on
  their own; empty ones close up. Saved layouts from before open as one section per dock.

### Program windows
- Every window can be moved by its title bar (double-click to centre it again) and opens where it was left for the
  rest of the session.
- Windows no longer dim the program, and the drawing and panels behind them stay usable.
- The Settings window is wider.

## 1.9.0 – 2026-10-15

### Standard detail material on the drawing
- The material a standard detail adds (by its rule or by hand) is drawn next to its markup, a little to the side so
  both stay readable, and moves with it:
  - **full length** – a line the same length and direction as the markup, on the side away from its label (inside
    the outline of an area), with the size along it;
  - **@ spacing** – a mark for every piece where it falls along the member, with the number, size and spacing;
  - **× quantity** – a count mark with the number of pieces next to the markup's label (stacked when there are
    several; by the count label on a count markup).
- Drawn in the look of the material's shape: the Auto Takeoff line style rule for the shape, else the Tool Library tool
  for the size (its symbol for marks), else a colour per size.
- Hover shows the detail and the quantity; clicking selects the markup. Not a markup of its own: the material is
  still counted once, in the Takeoff List, Summary and exports.
- *Settings → Drawing & Editing → Standard detail material*: show or hide it (also *View / Settings → Standard Detail
  Material on Drawing*), its size and count text, and the space from the markup. Flattened PDFs draw it too.

### Fixes
- The quantity of standard detail material reads "× 4" instead of "× 4.00".

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
  from a list rather than typed (Subject cell of the Takeoff List, Properties, Tool Library tool editor). The size is
  the Member Size and the label.
- *Settings → Subjects*: add and remove shapes, reorder, reset to the defaults; the list is per user and applies to
  every file. Each shows how many markups in the open file use it.
- New markups, size tools and the automatic takeoff take the shape of their size from the list (W24x55 → W,
  HSS6x6x3/8 → HSS, MC12x10.6 → MC). Markups whose size has no shape in the list have no subject. The built-in Tool
  Library tools have shape subjects (Base Plate: BP).
- The Takeoff Summary lists each size on its own line (W24x55, W18x35…).
- Subjects from earlier files (W24x55, HSS Column…) show in italics; *Change Sizes to Shapes* turns them into shapes
  (the size goes into Member Size), *… and Clear the Rest* clears subjects that name no shape. Revision clouds from
  overlay compare have no subject (their label says what they are).
- The built-in standard detail examples match on Subject, Category and Type; searching the Takeoff List keeps the
  material standard details add with the markups it finds. The example takeoff was made again with shape subjects.

### Text colour
- Labels and text have their own colour, separate from the line: *Properties → Text colour* (or *Same as line*), the
  Tool Library tool editor, size tools (*Label colour*) and each automatic takeoff line style rule (*Text*). Used on the
  drawing and in flattened PDFs.

## 1.6.0 – 2026-10-14

### Every PDF is its own document
- Opening a PDF opens it as its own document (in a new tab), no longer as part of a combined project. Its markups,
  sheet labels, scales and viewports, custom columns, layers, standard details and overlays belong to that file only,
  and each document has its own undo history and selection. The Sheets panel, Takeoff List, Summary and the other
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

### Takeoff List layout per file, with a default
- Rename column headers (double-click, or right-click → *Rename Column…*), move columns by dragging their headers
  (or *Move Left / Right*), hide them from the header menu; *Columns…* renames too. Each file keeps its own layout.
- *Save as Default Style*: files opened from now on start with this layout (columns shown, order, widths, header
  names and the custom columns). *Apply Default Style*, *Reset to Built-in Style*.
- *Export This Style… / Export Default Style…* save the layout to a file as a backup; *Import Style…* and *Import as
  Default Style…* bring it back. Also in the new *Settings → Takeoff List*.

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
  MC/C purple, L orange dotted). Without a matching rule the Tool Library tool for the size, or a colour per size, is
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
  using the Tool Library tool for that size when there is one.
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
- New **Standard Details** (Tools → Standard Details…, the package button in the Takeoff List, the Takeoff Summary
  or a markup's Properties). A standard detail is a rule:
  **IF** *[column]* = *value* **→ ADD** material (Subject, Size, Length) **@ spacing OC**, **× quantity** or
  **full length**.
- The column and the value are picked from drop-downs; the value list holds the values that column has in the
  takeoff (with counts). Conditions can also be *≠* or *contains*, and several conditions can be combined (AND).
- Material is added to every matching markup as read-only rows under it in the Takeoff List (Type
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
- BuildSuite branding, size tools and hidden tools in the Tool Library, count editing (quantity, split, resume),
  split view, dockable and floating panels and toolbar.
