# Drip Irrigation Design Workbench

Interactive design tool for surface drip systems.

- **Hydraulics** — stepwise emitter-by-emitter network solution (laterals, manifold,
  main, pump), Darcy–Weisbach with laminar/Blasius/Swamee-Jain regime switching.
  No Christiansen F-factor approximation.
- **Crop water use** — FAO-56 Kc curve, monthly-to-daily ET0 interpolation or a pasted
  daily series, root-zone depletion balance producing the irrigation calendar.
- **Soil & flux** — editable van Genuchten–Mualem parameters (θr, θs, α, n, l, Ks),
  retention and conductivity curves, emitter discharge converted to a surface flux
  boundary condition with a ponding test against Ks.
- **Wetting front** — Schwartzman & Zur bulb geometry cross-checked against mass
  balance, Wooding steady source radius, emitter-spacing overlap verdict.
- **Fertigation** — dose, injection window and the quarter/half/quarter schedule.

## Quick start

```powershell
npm install
npm run dev
```

Full instructions, an acceptance test with reference values, the recommended design
workflow, distribution routes and troubleshooting are in **[USER_MANUAL.md](USER_MANUAL.md)**.

## Build

| Command | Output | Use |
|---|---|---|
| `npm run dev` | dev server on :5173 | Working on it |
| `npm run build` | `dist/` static site | Hosting |
| `npm run build:single` | `dist-single/index.html` | Emailing, offline use |

## Scope

Everything runs client-side in JavaScript. These are screening tools: confirm final
wetting-front geometry with an axisymmetric Richards solution. See Part F of
USER_MANUAL.md for the stated assumptions and the limits of the browser-only design.
