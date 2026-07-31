# Manual 1 — User Manual

**Drip Irrigation Design Workbench**
Installation, operation, verification and distribution.

---

## Contents

1. [Scope and limits](#1-scope-and-limits)
2. [Prerequisites](#2-prerequisites)
3. [Installation and first run](#3-installation-and-first-run)
4. [Project layout](#4-project-layout)
5. [Updating the application](#5-updating-the-application)
6. [Verification — acceptance test](#6-verification--acceptance-test)
7. [Interface reference — every input and output](#7-interface-reference--every-input-and-output)
8. [Recommended design workflow](#8-recommended-design-workflow)
9. [Worked example](#9-worked-example)
10. [Distribution to other users](#10-distribution-to-other-users)
11. [Troubleshooting](#11-troubleshooting)
12. [Known limitations](#12-known-limitations)

---

## 1. Scope and limits

The Workbench is a **screening and design tool** for surface drip irrigation of field crops and
plantations. It covers five linked domains:

| Domain | What it does |
|---|---|
| Network hydraulics | Solves emitter → lateral → manifold → mainline → pump as a coupled network |
| Soil hydraulics | van Genuchten–Mualem retention and conductivity, derived capillary length |
| Crop water demand | FAO-56 crop coefficient curve applied to a daily ET₀ series |
| Scheduling | Capacity-constrained root-zone water balance producing irrigation dates and depths |
| Wetting front | Bulb dimensions, overlap geometry, emitter spacing verdict |
| Fertigation | Dose, injection rate, concentration and timing |

**What it is not.** It is not a numerical solver. Wetting-front dimensions come from an empirical
correlation and a steady-state analytical solution, both of which are screening estimates. Final
geometry must be confirmed with an axisymmetric Richards equation solution. See
[Known limitations](#12-known-limitations) and Manual 2, Section 10.

Everything runs in the browser in JavaScript. There is no server, no database, and no network
traffic once the page has loaded. All computation is client-side and instantaneous.

---

## 2. Prerequisites

**Node.js 20 or newer.** Nothing else.

Check what you have:

```powershell
node -v
npm -v
```

If Node is missing or older than version 20:

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell afterwards so that the `PATH` variable is refreshed. On macOS use
`brew install node`; on Debian or Ubuntu use the NodeSource repository rather than the distribution
package, which is usually too old.

A text editor is useful but not required. VS Code is assumed throughout.

---

## 3. Installation and first run

### 3.1 Unpack

```powershell
cd D:\Projects
Expand-Archive .\drip-design-starter.zip -DestinationPath .
cd drip-design
```

### 3.2 Install dependencies

```powershell
npm install
```

This downloads roughly 120 packages into `node_modules\` and takes about thirty seconds. You never
edit that folder and never commit it. A deprecation warning about Recharts 2.x is informational and
can be ignored.

### 3.3 Run

```powershell
npm run dev
```

The terminal prints a local address, normally `http://localhost:5173`. Open it in a browser.

**That terminal window is the server.** Leave it running while you use the application. Open a
second PowerShell window for `git` or any other command. `Ctrl+C` stops the server.

Any edit you save to `src\DripDesign.jsx` reloads in the browser within about one second.

### 3.4 Put it under version control

Worth doing on the first day, because every design decision you make is a change to a single file.

```powershell
git init
git add .
git commit -m "Drip design workbench, initial version"
```

`.gitignore` already excludes `node_modules\`, `dist\` and `dist-single\`.

---

## 4. Project layout

```
drip-design/
├─ index.html                     entry document
├─ package.json                   dependencies and scripts
├─ package-lock.json              exact resolved versions
├─ vite.config.js                 build configuration
├─ .gitignore
├─ README.md
├─ .github/
│  └─ workflows/
│     └─ deploy.yml               optional GitHub Pages deployment
└─ src/
   ├─ main.jsx                    React entry point
   ├─ index.css                   Tailwind import
   └─ DripDesign.jsx              the entire application
```

**Every equation lives in `src\DripDesign.jsx`.** The other files are scaffolding. If you want to
change the physics, that is the only file you touch.

Its internal order is: constants and soil database → pure physics functions → user-interface
components → the main component, containing state, five `useMemo` computation blocks, and the
rendering. The five computation blocks run in a fixed order and depend on one another:

```
S   soil hydraulics
 └─ H    network hydraulics          (independent of S)
     └─ SCH  daily series and water balance   (needs H.EU, H.appRate, S.awc)
         └─ FX   discharge to flux             (needs S)
             └─ W    wetting front             (needs SCH.designHours, S, Se)
                 └─ F    fertigation           (needs H, SCH)
```

---

## 5. Updating the application

When you receive a revised `DripDesign.jsx`, it replaces the existing file. **The name must be
`DripDesign.jsx`**, because `src\main.jsx` contains `import DripDesign from "./DripDesign.jsx"`.
A file left under its download name will not be found and the page will render blank.

```powershell
Copy-Item "$env:USERPROFILE\Downloads\drip_design_dashboard.jsx" "D:\Projects\drip-design\src\DripDesign.jsx" -Force
```

Type this on **one line**. If you split it with a backtick, the backtick must be the very last
character on the line — a single trailing space breaks it silently.

Locate the download first if the copy fails:

```powershell
Get-ChildItem $env:USERPROFILE\Downloads -Filter *.jsx | Select-Object Name, Length, LastWriteTime
```

Repeated downloads produce `drip_design_dashboard (1).jsx` and similar.

**Always verify the copy landed:**

```powershell
Select-String "D:\Projects\drip-design\src\DripDesign.jsx" -Pattern "Overlap between adjacent bulbs" -Quiet
```

`True` confirms the current version. You can also check visually: the Crop water use tab must show
tiles labelled `Capacity-limited days`, `Stress days` and `Unmet demand`; the Wetting front tab must
show a panel headed `Overlap between adjacent bulbs`.

A File Explorer alternative: open `src`, delete `DripDesign.jsx`, drag the new file in, rename it.
Enable View → Show → File name extensions first, or you will create `DripDesign.jsx.jsx`.

---

## 6. Verification — acceptance test

Run this once after installation and after every update. Open the application and change **nothing**.
All values below are computed from the shipped defaults.

### 6.1 Hydraulics tab

| Field | Expected |
|---|---|
| Emission uniformity | 92.1 % |
| Discharge variation | 10.8 % |
| q min / avg / max | 2.233 / 2.300 / 2.481 L h⁻¹ |
| Lateral inlet head | 11.7 m |
| Manifold inlet head | 12.0 m |
| Lateral fitted exponent | 0.509 |
| Head loss in main | 1.78 m |
| Total dynamic head | 29.5 m |
| Shaft power | 2.38 kW |
| System flow | 20.7 m³ h⁻¹ |
| Application rate | 3.83 mm h⁻¹ |
| Velocities, lateral / manifold / main | 0.79 / 1.73 / 0.68 m s⁻¹ |
| Δh lateral / manifold | 22.1 / 4.3 % |

### 6.2 Crop water use tab

| Field | Expected |
|---|---|
| Design ETc (peak 7-day mean) | 4.42 mm d⁻¹ |
| Season minimum / mean / maximum ETc | 1.38 / 3.06 / 4.43 mm d⁻¹ |
| Season ETc | 459 mm over 150 d |
| Events | 30 |
| Season irrigation | 551 mm gross |
| Deliverable per day | 21.1 mm |
| Longest set | 5.50 h |
| Shortest set | 2.21 h |
| Capacity-limited days | 10 |
| Unmet demand | 9.3 mm |
| Stress days | 0 |

### 6.3 Soil & flux tab (Loam preset)

| Field | Expected |
|---|---|
| θ at field capacity (−100 cm) | 0.2421 |
| θ at wilting point (−15000 cm) | 0.0884 |
| θ initial (−800 cm) | 0.1315 |
| Available water capacity | 0.1537 cm³ cm⁻³ |
| Δθ used | 0.1106 |
| Matric flux potential φ | 172.7 cm² d⁻¹ |
| Capillary length λc | 6.9 cm |
| α effective | 0.1445 cm⁻¹ |
| Applied flux q₀ | 81.3 cm h⁻¹ |
| q₀ / Ks | 78.2 (ponding flagged) |
| Wooding radius r_w | 22.5 cm |

### 6.4 Wetting front tab

| Field | Expected |
|---|---|
| Water per emitter | 12.6 L |
| Width w (Schwartzman–Zur) | 54 cm |
| Depth z (Schwartzman–Zur) | 32 cm |
| Width, mass balance | 72 cm |
| Depth, mass balance | 42 cm |
| Aspect z / (w/2) | 1.19 |
| Wetted fraction P | 36 % |
| Normalised spacing Sₑ/w | 0.743 |
| Lens width | 14 cm |
| Merge depth z_ov | 21 cm |
| Dry wedge | 11 cm |
| Overlap area fraction | 15.0 % |

### 6.5 Expected failures

Four design checks show **red on a fresh install, by design**, so that you can see the checks
working:

| Check | Value | Cause |
|---|---|---|
| Discharge variation ≤ 10 % | 10.8 % | 90 m lateral on 15.2 mm tubing |
| Subunit head variation ≤ 20 % | 26.4 % | same |
| Capacity meets demand daily | 10 days short | 4 blocks in sequence, 21.1 mm/d cap |
| Merge depth ≥ root depth | 21 vs 45 cm | emitter spacing too wide for the bulb |

Change the lateral inside diameter from 15.2 to 17.0 mm and the first two resolve:

| Lateral ID | EU | Δq | Δh | Inlet head |
|---|---|---|---|---|
| 15.2 mm | 92.1 % | 10.8 % | 22.1 % | 11.7 m |
| 17.0 mm | 93.3 % | 6.5 % | 13.1 % | 11.0 m |
| 19.4 mm | 94.0 % | 3.5 % | 7.1 % | 10.5 m |

---

## 7. Interface reference — every input and output

### 7.1 Block geometry (always visible)

| Input | Unit | Default | Meaning |
|---|---|---|---|
| Row / lateral spacing Sr | m | 1.5 | Distance between laterals; also the manifold outlet spacing |
| Leaching fraction LR | % | 10 | Extra water applied for salt leaching |

### 7.2 Emitter (Hydraulics tab)

| Input | Unit | Default | Meaning |
|---|---|---|---|
| Nominal discharge qₙ | L h⁻¹ | 2.3 | Catalogue discharge at nominal head |
| Nominal head hₙ | m | 10 | Head at which qₙ is quoted |
| Exponent x | – | 0.5 | 0.5 orifice, 0.7–0.8 long path, ~0 pressure-compensating |
| Manufacturing CV | – | 0.04 | Coefficient of variation from the catalogue |
| Emitter spacing Sₑ | m | 0.4 | Along the lateral |
| Emitters per plant | – | 1 | Used in the uniformity formula and application rate |

### 7.3 Lateral, manifold, mainline, pump (Hydraulics tab)

| Input | Unit | Default | Notes |
|---|---|---|---|
| Lateral inside diameter | mm | 15.2 | Choose from commercial PE sizes |
| Lateral length | m | 90 | Determines emitter count |
| Lateral slope | % | 0 | Positive = downhill in the flow direction |
| Barb loss factor | – | 1.10 | Multiplier for emitter connection losses, 1.05–1.30 |
| Manifold inside diameter | mm | 65.0 | |
| Laterals served | – | 40 | Total, both sides if the box is ticked |
| Manifold slope | % | 0 | |
| Laterals both sides | – | ticked | Halves the number of manifold outlets |
| Mainline inside diameter | mm | 103.6 | |
| Mainline length | m | 400 | |
| Static lift | m | 8 | Elevation from source to manifold inlet |
| Filter + injector loss | m | 5 | 3 m clean to 7 m dirty is typical |
| Fittings allowance | % | 10 | Applied to the whole head |
| Pump efficiency | % | 70 | Wire-to-water |
| Blocks running at once | – | 1 | Number operating simultaneously |

### 7.4 Season and crop coefficient (Crop water use tab)

| Input | Unit | Default | Notes |
|---|---|---|---|
| Planting date | date | 2026-04-20 | Anchors the series to the calendar |
| L initial / develop / mid / late | d | 30 / 40 / 50 / 30 | FAO-56 stage lengths; sum = season length |
| Kc ini / mid / end | – | 0.5 / 1.15 / 0.8 | FAO-56 crop coefficients |

### 7.5 ETc source (Crop water use tab)

| Input | Options | Notes |
|---|---|---|
| Method | Monthly ET₀ × Kc / Paste daily ET₀ / Paste daily ETc | |
| Climate preset | Temperate NW Europe, Mediterranean, Semi-arid, Arid hot desert, Arid advective | Loads the monthly grid; peak ETc 4.4 to 16.3 mm d⁻¹ |
| Monthly mean ET₀ | mm d⁻¹ | Twelve values, interpolated to daily |
| Pasted series | one value per line, or `date,value` | Accepts comma, semicolon or tab |
| Effective rainfall | mm month⁻¹ | Twelve values, spread evenly across each month |

### 7.6 Root zone and management (Crop water use tab)

| Input | Unit | Default | Notes |
|---|---|---|---|
| Zr at planting | m | 0.15 | |
| Zr maximum | m | 0.45 | Reached at the end of the development stage |
| Depletion fraction p | – | 0.4 | FAO-56 table value before adjustment |
| Managed wetted fraction f_w | – | 0.5 | Fraction of the root zone actually wetted; **match to P** |
| Initial depletion | mm | 0 | Soil water status at planting |
| Blocks in system | – | 4 | Total; combined with "running at once" gives the shift count |
| Max operating hours | h d⁻¹ | 22 | Set to 19 to build in a maintenance reserve |
| Min practical set | h | 0.5 | Below this, fill and drain transients dominate |
| Design ETc rule | Peak 7-day mean / Peak month mean / 95th percentile / Season maximum / Manual | | |

### 7.7 Soil (Soil & flux and Wetting front tabs)

| Input | Unit | Default (Loam) | Notes |
|---|---|---|---|
| Texture preset | – | Loam | Twelve Carsel & Parrish classes plus **Custom** |
| θr | cm³ cm⁻³ | 0.078 | Residual water content |
| θs | cm³ cm⁻³ | 0.430 | Saturated water content |
| α | cm⁻¹ | 0.036 | Inverse air-entry value |
| n | – | 1.56 | Pore-size distribution index |
| l | – | 0.5 | Mualem pore-connectivity parameter |
| Ks | cm d⁻¹ | 24.96 | Saturated hydraulic conductivity |

Select **Custom** for engineered substrates — wood fibre, peat, mixes — which are not in the
Carsel & Parrish table.

### 7.8 Source and initial state

| Input | Unit | Default | Notes |
|---|---|---|---|
| Source radius r₀ | cm | 3 | Assumed radius of the wetted disc at the surface |
| Initial head hᵢ | cm | −800 | Sets θᵢ through the retention curve |
| Head at field capacity | cm | −100 | −60 to −100 for coarse soils, −330 for fine |
| Pulses per event | – | 1 | Splits the set into equal cycles |

### 7.9 Fertigation

| Input | Unit | Default | Notes |
|---|---|---|---|
| N rate per event | kg ha⁻¹ | 30 | |
| N content of product | % | 13 | e.g. calcium nitrate ≈ 15.5 %, urea 46 % |
| Stock solution | g L⁻¹ | 200 | Concentration in the injection tank |

---

## 8. Recommended design workflow

The tabs are **not independent**. Work in this order.

### Step 1 — Soil & flux

Choose a texture or enter your own six van Genuchten–Mualem parameters. Check that the retention
and conductivity curves look like the material you have. Set r₀ and read the flux conversion.

If q₀ > Ks the panel flags ponding and returns the Wooding radius r_w instead. Use r_w rather than
your assumed r₀ from that point on.

### Step 2 — Crop water use

Enter the season, the Kc stages, and the ET₀ series. Set p and f_w. Choose the design ETc rule.
Read the capacity envelope table to see which levels of demand the current design can meet.

### Step 3 — Hydraulics

Size the network working **outward from the emitter**: emitter, then lateral, then manifold, then
main. Each level's inlet pressure is the next level's outlet demand. Clear all eight design checks.

### Step 4 — Wetting front

Confirm the bulb from the largest scheduled event. Check the merge depth against the root depth and
the overlap area fraction.

### Step 5 — Fertigation

Dose and injection window, based on the design event duration.

### The three loops you must close manually

These are genuine circular dependencies. The tool exposes them rather than hiding them.

1. **f_w ↔ P.** The water balance needs the managed wetted fraction; the bulb calculation produces
   it. Set f_w on the Crop water use tab, read P on the Wetting front tab, adjust f_w to match.
   Two iterations normally converge. The Crop water use tab prints the current P as a reminder.

2. **EU ↔ set duration ↔ bulb.** Emission uniformity comes from the hydraulic solve and feeds the
   gross depth, which sets the set duration, which sets the bulb dimensions. **Changing a pipe
   diameter moves the irrigation calendar and the wetting front.** Re-check both after any
   hydraulic change.

3. **Sₑ ↔ w ↔ P.** Emitter spacing changes the overlap, which changes the wetted fraction, which
   feeds back into the balance through f_w.

---

## 9. Worked example

Design a block for a 150-day vegetable crop, loam, temperate climate.

**1.** Soil & flux → preset Loam. Read λc = 6.9 cm, so a moderately narrow bulb. r₀ = 3 cm gives
q₀ = 81.3 cm h⁻¹ against Ks = 1.04 cm h⁻¹ → ponding. Note r_w = 22.5 cm.

**2.** Crop water use → planting 20 April, stages 30/40/50/30, Kc 0.5/1.15/0.8, temperate preset.
Design ETc (peak 7-day) = 4.42 mm d⁻¹. Envelope table shows every demand level feasible in hours,
but the deliverable cap is 21.1 mm per block per day.

**3.** Hydraulics → 2.3 L h⁻¹ emitters at 0.4 m on 15.2 mm lateral, 90 m long. Δq = 10.8 % fails.
Change to 17.0 mm → Δq = 6.5 %, EU = 93.3 %. TDH ≈ 29 m, 2.4 kW.

**4.** Back to Crop water use → 10 capacity-limited days remain, 9.3 mm unmet, 0 stress days.
Acceptable (1.7 % of the season), or eliminate by running 2 blocks at once, which halves the shift
count and doubles the daily cap.

**5.** Wetting front → w = 54 cm, z = 32 cm. Merge depth 21 cm against a 45 cm root zone: an 11 cm
dry wedge. Close Sₑ to 0.31 m to join at 35 cm, or accept that z itself is the binding constraint
and lengthen the set.

**6.** P = 36 %. Return to Crop water use and set f_w = 0.36 rather than 0.50. Re-read the
schedule. Iterate once more.

---

## 10. Distribution to other users

| Recipient | You run | They receive |
|---|---|---|
| Supervisor, examiner, reviewer | `npm run build:single` | One self-contained HTML file |
| Research group, course, collaborator | `npm run build` then deploy `dist/` | A web address |
| Field or office staff | `npx tauri build` | A native installer |

### 10.1 Single file

```powershell
npm run build:single
```

Produces `dist-single\index.html`, about 580 kB, with React, Recharts, Tailwind and all your physics
inlined. The recipient saves the attachment and double-clicks it. No installation, works offline,
works from a USB stick. This is the correct choice for a thesis appendix or supplementary material.

### 10.2 Static web site

```powershell
npm run build
```

Produces `dist\`. Because `base` is set to `"./"` it works from any subfolder.

- **Netlify or Cloudflare Pages** — drag the `dist` folder onto their deploy page.
- **GitHub Pages** — push the repository, then in Settings → Pages set the source to
  **GitHub Actions**. The workflow at `.github/workflows/deploy.yml` handles the rest.
- **University web space** — copy the contents of `dist\` by SFTP.

### 10.3 Desktop installer

| Option | Installer size | Requires |
|---|---|---|
| Tauri 2 | ~8 MB | Rust toolchain |
| Electron | ~120 MB | Node only |

```powershell
npm install -D @tauri-apps/cli
npx tauri init          # frontendDist ../dist, devUrl http://localhost:5173
npx tauri build
```

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `'npm' is not recognized` | Node absent or PATH stale | Install Node, open a new terminal |
| `npm.ps1 cannot be loaded … execution policy` | PowerShell script policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or call `npm.cmd` |
| `vite: not found` | `node_modules` missing | `npm install` |
| Port 5173 in use | Another server running | `npm run dev -- --port 5174` |
| Install hangs | Proxy | `npm config set proxy http://host:port` and the same for `https-proxy` |
| Blank page after update | File named wrongly | Must be exactly `src\DripDesign.jsx` |
| Blank page opening `dist\index.html` directly | ES modules blocked over `file://` | `npm run preview`, or use `build:single` |
| Charts empty | An input was cleared and is `NaN` | Retype a number; blank is not zero |
| A value changed on its own | Mouse wheel over a focused number field | Fixed in the current version; confirm you have it |
| Numbers differ from the acceptance test | Running an older file, or an input was edited | Re-copy `DripDesign.jsx` and reload |
| No irrigation events | TAW too large, or rainfall covers demand | Reduce f_w, check the rainfall grid |
| Recharts deprecation warning | Informational | Ignore |

**Diagnosing a value that does not match the acceptance test.** The tiles are interdependent, so one
changed input moves several. Work backwards: Crop water use tiles depend on `S.awc`, `H.EU`,
`H.appRate`, f_w, p, Zr and the ET₀ grid. Reload the page to reset every input to its default before
concluding that the build is wrong.

---

## 12. Known limitations

State these wherever the tool is published.

1. **Schwartzman & Zur (1986) is empirical**, fitted on mineral field soils. On wood fibre, peat or
   engineered substrates the coefficients are very likely wrong, even though the van Genuchten
   parameters are yours. Treat the mass-balance bulb as the cross-check; a divergence beyond about
   20 % means Δθ or Ks needs attention.

2. **Wooding (1968) is a steady-state solution.** For a set of a few hours the source has not
   reached equilibrium, so r_w is an upper bound. The defensible approach is to run the numerical
   model with two bounding cases — a small observed r₀ and the steady r_w — rather than trusting
   either alone.

3. **The pulsing adjustment is heuristic**, not taken from a published correlation. See Manual 2,
   Section 8.6.

4. **TAW is multiplied by f_w** to represent the partially wetted root zone. This is an adaptation
   of FAO-56, not a formula from it.

5. **Friction losses assume water at 20 °C** (ν = 1.003 × 10⁻⁶ m² s⁻¹).

6. **Uniformity is steady-state.** Fill and drain transients are not modelled; this is why the
   minimum set duration check exists.

7. **The soil is treated as homogeneous and isotropic.** No layering, no hysteresis, no preferential
   flow, no shrink–swell.

8. **Everything runs in a browser**, which caps the tool at a calculator. Optimisation over the
   discrete diameter set, or a real Richards solution for the bulb, requires moving the core to
   Python. The flux panel already produces the boundary condition in the units that step needs.
