# BuildSuite Takeoff Studio

<img src="branding/takeoff-icon.svg" width="72" align="right" alt="">

A Windows desktop program (with a web version for testing) for construction-drawing **measurement, markup and quantity
takeoff**, built for the way estimators work through a drawing set. Drop in a PDF drawing set, label the
sheets, calibrate scales, measure and count with standardized Tool Chest tools, and work with every quantity in an
editable, filterable markup database that stays linked to the drawing. Part of the **BuildSuite** family of programs.

> **Version 1.3.0** adds **automatic takeoff** of labelled beams and tubing, and standard details added **by hand** to
> any selection of markups (1.2.0: overlay / compare; 1.1.0: Standard Details and detachable split windows) – see the
> [changelog](CHANGELOG.md).

![Takeoff on the roof framing plan](docs/screenshot-takeoff.png)

![Takeoff summary grouped by category](docs/screenshot-summary.png)

![Split view: plan and details side by side](docs/screenshot-split.png)

![A split pane detached into its own window](docs/screenshot-detached-pane.png)

## Install on Windows

Download **BuildSuite-Takeoff-Studio-Setup-x.y.z.exe** from the latest
[Windows installer workflow run](https://github.com/jakmartin13101/pdf/actions/workflows/windows-installer.yml) (artifact
*BuildSuite-Takeoff-Studio-Setup*) or from a GitHub release, then run it:

1. **Welcome** → **License Agreement**: the BuildSuite Takeoff Studio Terms of Service must be accepted (*I Agree*).
2. Choose *Only for me* or *Anyone who uses this computer*, and the install folder.
3. Setup creates a **desktop shortcut** and a **Start menu → BuildSuite → BuildSuite Takeoff Studio** entry, and
   registers the program in *Settings → Apps* for uninstalling.

<img src="docs/installer-welcome.png" width="420" alt="Installer welcome page"> <img src="docs/installer-license.png" width="420" alt="Installer license page">

The installer is not code-signed yet, so Windows SmartScreen shows *Windows protected your PC* on first run
(*More info → Run anyway*). Sign it with your organisation's certificate before distributing (see
[Building the installer](#building-the-windows-installer)).

The desktop app works offline. PDFs and `.takeoff.json` projects can also be opened by dragging them onto the window or
the desktop shortcut, or from Explorer with *Open with → Choose another app* (pick BuildSuite Takeoff Studio once; the
installer does not take over the default PDF viewer). Saves and exports use the normal Windows *Save As* dialog.

## Quick start (web version for testing)

```bash
npm install
npm run dev          # http://localhost:5173  (add ?sample to auto-open the sample set)
npm run desktop      # build and run the desktop app (Electron) on this machine
```

On the start screen choose **Open Example Takeoff** (the sample set calibrated, with a structural takeoff already in
progress), **Open Sample Drawing Set** (the same 7-sheet warehouse set — foundation and framing plans, details at mixed
scales, architectural and MEP sheets — with no takeoff yet), or open / drop your own PDFs.

A five-minute tour with the sample set:

1. **Sheets panel (left)** – sheet numbers and titles (`S1.01 – Foundation Plan`, …) were read from the title blocks.
2. Open **S1.01**, click **Calibrate**, click both ends of the `20'-0"` dimension string at the left of grids 1–2, type
   `20'-0"`, choose *Apply to: All sheets* → the sheet reads `1/8" = 1'-0"`.
3. Open **S1.02 Roof Framing Plan**. In the **Tool Chest** (right) click **W24x55** and click beam ends along a grid
   line. Click **HSS6x6x3/8 Column** and click each column – every click adds to one count. Use **Metal Deck** to trace
   the roof area (double-click or Enter to finish).
4. The **Markups List** (bottom) now holds every takeoff object with Subject, Sheet, Length/Area/Count, Category,
   Member Size, Qty and a computed **Weight**. Click a row to jump to the markup; click a markup to find its row.
5. Open **Takeoff Summary** for totals by category/subject (e.g. `W24x55 — 24 EA · 552.00 LF`, `30,360 lbs`), then
   export CSV, a printable report, or a flattened PDF.

## How the requested workflow maps to the app

| Workflow step | Where it lives |
| --- | --- |
| **1. Sheet labeling & organization** | Sheets panel: thumbnails/list, search, drag to reorder, double-click to rename. *Document → Page Labels*: auto-detect from title blocks, read number/title from a boxed title-block region on every page, sequential numbering, or edit in a table. Multiple PDFs combine into one sheet set. |
| **2. Scale calibration** | *Calibrate* (two points + known distance such as `20'-0"`, `20-6`, `6.1 m`), *Set Scale* (architectural, engineering and metric presets or custom), apply to one / all / unscaled sheets. **Viewports** give a rectangular area of a sheet its own scale (details drawn at 1½" = 1'-0" next to a 1/4" section). Units: ft-in, decimal ft, in, m, cm, mm with selectable precision. |
| **3. Linear measurements** | Length and Polylength tools; results are persistent markup objects you can select, move, reshape by dragging vertices, restyle and inspect. Snaps to PDF line work (endpoints, midpoints, intersections, lines), to markup vertices, and Shift/ORTHO constrain angles. |
| **4. Area & perimeter** | Area (with perimeter shown), Perimeter, Volume (area × depth, CY/CF/m³), Angle; area **cutouts** for openings. |
| **5. Count** | Count tool: every click adds a symbol to the same count markup (circle, square, triangle, diamond, star, check, cross). |
| **6. Custom markup tools** | **Tool Chest** with default sets (Structural Steel, Joists/Deck/Connections, Misc Metals, Concrete, Architectural & MEP, Review). Each tool stores type, subject, appearance, layer, depth and **column values** (Member Size, Grade, Category, Qty…). Create tools from scratch or from any markup, edit, duplicate, move between sets, import/export JSON. *Apply Tool Properties* restyles existing markups. |
| **7. Editable Markup List** | Bottom panel. Double-click cells to edit Subject, Label, Comments, Status, Layer, Color, Author, Depth and every custom column; checkmark toggles. Multi-select edits apply to all selected rows. Undo/redo everything. |
| **8. Custom columns & data fields** | *Manage Columns*: Text, Number, Choice and **Formula** columns, ships with a structural-steel template (Piece Mark, Member Size, Material, Grade, Qty, Weight, Level, Grid, Detail, Connection, Labor Category, Notes, Category). Show/hide and reorder any column, resize by dragging headers. |
| **9. Sort, filter, group** | Click headers to sort, funnel icons for per-column value filters, search box, *Current Sheet* scope, *Group by* any text/choice column with per-group subtotals and a totals row. |
| **10. Drawing ⇄ data link** | Selecting a row navigates to its sheet, zooms and flashes the markup; selecting on the drawing highlights and scrolls to the row. Hover a markup for a quick readout. |
| **11. Takeoff summary** | Totals per subject grouped by Category (or any column): pieces (EA), length (LF), area (SF), volume (CY), Qty and every numeric/formula column (e.g. weight in lbs and tons). Click a line to select its markups. |
| **12. Export / report** | Markups CSV, summary CSV, printable summary report (save as PDF from the print dialog), flattened PDF with markups and measurement labels burned in, and portable project files (`.takeoff.json`, drawings embedded). |
| **Overlay / compare** | *Document → Compare / Overlay Sheets*: two sheets in their own colours, auto-aligned (text or image) or aligned by points / by hand, with change detection and revision clouds. See [Overlay / compare](#overlay--compare-sheets). |
| **Standard details** | *Tools → Standard Details*: IF a column (drop-down) equals a value (drop-down of the takeoff's values) → ADD material by subject, size and length, @ spacing OC, × quantity or full length – or add a detail by hand to any selected markups. See [Standard details](#standard-details). |
| **Automatic takeoff** | *Auto* button (*Tools → Automatic Takeoff*): finds the member-size labels on a plan (W24x55, HSS8x4x1/4, Pipe 4 Std…), measures the line each one labels at the sheet's scale and creates labelled length measurements. See [Automatic takeoff](#automatic-takeoff-beams-and-tubing). |

### Tool Chest: size tools and hidden tools

* **Steel shape / size tools** – *Tools → New Steel Shape / Size Tool…* (or the I-beam button in the Tool Chest). Pick
  a shape family (W, HSS, L, C, MC, WT, S, HP, PL, Pipe, joists, or *Other* for any label), the measurement type
  (length, polylength, area, perimeter, volume, count…), line colour/width/style/ends, fill, symbol, layer and the label
  **font, size and bold**. The tool shows a size box in the Tool Chest: type `24x68` (normalised to `W24x68`) and every
  markup placed with the tool is labelled `W24x68`, gets it as Subject and Member Size (so weights compute), and the
  size **stays with the tool – across sessions – until you type a different one**. Enter in the size box starts the tool.
* **Hide tools** – right-click a tool or set → *Hide Tool* / *Hide Set*. The eye button in the Tool Chest header shows
  hidden tools (dimmed) with per-tool and per-set eye toggles to bring them back.
* Any tool can be made a size tool from its properties (*Size / label tool*), and fonts are available on every tool.

<img src="docs/screenshot-size-tool.png" width="520" alt="New Steel Shape / Size Tool dialog">

### Count editing

Select a count markup (or right-click it on the drawing or in the list):

* **Quantity** – type a number to override the counted symbols (shown with `*` in the list; *Reset* goes back).
* **Resume Count** – continue clicking symbols into the same count.
* **Split This Item** (right-click a symbol) / **Split All** – break symbols out into separate count markups with the
  same properties; *Remove This Item* deletes one symbol.

### Standard details

*Tools → Standard Details…* (also the package button in the Markups List and Summary, and *New Detail for This…* in a
markup's Properties) defines rules that add material wherever the takeoff matches:

```
IF [Member Size] = "W24x55"     → ADD Clip Angle  L4x4x3/8  × 0'-11 1/2"  × 4 EA
IF [Subject] = "Handrail"       → ADD Post  HSS1-1/2x1-1/2x1/8  × 3'-6"  @ 4'-0" OC (+1)
IF [Subject] = "Metal Deck"     → ADD Edge Angle  L3x3x1/4  full length
```

* **IF** – pick the column from a drop-down, then the value from a drop-down of the values that column holds in the
  takeoff (*Other value…* to type one). Use *=*, *≠* or *contains*, and add more conditions (AND).
* **ADD** – one or more materials, each with **Subject**, **Size** and **Length** (each piece; bare numbers are inches),
  and how many: **@ spacing OC** along the measured length (an area's perimeter), with an optional end piece;
  **× quantity** per markup or per counted item; or **full length** of the measured run. The markup's Qty multiplies
  the result.
* The added material appears under each matching markup in the Markups List (*Standard Detail*, read-only) and as its
  own lines in the Takeoff Summary and exports. The size fills Member Size, so Weight computes for it (steel shapes,
  plate, pipe, rod and rebar). *Detail material* in the list (or the summary) shows or hides it.
* **By hand** – select any markups (Ctrl+click or box-select in the drawing or the Markups List), right-click →
  **Standard Details**: tick a detail to add it to every selected markup (or untick to take it off), or choose
  **New Detail for These N…** to make a detail for them. The Properties panel shows a checkbox per detail for the
  selection, and the editor has **Add to Selected / Take off Selected**. A detail with *Apply automatically* off goes
  only where you add it; one with a rule still lets you add it to other markups or take it off single ones by hand.
  *Back to Rules Only* drops the by-hand changes.
* The editor shows the rule as a formula and a live preview of pieces, length and weight. Details are saved with the
  project; export/import them as JSON to reuse on other jobs. The example takeoff includes four.

<img src="docs/screenshot-standard-details.png" width="640" alt="Standard Details dialog">

<img src="docs/screenshot-details-by-hand.png" width="640" alt="A standard detail added by hand to three selected tubes">

![Material added by standard details in the Markups List](docs/screenshot-detail-rows.png)

### Automatic takeoff (beams and tubing)

Open the **Auto** panel (toolbar, or *Tools → Automatic Takeoff (Beams & Tubing)…*) on a framing plan and click
**Find Members**:

![Automatic takeoff of the roof framing plan: members found, previewed by size](docs/screenshot-auto-takeoff.png)

* It reads the PDF's own text and line work: every **member-size label** – W, S, M and HP beams, HSS (rectangular,
  square and round), TS and Pipe tubing, C/MC channels, optionally L angles – and the **line it labels**: the line that
  runs parallel to the text, right beside it, under the middle of the label. Solid lines win over dashed grid and hidden
  lines, heavy ones over hairline dimension lines, and each label takes one line. Labels that name columns
  (*HSS6x6x3/8 COLUMNS*) are skipped – columns are counted, not measured.
* **Scale** – lengths use the sheet's scale (and viewport scales inside details). A sheet with no scale yet uses the
  scale printed on the drawing (`SCALE: 1/8" = 1'-0"`) when there is exactly one, and that scale is set on the sheet
  when you create the measurements; otherwise the panel asks you to calibrate.
* **Review** – the members are previewed on the drawing in a colour per size with the label they were read from boxed.
  The panel groups them by size with count and total length; untick a size, expand it to untick single members (click
  one to zoom to it), or click a member on the drawing to leave it out. *Skip members already taken off* leaves out
  members an existing length measurement covers, so it can be run again after more work. *Add to each end* lengthens
  every member (e.g. to the grid lines or column centres).
* **Create** – one length measurement per member in one undo step, labelled with its size, with the size as Subject and
  Member Size (so Weight computes and standard details apply). When the Tool Chest has a length tool for the size
  (e.g. *W24x55*), its colour, layer and column values are used.
* Search one sheet or all sheets. The example takeoff's roof beams and canopy tubes were taken off this way.

### Overlay / compare sheets

Compare two versions of a drawing: *Document → Compare / Overlay Sheets…* (or the
**Compare** button). Add the revised PDF to the set first (*File → Add PDF to Set…*); the revision of the same sheet
number is suggested as the overlay.

![Addendum 2 of S1.02 overlaid on the original, with the changes boxed](docs/screenshot-overlay.png)

* **Colours** – sheet A and sheet B each draw in their own colour (red/blue by default, presets or any colour) and
  multiply: line work on both sheets shows dark, what is only on A shows in A's colour, what is only on B in B's.
  Each sheet has an **intensity** slider and an eye button to hide it; *Overlay on* switches the whole overlay off and
  on.
* **Auto Align** – matches the text both sheets share (titles, notes, grid bubbles, member labels) and fits shift,
  scale and rotation, so revisions plotted at a different size or position line up exactly; scans without text are
  aligned by image correlation. The panel shows how much of the line work matches after aligning.
* **Manual alignment** – *Align by Points*: click 2 or 3 sharp features (grid intersections, corners) on sheet A, then
  the same features on sheet B; each step shows only the sheet being clicked and snaps to its line work. *Move by Hand*
  drags sheet B; arrow buttons nudge it by 0.01", 0.1" or 1"; X/Y offset, rotation and scale can be typed exactly.
* **Find Changes** – boxes and lists every difference (*Only on A*, *Only on B*, *Changed*). Line work is compared as
  images and text as text, so a single changed digit in a note is found. Click a change to zoom to it; **Add Clouds**
  adds a *Revision Change* cloud markup around each one (one undo step).
* The overlay is saved with the project and works in split and detached panes. Markups and measurements stay on
  sheet A. The example takeoff includes Addendum 2 of S1.02 with an overlay ready to switch on (Compare panel →
  *Overlay on*).

### Split view and workspace layout

* **Split the document**: *Window → Split Vertical / Split Horizontal / Four Ways* or the status-bar
  buttons. Each pane has its own sheet selector, zoom and pan; the active pane is outlined and receives tools.
  Drag the divider to resize; close a pane with its ×.
* **Detach a pane** with the ↗ button in its header (or *Window → Detach Active Pane*). In the desktop app it becomes
  its own window you can move to another monitor and resize; in a browser that blocks pop-ups it floats inside the
  app (drag its header to move, the corner to resize). A detached pane uses the main window's toolbar, menus and
  panels, and whichever pane or window you click is the active one. Put it back with the header button, or close its
  window to close the pane.
* Tools stay on when you move between panes and windows, so you can measure in one and carry on in another. The
  **count** tool starts a new count when you switch to another pane, window or sheet.
* **Panels** (Sheets, Tool Chest, Properties, Measurements, Layers, Markups List, Takeoff Summary) dock to the
  **left, right, top or bottom**, or **float** in their own movable, resizable window. Drag a panel's header or tab
  (drop zones appear at the edges; drop elsewhere to float) or use its layout menu. The **toolbar** docks top, left,
  right or floats the same way.
* *Window → Lock Workspace Layout* stops accidental moves; *Reset Workspace Layout* restores the default. The layout is
  remembered between sessions.

### Formula columns

Formulas reference columns by name – `Length` (LF), `Area` (SF), `Volume` (CY), `Count`, `Depth`, `Perimeter`, `Subject`,
or any custom column (`Qty`, `[Member Size]`) – with `+ - * / ^`, comparisons, `&` (text join) and
`IF, ROUND, ROUNDUP, ROUNDDOWN, CEILING, FLOOR, MIN, MAX, ABS, SQRT, AND, OR, NOT, CONCAT`.

Steel helpers: `PLF(shape)` returns lb/ft for W, M, S, HP, C, MC, WT shapes (from the designation), HSS (rectangular and
round), angles, flat bar, rod, pipe and common K-series joists; `PSF(plate)` returns lb/ft² for plate (`PL1/2`,
`1/2" Plate`). The default Weight column is

```
Qty * (Length * PLF([Member Size]) + Area * PSF([Member Size]))
```

Report units (LF/in/m, SF/SY/m², CY/CF/m³) and decimals are set in the **Measurements** panel.

### Keyboard

| Keys | Action |
| --- | --- |
| `V` / hold `Space` / middle-drag | Select / pan |
| Wheel, `Ctrl+0`, `Ctrl+9`, `Ctrl+=`/`-`, `Z` | Zoom at cursor, fit page, fit width, zoom in/out, zoom rectangle |
| `PgUp` / `PgDn` | Previous / next sheet |
| `Shift+Alt+K L M A P V C G` | Calibrate, Length, Polylength, Area, Perimeter, Volume, Count, Angle |
| `T Q C R E L A N G P H` | Text, Callout, Cloud, Rectangle, Ellipse, Line, Arrow, Polyline, Polygon, Pen, Highlight |
| `Enter` / double-click / right-click | Finish a multi-point markup; `Backspace` removes the last point; `Esc` cancels |
| `Ctrl+Z` `Ctrl+Y` `Ctrl+C` `Ctrl+V` `Ctrl+D` `Del` | Undo, redo, copy, paste, duplicate, delete |
| Arrow keys (`Shift` ×10) | Nudge selection |

Status-bar toggles: **CONTENT** (snap to PDF geometry), **MARKUP** (snap to markup vertices), **ORTHO**, **REUSE** (keep the
tool active), **LABELS** (measurement labels on the drawing).

## Data & persistence

* Everything runs locally on your computer (or in the browser for the web version); nothing is uploaded.
* The open project autosaves to IndexedDB and is restored on reload.
* *File → Save Project As…* writes a single `.takeoff.json` containing the PDFs and all takeoff data; open it with
  *File → Open Project…* or drag it onto the window.
* The Tool Chest (including size-tool sizes and hidden tools), list layout, workspace layout and preferences are stored
  per user and shared across projects.

## Development

```bash
npm run dev        # Vite dev server
npm run build      # type-check + production build to dist/
npm test           # unit tests (units, parsing, scales, geometry, formulas, steel weights, rows, automatic takeoff)
npm run test:e2e   # Playwright end-to-end tests against the sample drawing set
npm run sample     # regenerate the sample set and the S1.02 Addendum 2 revision PDF in public/samples/
npm run example    # regenerate the example takeoff project (needs `npm run dev` running)
npm run build:artifact  # self-contained bundle in dist-artifact/ for publishing as a claude.ai Artifact
npm run desktop    # build, then run the desktop app with Electron
npm run dist:win   # Windows installer in release/ (see below)
npm run icons      # regenerate app/installer icons from branding/ (or --source <png>, see below)
npm run legal      # regenerate build/license.txt and THIRD-PARTY-NOTICES.txt from legal/
```

The artifact build opens straight into the example takeoff, follows the viewer's light/dark theme, and saves
files (project, CSV, PDF) through the viewer's download prompt, since a published page cannot start downloads itself.

Stack: React 18, TypeScript, Vite, Zustand, pdf.js (rendering, text and vector extraction), pdf-lib (export), lucide icons.

```
src/
  brand.ts         product name, icon and the desktop bridge
  core/            framework-free logic
    units.ts         ft-in / metric formatting & parsing, scale presets, calibration
    geometry.ts      lengths, areas, centroids, hit-testing helpers, clouds
    measure.ts       per-markup scale resolution (sheet vs viewport) and measurements
    formula.ts       safe expression parser/evaluator for formula columns
    steelShapes.ts   PLF/PSF weight lookup
    columns.ts       built-in + custom column model, row building for the list
    summary.ts       takeoff summary aggregation
    details.ts       standard details: matching rules, by-hand assignments and the material rows they add
    autoTakeoff.ts   automatic takeoff: line work and labels from the PDF, label-to-member matching, printed scales
    align.ts         overlay maths: similarity fits, text/RANSAC and image alignment, change finding
    compare.ts       overlay rendering helpers: tint matrices, auto-align and changes on rendered sheets
    pdf.ts           pdf.js loading, rendering, title-block text, snap index, line work for automatic takeoff
    export.ts        CSV, printable report, flattened PDF
  store/           Zustand store (undo/redo history), project I/O, autosave, commands
  components/      viewer (canvas + SVG markup layer), panels, markups list, summary, dialogs,
                   dock/ (dockable/floating panels; Panes.tsx: split panes and detached pane windows)
electron/          Windows desktop shell (main process + preload)
legal/             Terms of Service (source for the app and the installer)
branding/          BuildSuite Takeoff icon artwork
```

Rendering uses a resolution-capped base canvas plus a high-resolution "detail" canvas for the visible region, so large
sheets stay sharp at high zoom. Markups are SVG in PDF point space, so the drawing and the data are two views of one
model: every list cell is computed from the same markup objects that are drawn.

### Building the Windows installer

`npm run dist:win` builds the web bundle, generates the installer's legal files and runs electron-builder
([electron-builder.yml](electron-builder.yml)) to produce `release/BuildSuite-Takeoff-Studio-Setup-<version>.exe`
(NSIS, x64). On Windows nothing else is needed; on Linux/macOS install Wine (`wine32` and `wine64`) first. The
[Windows installer workflow](.github/workflows/windows-installer.yml) builds it on `windows-latest`, runs the unit tests
and a desktop smoke test (`scripts/desktop-smoke.mjs`), uploads the installer as an artifact, and attaches it to a
GitHub release when a `v*` tag is pushed.

* **Desktop shell** – [electron/main.cjs](electron/main.cjs) serves `dist/` from a private `app://` origin with a strict
  Content-Security-Policy, keeps Node.js out of the renderer (context isolation + sandbox), and exposes a small
  `window.buildsuite` API from [electron/preload.cjs](electron/preload.cjs) for native Save dialogs, report windows and
  files opened from Explorer. F12 opens developer tools.
* **Terms of Service** – [legal/terms-of-service.md](legal/terms-of-service.md) is the single source for the installer's
  license page, `TERMS-OF-SERVICE.txt` in the install folder and *Help → Terms of Service*. Fill in the bracketed
  placeholders (legal entity, address, governing law, privacy policy URL) and have counsel review it before release.
  Open-source licenses of the bundled code go to `THIRD-PARTY-NOTICES.txt`.
* **Branding** – the BuildSuite Takeoff icon is [branding/takeoff-icon.svg](branding/takeoff-icon.svg) (with a
  simplified small-size variant). `npm run icons` renders it to `build/icon.ico` (16–256 px), `build/icon.png`, the
  installer sidebar and `public/brand/`. To use artwork from the BuildSuite icon sheet instead, run
  `node scripts/build-icons.mjs --source <sheet.png> [--crop x,y,size]`.
* **Code signing** – set `CSC_LINK`/`CSC_KEY_PASSWORD` (or `WIN_CSC_LINK`) for electron-builder to sign the app and
  installer; bump `version` in package.json for each release.

### Known limitations

* Scanned (raster) PDFs have no text layer: title-block reading and content snapping need vector PDFs; enter labels by
  hand and rely on markup snapping for scans.
* Markups are stored in the project, not written back into the PDF as native annotations; use the flattened PDF export
  to share marked-up drawings.
* Automatic takeoff needs vector PDFs whose member labels are text placed beside the member, parallel to it. Labels
  connected by a leader line, or one *TYP.* label meant for several members, give one member each; scans have no line
  work or text to read.
* Single user; there is no real-time collaboration.
