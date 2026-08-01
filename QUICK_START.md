# Quick Start

**Drip Irrigation Design Workbench** — how to open and use the tool.

---

## Open it

Go to **https://drip-design-osnabrueck.netlify.app**

That is all. It runs in any browser on a computer, tablet or phone. Nothing to
install, no account, no login.

Bookmark the page for repeat use. In Chrome or Edge you can also install it as an
app: **⋮ menu → Cast, save and share → Install page as app**. It then opens in its
own window with a desktop icon.

### Working offline

The tool needs no internet once the page has loaded, so it keeps working if you lose
connection mid-session. To have a permanent offline copy, open the page, then use
**Ctrl+S** and save the complete page to your computer.

---

## What it does

Five linked calculations for surface drip irrigation:

| Tab | Purpose |
|---|---|
| **Hydraulics** | Sizes emitters, laterals, manifold, mainline and pump. Reports emission uniformity, pressures, velocities and power |
| **Crop water use** | Daily crop demand from a climate series, and the resulting irrigation calendar |
| **Soil & flux** | Soil water retention and conductivity; converts emitter discharge to a surface flux |
| **Wetting front** | Bulb width and depth, and the overlap between neighbouring emitters |
| **Fertigation** | Fertiliser dose, injection rate and timing |

---

## Use it in this order

The tabs depend on one another. Working out of order will waste your time.

### 1. Soil & flux

Choose a soil texture from the preset list, or enter your own values for θr, θs, α,
n, l and Ks. **Every other tab derives from these six numbers**, so start here.

Set the source radius and read the flux conversion. If the tool reports ponding, use
the Wooding radius it gives you rather than your assumed value.

### 2. Crop water use

Enter the planting date, the four crop stage lengths and the crop coefficients.
Choose a climate preset or paste your own daily series.

Set the depletion fraction and the managed wetted fraction, then read the capacity
envelope table. It shows whether the system can meet each level of demand within the
available operating hours.

### 3. Hydraulics

Size the network **outward from the emitter**: emitter first, then lateral, then
manifold, then mainline. Each level's inlet pressure is the next level's demand.

Aim to clear every design check at the bottom of the tab. Some fail on the default
values deliberately, so you can see the checks working.

### 4. Wetting front

Check the bulb width and depth, and whether neighbouring bulbs merge deeply enough to
wet the whole root zone.

### 5. Fertigation

Enter the nutrient rate and stock concentration to get the injection rate and
schedule.

---

## Two things to iterate

These are genuine circular dependencies, not faults.

1. **Wetted fraction.** The water balance needs a managed wetted fraction; the bulb
   calculation produces one. Set it on the Crop water use tab, read the resulting
   value on the Wetting front tab, and adjust until they agree. Two rounds is usually
   enough.

2. **Uniformity.** Changing a pipe diameter changes emission uniformity, which changes
   the application depth, which changes the bulb. Re-check the schedule and the
   wetting front after any hydraulic change.

---

## Saving your work

**The tool does not store anything.** Closing the tab resets every input to its
default. Record your inputs yourself — a screenshot of each tab is the quickest way.

---

## Scope and limits

This is a **screening and design tool**, not a numerical simulator. Wetting-front
dimensions come from an empirical correlation and a steady-state analytical solution.
Both are estimates suitable for design decisions; confirm final geometry with a
numerical solution of the Richards equation where accuracy matters.

The empirical bulb correlation was fitted on mineral field soils. Applied to
engineered substrates such as wood fibre or peat, the results are indicative only.

---

## Contact

**Hadi Hamaaziz Muhammed**
Universität Osnabrück / Hochschule Osnabrück

For the full theoretical documentation, equation set and validation details, please
get in touch.

