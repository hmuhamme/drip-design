import React, { useState, useMemo } from "react";
import {
  LineChart, Line, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

/* ------------------------------------------------------------------ *
 *  DRIP IRRIGATION DESIGN WORKBENCH
 *  Network hydraulics + van Genuchten-Mualem soil + discharge-to-flux
 *  + daily ETc water balance scheduling + wetting front + fertigation.
 * ------------------------------------------------------------------ */

const G = 9.81;
const NU = 1.003e-6;
const EPS_PE = 1.5e-6;

const SOILS = [
  { name: "Sand",            tr: 0.045, ts: 0.430, al: 0.145, n: 2.68, l: 0.5, Ks: 712.8 },
  { name: "Loamy sand",      tr: 0.057, ts: 0.410, al: 0.124, n: 2.28, l: 0.5, Ks: 350.2 },
  { name: "Sandy loam",      tr: 0.065, ts: 0.410, al: 0.075, n: 1.89, l: 0.5, Ks: 106.1 },
  { name: "Loam",            tr: 0.078, ts: 0.430, al: 0.036, n: 1.56, l: 0.5, Ks: 24.96 },
  { name: "Silt loam",       tr: 0.067, ts: 0.450, al: 0.020, n: 1.41, l: 0.5, Ks: 10.80 },
  { name: "Silt",            tr: 0.034, ts: 0.460, al: 0.016, n: 1.37, l: 0.5, Ks: 6.00 },
  { name: "Sandy clay loam", tr: 0.100, ts: 0.390, al: 0.059, n: 1.48, l: 0.5, Ks: 31.44 },
  { name: "Clay loam",       tr: 0.095, ts: 0.410, al: 0.019, n: 1.31, l: 0.5, Ks: 6.24 },
  { name: "Silty clay loam", tr: 0.089, ts: 0.430, al: 0.010, n: 1.23, l: 0.5, Ks: 1.68 },
  { name: "Sandy clay",      tr: 0.100, ts: 0.380, al: 0.027, n: 1.23, l: 0.5, Ks: 2.88 },
  { name: "Silty clay",      tr: 0.070, ts: 0.360, al: 0.005, n: 1.09, l: 0.5, Ks: 0.48 },
  { name: "Clay",            tr: 0.068, ts: 0.380, al: 0.008, n: 1.09, l: 0.5, Ks: 4.80 },
  { name: "Custom",          tr: 0.030, ts: 0.850, al: 0.100, n: 1.60, l: 0.5, Ks: 500.0 },
];

const LATERAL_ID = [12.2, 13.8, 15.2, 17.0, 19.4, 21.8, 25.6];
/* Commercial in-line dripline emitter spacings, m */
const DRIPLINE_SE = [0.10, 0.15, 0.20, 0.25, 0.30, 0.33, 0.40, 0.50, 0.60, 0.75, 1.00];
/* Real dripline products: [emitter spacing m, nominal discharge L/h].
   Discharge per metre of lateral stays in the 4-12 L/h/m band that manufacturers
   actually supply — a close spacing must be paired with a small emitter.        */
const DRIPLINE_PRODUCTS = [
  [0.10, 0.4], [0.10, 0.6], [0.10, 1.0],
  [0.15, 0.6], [0.15, 1.0], [0.15, 1.6],
  [0.20, 1.0], [0.20, 1.6], [0.20, 2.0],
  [0.25, 1.0], [0.25, 1.6], [0.25, 2.0],
  [0.30, 1.6], [0.30, 2.0], [0.30, 2.3],
  [0.33, 1.6], [0.33, 2.0], [0.33, 2.3],
  [0.40, 2.0], [0.40, 2.3], [0.40, 3.0],
  [0.50, 2.3], [0.50, 3.0], [0.50, 4.0],
  [0.60, 2.3], [0.60, 4.0],
  [0.75, 4.0], [1.00, 4.0], [1.00, 8.0],
];
const PIPE_ID = [25.6, 32.6, 40.8, 51.4, 57.0, 65.0, 73.6, 81.4, 92.0, 103.6, 115.4, 130.8, 147.6];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_MID = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/* Monthly mean ET0 [mm/d]. Starting points only — replace with local records. */
const CLIMATES = {
  "Temperate NW Europe": [0.4, 0.8, 1.6, 2.6, 3.5, 3.9, 3.8, 3.3, 2.1, 1.1, 0.5, 0.3],
  "Mediterranean":       [1.2, 1.7, 2.7, 3.9, 5.2, 6.4, 6.9, 6.2, 4.6, 3.0, 1.7, 1.1],
  "Semi-arid":           [1.8, 2.5, 3.8, 5.4, 7.0, 8.3, 8.6, 7.9, 6.2, 4.3, 2.6, 1.7],
  "Arid, hot desert":    [2.6, 3.6, 5.4, 7.6, 9.8, 11.4, 11.8, 10.9, 8.7, 6.2, 3.8, 2.5],
  "Arid, advective":     [3.4, 4.6, 6.8, 9.4, 12.0, 13.8, 14.2, 13.2, 10.6, 7.6, 4.8, 3.2],
};

/* ------------------- van Genuchten - Mualem ------------------- */

const mOf = (n) => 1 - 1 / n;
function seOfH(h, s) {
  if (h >= 0) return 1;
  return Math.pow(1 + Math.pow(s.al * Math.abs(h), s.n), -mOf(s.n));
}
const thetaOfH = (h, s) => s.tr + (s.ts - s.tr) * seOfH(h, s);
function kOfSe(Se, s) {
  if (Se <= 0) return 0;
  if (Se >= 1) return s.Ks;
  const m = mOf(s.n);
  const t = 1 - Math.pow(1 - Math.pow(Se, 1 / m), m);
  return s.Ks * Math.pow(Se, s.l) * t * t;
}
const kOfH = (h, s) => kOfSe(seOfH(h, s), s);

function matricFluxPotential(s) {
  const N = 800, lo = -2, hi = 5;
  let phi = s.Ks * 1e-2;
  for (let i = 0; i < N; i++) {
    const a = Math.pow(10, lo + ((hi - lo) * i) / N);
    const b = Math.pow(10, lo + ((hi - lo) * (i + 1)) / N);
    phi += kOfH(-Math.sqrt(a * b), s) * (b - a);
  }
  return phi;
}

/* ---------------------------- hydraulics --------------------------- */

function frictionFactor(Re, D) {
  if (Re < 1) return 0;
  if (Re < 2000) return 64 / Re;
  if (Re < 1e5) return 0.316 * Math.pow(Re, -0.25);
  const t = Math.log10(EPS_PE / (3.7 * D) + 5.74 / Math.pow(Re, 0.9));
  return 0.25 / (t * t);
}
function headLoss(Q, D, L) {
  if (Q <= 0 || D <= 0) return 0;
  const V = Q / ((Math.PI * D * D) / 4);
  return frictionFactor((V * D) / NU, D) * (L / D) * (V * V) / (2 * G);
}
const velocity = (Q, D) => (D <= 0 ? 0 : Q / ((Math.PI * D * D) / 4));

function marchLateral(hEnd, p) {
  const heads = new Array(p.N), flows = new Array(p.N);
  let h = hEnd, Q = 0;
  for (let i = p.N - 1; i >= 0; i--) {
    const q = (p.k * Math.pow(Math.max(h, 1e-4), p.x)) / 3.6e6;
    heads[i] = h; flows[i] = q; Q += q;
    h = h + p.kl * headLoss(Q, p.D, p.S) - p.S * p.slope;
    if (h < 0.05) h = 0.05;
  }
  return { hIn: h, Q, heads, flows };
}
function bisect(fn, target, lo, hi, iters = 70) {
  let a = lo, b = hi;
  for (let i = 0; i < iters; i++) {
    const m = 0.5 * (a + b);
    if (fn(m) < target) a = m; else b = m;
  }
  return 0.5 * (a + b);
}

/* --------------------------- wetting front ------------------------- */

function bulbSZ(V, q, Ks) {
  if (V <= 0 || q <= 0 || Ks <= 0) return { w: 0, z: 0 };
  return {
    w: 1.82 * Math.pow(V, 0.22) * Math.pow(q / Ks, 0.17),
    z: 2.54 * Math.pow(V, 0.63) * Math.pow(Ks / q, 0.45),
  };
}
function woodingRadius(Q, Ks, alpha) {
  if (Q <= 0 || Ks <= 0 || alpha <= 0) return 0;
  let r = 1;
  for (let i = 0; i < 80; i++) {
    const F = Math.PI * r * r * Ks * (1 + 4 / (Math.PI * alpha * r)) - Q;
    const dF = 2 * Math.PI * r * Ks + (4 * Ks) / alpha;
    const rn = r - F / dF;
    r = rn > 1e-4 ? rn : 1e-4;
  }
  return r;
}

/* ----------------------- climate / crop series --------------------- */

/** Linear interpolation of monthly means to a day of year (wraps at Dec/Jan). */
function monthlyToDaily(vals, doy) {
  let i = 0;
  while (i < 12 && MONTH_MID[i] <= doy) i++;
  const i1 = i % 12, i0 = (i + 11) % 12;
  const d0 = i === 0 ? MONTH_MID[11] - 365 : MONTH_MID[i0];
  const d1 = i === 12 ? MONTH_MID[0] + 365 : MONTH_MID[i1];
  const f = (doy - d0) / (d1 - d0);
  return vals[i0] + f * (vals[i1] - vals[i0]);
}

/** FAO-56 four-stage crop coefficient curve. t = days after planting. */
function kcAt(t, k) {
  if (t < k.Lini) return k.Kci;
  if (t < k.Lini + k.Ldev) return k.Kci + ((k.Kcm - k.Kci) * (t - k.Lini)) / Math.max(1, k.Ldev);
  if (t < k.Lini + k.Ldev + k.Lmid) return k.Kcm;
  const tt = t - (k.Lini + k.Ldev + k.Lmid);
  return k.Kcm + (k.Kce - k.Kcm) * Math.min(1, tt / Math.max(1, k.Llate));
}

/** Root depth grows linearly to its maximum by the end of development. */
function zrAt(t, k, zMin, zMax) {
  return zMin + (zMax - zMin) * Math.min(1, t / Math.max(1, k.Lini + k.Ldev));
}

/** Accepts one value per line, or "date,value" / "date;value" / "date<tab>value". */
function parseSeries(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]+/);
    const v = parseFloat(parts[parts.length - 1]);
    if (isFinite(v)) out.push(v);
  }
  return out;
}

const doyOf = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i];
};

/* ------------------------------ UI bits ---------------------------- */

const fmt = (v, d = 2) =>
  !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const sci = (v, d = 2) => (!isFinite(v) || v === 0 ? "—" : v.toExponential(d));

function Field({ label, unit, value, onChange, step = 1, min }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs leading-tight text-slate-600">
        {label} {unit && <span className="text-slate-400">[{unit}]</span>}
      </span>
      <input type="number" step={step} min={min} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onWheel={(e) => e.currentTarget.blur()}
        className="w-24 shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-right font-mono text-xs text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" />
    </label>
  );
}
function Select({ label, value, onChange, options, render, wide }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs leading-tight text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`${wide ? "w-40" : "w-28"} shrink-0 rounded border border-slate-300 bg-white px-1 py-1 text-right font-mono text-xs text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600`}>
        {options.map((o) => <option key={o} value={o}>{render ? render(o) : o}</option>)}
      </select>
    </label>
  );
}
function Panel({ title, children, tone = "slate" }) {
  const bar = tone === "soil" ? "bg-amber-700" : tone === "water" ? "bg-cyan-700" : "bg-slate-700";
  return (
    <section className="rounded border border-slate-300 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <span className={`h-3 w-1 ${bar}`} />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-700">{title}</h3>
      </div>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}
function Stat({ label, value, unit, status }) {
  const ring =
    status === "fail" ? "border-red-300 bg-red-50" :
    status === "warn" ? "border-amber-300 bg-amber-50" :
    status === "ok" ? "border-emerald-300 bg-emerald-50" :
    "border-slate-200 bg-slate-50";
  return (
    <div className={`rounded border px-3 py-2 ${ring}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-lg leading-tight text-slate-900">
        {value}<span className="ml-1 text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}
function Check({ pass, children }) {
  return (
    <div className="flex items-start gap-2 py-1 text-xs">
      <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${pass ? "bg-emerald-600" : "bg-red-600"}`} />
      <span className={pass ? "text-slate-600" : "text-red-700"}>{children}</span>
    </div>
  );
}
function Row({ k, v, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <span className="text-xs text-slate-600">{k}</span>
      <span className="text-right">
        <span className="font-mono text-xs text-slate-900">{v}</span>
        {hint && <span className="ml-1 text-[10px] text-slate-400">{hint}</span>}
      </span>
    </div>
  );
}
/** 12-cell month grid for monthly climate normals. */
function MonthGrid({ values, onChange, step = 0.1 }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {values.map((v, i) => (
        <label key={i} className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-slate-400">{MONTHS[i]}</span>
          <input type="number" step={step} value={v}
            onChange={(e) => { const a = [...values]; a[i] = parseFloat(e.target.value) || 0; onChange(a); }}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-right font-mono text-[11px] focus:border-cyan-600 focus:outline-none" />
        </label>
      ))}
    </div>
  );
}

/* ------------------------------- app ------------------------------- */

export default function DripDesign() {
  const [tab, setTab] = useState("hyd");

  // block geometry
  const [Sr, setSr] = useState(1.5);
  const [LR, setLR] = useState(10);

  // crop / climate
  const [et0Monthly, setEt0Monthly] = useState([0.4, 0.8, 1.6, 2.6, 3.5, 3.9, 3.8, 3.3, 2.1, 1.1, 0.5, 0.3]);
  const [rainMonthly, setRainMonthly] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [startDate, setStartDate] = useState("2026-04-20");
  const [kc, setKc] = useState({ Lini: 30, Ldev: 40, Lmid: 50, Llate: 30, Kci: 0.5, Kcm: 1.15, Kce: 0.8 });
  const setKcKey = (k) => (v) => setKc((s) => ({ ...s, [k]: v }));
  const [srcMode, setSrcMode] = useState("gen");     // gen | et0 | etc
  const [pasted, setPasted] = useState("");
  const [designRule, setDesignRule] = useState("p7");
  const [ETcManual, setETcManual] = useState(6.0);

  // root zone / management
  const [zrMin, setZrMin] = useState(0.15);
  const [rootD, setRootD] = useState(0.45);
  const [pDep, setPDep] = useState(0.4);
  const [adjustP, setAdjustP] = useState(true);
  const [schedMode, setSchedMode] = useState("depletion");
  const [fixedInterval, setFixedInterval] = useState(2);
  const [pulsesPerDay, setPulsesPerDay] = useState(1);
  const [refillTarget, setRefillTarget] = useState(100);
  const [fwMan, setFwMan] = useState(0.5);
  const [drInit, setDrInit] = useState(0);
  const [nBlocksTotal, setNBlocksTotal] = useState(4);
  const [maxHoursDay, setMaxHoursDay] = useState(22);
  const [minSetHours, setMinSetHours] = useState(0.5);
  const [climate, setClimate] = useState("Temperate NW Europe");

  // emitter
  const [qn, setQn] = useState(2.3);
  const [hn, setHn] = useState(10);
  const [xExp, setXExp] = useState(0.5);
  const [CV, setCV] = useState(0.04);
  const [Se, setSe] = useState(0.4);
  const [nEmit, setNEmit] = useState(1);

  // network
  const [Dlat, setDlat] = useState(15.2);
  const [Llat, setLlat] = useState(90);
  const [slopeLat, setSlopeLat] = useState(0);
  const [klocal, setKlocal] = useState(1.1);
  const [Dman, setDman] = useState(65.0);
  const [nLat, setNLat] = useState(40);
  const [bothSides, setBothSides] = useState(true);
  const [slopeMan, setSlopeMan] = useState(0);
  const [Dmain, setDmain] = useState(103.6);
  const [Lmain, setLmain] = useState(400);
  const [zLift, setZLift] = useState(8);
  const [hFilter, setHFilter] = useState(5);
  const [minorPct, setMinorPct] = useState(10);
  const [pumpEff, setPumpEff] = useState(70);
  const [nBlocks, setNBlocks] = useState(1);

  // soil
  const [preset, setPreset] = useState(3);
  const [soil, setSoil] = useState({ ...SOILS[3] });
  const setSoilKey = (key) => (v) => setSoil((s) => ({ ...s, [key]: v }));
  const applyPreset = (i) => { setPreset(+i); setSoil({ ...SOILS[+i] }); };

  // source / state
  const [r0, setR0] = useState(3.0);
  const [hInit, setHInit] = useState(-800);
  const [hFC, setHFC] = useState(-100);
  const [hWet, setHWet] = useState(-20);
  const [nPulse, setNPulse] = useState(1);
  const [ovTarget, setOvTarget] = useState(25);
  const [ovMode, setOvMode] = useState("area");
  const [plantSp, setPlantSp] = useState(0.4);

  // fertigation
  const [nRate, setNRate] = useState(30);
  const [fertN, setFertN] = useState(13);
  const [tankConc, setTankConc] = useState(200);

  /* -------------------- soil derived -------------------- */
  const S = useMemo(() => {
    const Ks_cmh = soil.Ks / 24, Ks_mh = soil.Ks / 100 / 24;
    const phi = matricFluxPotential(soil);
    const lambdaC = phi / soil.Ks;
    const thI = thetaOfH(hInit, soil);
    const thFC = thetaOfH(hFC, soil);
    const thWP = thetaOfH(-15000, soil);
    const thWet = thetaOfH(hWet, soil);
    // water content change INSIDE the bulb: near an emitter the soil approaches
    // saturation, so theta_FC is the wrong reference for coarse materials.
    const dThetaBulb = Math.max(0.005, thWet - thI);
    const curve = [];
    for (let i = 0; i <= 120; i++) {
      const ah = Math.pow(10, i / 24);
      curve.push({ ah: +ah.toFixed(4), th: +thetaOfH(-ah, soil).toFixed(4), K: Math.max(kOfH(-ah, soil), 1e-14) });
    }
    return {
      m: mOf(soil.n), Ks_cmh, Ks_mh, phi, lambdaC, alphaEff: 1 / lambdaC,
      thI, thFC, thWP, thWet, dThetaBulb,
      dTheta: Math.max(0.01, thFC - thI), awc: Math.max(0.01, thFC - thWP), curve,
    };
  }, [soil, hInit, hFC, hWet]);

  /* -------------------- hydraulic solve -------------------- */
  const H = useMemo(() => {
    const N = Math.max(1, Math.round(Llat / Se));
    const k = qn / Math.pow(hn, xExp);
    const p = { N, S: Se, D: Dlat / 1000, slope: slopeLat / 100, k, x: xExp, kl: klocal };
    const lat = marchLateral(bisect((he) => (marchLateral(he, p).Q / N) * 3.6e6, qn, 0.05, 400), p);

    const qs = lat.flows.map((v) => v * 3.6e6);
    const qmin = Math.min(...qs), qmax = Math.max(...qs);
    const qavg = qs.reduce((a, b) => a + b, 0) / N;
    const hmin = Math.min(...lat.heads), hmax = Math.max(...lat.heads);
    const EU = 100 * (1 - (1.27 * CV) / Math.sqrt(Math.max(1, nEmit))) * (qmin / qavg);
    const dq = (100 * (qmax - qmin)) / qavg;
    const dh = (100 * (hmax - hmin)) / hn;

    const r2 = marchLateral(bisect((he) => marchLateral(he, p).hIn, lat.hIn * 1.25, 0.05, 400), p);
    const xl = Math.log(r2.Q / lat.Q) / Math.log(1.25);
    const Kl = lat.Q / Math.pow(lat.hIn, xl);
    const mult = bothSides ? 2 : 1;

    const Nm = Math.max(1, Math.round(nLat / mult));
    const pm = { N: Nm, S: Sr, D: Dman / 1000, slope: slopeMan / 100, k: Kl * mult * 3.6e6, x: xl, kl: 1.03 };
    const man = marchLateral(bisect((he) => (marchLateral(he, pm).Q / Nm) * 3.6e6, mult * lat.Q * 3.6e6, 0.05, 500), pm);
    const dhMan = (100 * (Math.max(...man.heads) - Math.min(...man.heads))) / hn;

    const Qsys = man.Q * nBlocks;
    const hfMain = headLoss(Qsys, Dmain / 1000, Lmain);
    const TDH = (man.hIn + hfMain + zLift + hFilter) * (1 + minorPct / 100);

    return {
      N, lat, qmin, qmax, qavg, hmin, hmax, EU, dq, dh, xl, man, dhMan, Nm, Qsys, hfMain, TDH,
      vLat: velocity(lat.Q, Dlat / 1000), vMan: velocity(man.Q, Dman / 1000), vMain: velocity(Qsys, Dmain / 1000),
      kW: (9.81 * Qsys * TDH) / (pumpEff / 100),
      appRate: (qn * nEmit) / (Se * Sr), mult,
      profile: lat.heads.map((h, i) => ({ x: +((i + 1) * Se).toFixed(2), h: +h.toFixed(2), q: +qs[i].toFixed(3) })),
      profileMan: man.heads.map((h, i) => ({ x: +((i + 1) * Sr).toFixed(2), h: +h.toFixed(2), q: +((man.flows[i] * 3.6e6) / 1000).toFixed(3) })),
    };
  }, [Llat, Se, qn, hn, xExp, Dlat, slopeLat, klocal, CV, nEmit, Sr, nLat, bothSides,
      Dman, slopeMan, Dmain, Lmain, nBlocks, zLift, hFilter, minorPct, pumpEff]);

  /* -------------------- daily series + water balance -------------------- */
  const SCH = useMemo(() => {
    const start = new Date(startDate + "T00:00:00");
    const paste = srcMode === "gen" ? [] : parseSeries(pasted);
    const seasonLen = kc.Lini + kc.Ldev + kc.Lmid + kc.Llate;
    const nDays = srcMode === "gen" ? Math.max(1, Math.round(seasonLen)) : Math.max(1, paste.length);

    const eff = (EU) => (EU / 100) * (1 - LR / 100);
    const effy = eff(H.EU);

    // deliverable capacity: each block gets maxHoursDay / shifts hours per day
    const shifts = Math.max(1, Math.ceil(nBlocksTotal / Math.max(1, nBlocks)));
    const hoursPerBlock = maxHoursDay / shifts;
    const maxGrossPerDay = H.appRate * hoursPerBlock;

    const daily = [];
    let Dr = drInit;
    const events = [];
    let limitedDays = 0, stressDays = 0, deficitTot = 0, maxDr = 0;
    let etcSince = 0;

    for (let t = 0; t < nDays; t++) {
      const date = new Date(start.getTime() + t * 86400000);
      const doy = doyOf(date);
      const kcT = kcAt(t, kc);

      let etc;
      if (srcMode === "etc") etc = paste[t] ?? 0;
      else if (srcMode === "et0") etc = (paste[t] ?? 0) * kcT;
      else etc = monthlyToDaily(et0Monthly, doy) * kcT;
      etc = Math.max(0, etc);

      const rainDay = monthlyToDaily(rainMonthly.map((v) => v / 30.4), doy);

      const Zr = zrAt(t, kc, zrMin, rootD);
      const TAW = 1000 * S.awc * Zr * fwMan;
      const pAdj = adjustP
        ? Math.min(0.8, Math.max(0.1, pDep + 0.04 * (5 - etc)))
        : pDep;
      const RAW = pAdj * TAW;

      Dr = Dr + etc - rainDay;
      if (Dr < 0) Dr = 0;
      etcSince += Math.max(etc - rainDay, 0);

      let irrGross = 0, irrHours = 0, limited = false;

      /* Three scheduling philosophies. All share the same balance; they differ
         only in WHEN an event fires and HOW MUCH is applied.                  */
      let fire = false, required = 0;
      if (schedMode === "depletion") {
        // FAO-56: wait until depletion reaches readily available water
        fire = Dr >= RAW && RAW > 0;
        required = (Dr * (refillTarget / 100)) / Math.max(effy, 0.01);
      } else if (schedMode === "fixed") {
        // drip practice: fixed interval, replace what the crop used
        fire = t % Math.max(1, Math.round(fixedInterval)) === 0 && t > 0;
        if (fire) {
          const used = etcSince > 0 ? etcSince : etc * fixedInterval;
          required = (used * (refillTarget / 100)) / Math.max(effy, 0.01);
        }
      } else {
        // daily: replace yesterday's use every day
        fire = true;
        required = (Math.max(etc - rainDay, 0) * (refillTarget / 100)) / Math.max(effy, 0.01);
      }

      if (fire && required > 0) {
        const perDay = maxGrossPerDay * Math.max(1, pulsesPerDay);
        irrGross = Math.min(required, perDay);
        limited = irrGross < required - 1e-9;
        irrHours = irrGross / Math.max(H.appRate, 1e-6);
        Dr = Math.max(0, Dr - irrGross * effy);
        events.push({
          t, date: date.toISOString().slice(0, 10), net: +(irrGross * effy).toFixed(1),
          gross: +irrGross.toFixed(1), hours: +irrHours.toFixed(2), Zr: +Zr.toFixed(2), limited,
          perPulse: +(irrHours / Math.max(1, pulsesPerDay)).toFixed(2),
        });
        if (limited) { limitedDays++; deficitTot += required - irrGross; }
        etcSince = 0;
      }
      if (Dr > TAW) Dr = TAW;
      if (Dr > RAW) stressDays++;
      if (Dr > maxDr) maxDr = Dr;

      daily.push({
        d: t + 1, date: date.toISOString().slice(0, 10), kc: +kcT.toFixed(3),
        etc: +etc.toFixed(2), rain: +rainDay.toFixed(2), irr: +irrGross.toFixed(1),
        Dr: +Dr.toFixed(1), RAW: +RAW.toFixed(1), TAW: +TAW.toFixed(1), Zr: +Zr.toFixed(3),
        pAdj: +pAdj.toFixed(3),
      });
    }

    const etcArr = daily.map((r) => r.etc);
    const etcMax = etcArr.length ? Math.max(...etcArr) : 0;
    const posArr = etcArr.filter((v) => v > 0.01);
    const etcMin = posArr.length ? Math.min(...posArr) : 0;
    const etcMean = etcArr.length ? etcArr.reduce((a, b) => a + b, 0) / etcArr.length : 0;
    const etcP95 = pct(etcArr, 95);
    let peak7 = 0;
    for (let i = 0; i + 7 <= etcArr.length; i++) {
      const s = etcArr.slice(i, i + 7).reduce((a, b) => a + b, 0) / 7;
      if (s > peak7) peak7 = s;
    }
    const byMonth = {};
    daily.forEach((r) => { const m = r.date.slice(0, 7); (byMonth[m] = byMonth[m] || []).push(r.etc); });
    const peakMonth = Math.max(...Object.values(byMonth).map((a) => a.reduce((x, y) => x + y, 0) / a.length), 0);

    const ETcDesign =
      designRule === "max" ? etcMax :
      designRule === "p95" ? etcP95 :
      designRule === "pm" ? peakMonth :
      designRule === "p7" ? peak7 : ETcManual;

    const totETc = etcArr.reduce((a, b) => a + b, 0);
    const totRain = daily.reduce((a, r) => a + r.rain, 0);
    const totGross = events.reduce((a, e) => a + e.gross, 0);
    const totNet = events.reduce((a, e) => a + e.net, 0);
    const designGross = events.length ? Math.max(...events.map((e) => e.gross)) : 0;
    const designHours = events.length ? Math.max(...events.map((e) => e.hours)) : 0;
    const minHours = events.length ? Math.min(...events.map((e) => e.hours)) : 0;
    const meanInterval = events.length > 1
      ? (events[events.length - 1].t - events[0].t) / (events.length - 1) : NaN;

    // hours per day the whole system must run to meet a given ETc
    const hoursFor = (e) => (e / Math.max(effy, 0.01) / Math.max(H.appRate, 1e-6)) * shifts;
    // application rate, and hence emitter discharge, needed to make an ETc feasible
    const rateFor = (e) => e / Math.max(effy, 0.01) / Math.max(hoursPerBlock, 1e-6);
    const emitterFor = (e) => (rateFor(e) * Se * Sr) / Math.max(nEmit, 1);

    const envelope = [
      { k: "Season minimum", v: etcMin }, { k: "Season mean", v: etcMean },
      { k: "Peak 7-day mean", v: peak7 }, { k: "Peak month mean", v: peakMonth },
      { k: "95th percentile", v: etcP95 }, { k: "Season maximum", v: etcMax },
    ].map((r) => ({ ...r, h: hoursFor(r.v), ok: hoursFor(r.v) <= maxHoursDay }));

    const peakDailyGross = ETcDesign / Math.max(effy, 0.01);
    const hoursPerDayPeak = hoursFor(ETcDesign);

    return {
      daily, events, nDays, etcMax, etcMin, etcMean, etcP95, peak7, peakMonth, ETcDesign,
      totETc, totRain, totGross, totNet, designGross, designHours, minHours, meanInterval,
      shifts, hoursPerBlock, maxGrossPerDay, hoursPerDayPeak, effy, seasonLen,
      limitedDays, stressDays, deficitTot, maxDr, envelope,
      schedMode, fixedInterval, pulsesPerDay, refillTarget,
      pMin: Math.min(...daily.map((r) => r.pAdj)),
      pMax: Math.max(...daily.map((r) => r.pAdj)),
      pMean: daily.reduce((a, r) => a + r.pAdj, 0) / Math.max(daily.length, 1),
      hoursFor, rateFor, emitterFor, peakDailyGross,
    };
  }, [startDate, srcMode, pasted, kc, et0Monthly, rainMonthly, zrMin, rootD, pDep, fwMan,
      drInit, S.awc, H.EU, H.appRate, LR, designRule, ETcManual, nBlocksTotal, nBlocks,
      maxHoursDay, Se, Sr, nEmit, adjustP, schedMode, fixedInterval, pulsesPerDay, refillTarget]);

  /* -------------------- discharge -> flux -------------------- */
  const FX = useMemo(() => {
    const Q_cm3h = qn * 1000;
    const A0 = Math.PI * r0 * r0;
    const q0 = Q_cm3h / A0;
    const rW = woodingRadius(Q_cm3h, S.Ks_cmh, S.alphaEff);
    const qW = Q_cm3h / (Math.PI * rW * rW);
    const QL = (qn * 1000) / (Se * 100);
    const bHalf = Math.max(r0, rW);
    // smallest disc that can take the full discharge under a constant-FLUX bc (q <= Ks)
    const rMinFlux = Math.sqrt(Q_cm3h / (Math.PI * Math.max(S.Ks_cmh, 1e-9)));
    const rAt80 = Math.sqrt(Q_cm3h / (Math.PI * Math.max(0.8 * S.Ks_cmh, 1e-9)));

    return { Q_cm3h, A0, q0, ponding: q0 > S.Ks_cmh, rW, qW, QL, bHalf,
             qLine: QL / (2 * bHalf), ratio: q0 / S.Ks_cmh, rMinFlux, rAt80 };
  }, [qn, r0, Se, S.Ks_cmh, S.alphaEff]);

  /* -------------------- wetting front -------------------- */
  const W = useMemo(() => {
    const Vtot = (qn * SCH.designHours) / 1000;
    const Vp = Vtot / Math.max(1, nPulse);
    const q_m3h = qn / 1000;
    const full = bulbSZ(Vtot, q_m3h, S.Ks_mh);
    const pl = bulbSZ(Vp, q_m3h, S.Ks_mh);
    const w = nPulse > 1 ? pl.w * Math.pow(nPulse, 0.07) : full.w;
    const z = nPulse > 1 ? pl.z * Math.pow(nPulse, 0.18) : full.z;
    const A = z / Math.max(w / 2, 1e-6);
    const aMB = Math.pow((3 * Vtot) / (2 * Math.PI * A * S.dThetaBulb), 1 / 3);
    // implied volume-averaged water content: the applied water must fit the S&Z bulb
    const VbulbSZ = (2 / 3) * Math.PI * Math.pow(w / 2, 2) * z;
    const dThImplied = Vtot / Math.max(VbulbSZ, 1e-9);
    const satFrac = (S.thI + dThImplied) / Math.max(soil.ts, 1e-6);

    /* When the correlation is geometrically inconsistent, keep its aspect ratio
       (the shape is the robust part) and rescale so mass balance holds exactly.
       Delta-theta is taken to field capacity: the drained bulb the roots see
       between irrigations, which is the design-relevant one.                    */
    const dThFC = Math.max(0.005, S.thFC - S.thI);
    const aCorr = Math.pow((3 * Vtot) / (2 * Math.PI * A * dThFC), 1 / 3);
    const wCorr = 2 * aCorr, zCorr = A * aCorr;
    const inconsistent = satFrac >= 1.0;
    // dimensions the rest of the tab should use
    const wUse = inconsistent ? wCorr : w;
    const zUse = inconsistent ? zCorr : z;
    const merged = Se < wUse;

    /* Two half-ellipses, semi-axes a = w/2 and b = z, centres Se apart.
       All overlap geometry uses the mass-balance-corrected dimensions when the
       raw correlation is inconsistent, so spacing advice is never based on a
       bulb that cannot physically hold the water applied.                     */
    const kTrue = Se / Math.max(wUse, 1e-6);      // for display
    const k = Math.min(1, kTrue);                 // clamped, for the geometry formulae
    const zOv = zUse * Math.sqrt(Math.max(0, 1 - k * k));   // depth of the merged strip
    const notch = zUse - zOv;                                // dry wedge below the join
    const wOv = Math.max(0, wUse - Se);                      // horizontal width of the lens
    const areaFrac = k >= 1 ? 0
      : (Math.PI / 2 - k * Math.sqrt(1 - k * k) - Math.asin(k)) / (Math.PI / 2);
    /* spacing that puts the join exactly at the target depth */
    const seForDepth = (target) =>
      zUse > target ? wUse * Math.sqrt(Math.max(0, 1 - Math.pow(target / zUse, 2))) : 0;

    /* --- inverse design: what is needed to hit a target overlap --- */
    const fovOf = (kk) => (kk >= 1 ? 0
      : (Math.PI / 2 - kk * Math.sqrt(1 - kk * kk) - Math.asin(kk)) / (Math.PI / 2));
    // f_ov is monotonically decreasing in k, so bisect
    const kForArea = (target) => {
      let a = 0, b = 1;
      for (let i = 0; i < 80; i++) {
        const mid = (a + b) / 2;
        if (fovOf(mid) > target) a = mid; else b = mid;
      }
      return (a + b) / 2;
    };
    // Schwartzman-Zur sensitivities: w ∝ q^0.39 t^0.22, z ∝ q^0.18 t^0.63
    const durationFactor = (widthRatio) => Math.pow(widthRatio, 1 / 0.22);
    const dischargeFactor = (widthRatio) => Math.pow(widthRatio, 1 / 0.39);

    return {
      Vtot, w, z, wMB: 2 * aMB, zMB: A * aMB, A, merged,
      k, kTrue, zOv, notch, wOv, areaFrac, seForDepth,
      VbulbSZ, dThImplied, satFrac, inconsistent, wCorr, zCorr, dThFC, wUse, zUse,
      fovOf, kForArea, durationFactor, dischargeFactor,
      P: merged ? Math.min(1, wUse / Sr) : Math.min(1, ((Math.PI * wUse * wUse) / 4) / (Se * Sr)),
    };
  }, [SCH.designHours, qn, nPulse, S.Ks_mh, S.dThetaBulb, S.thI, S.thFC, soil.ts, Se, Sr]);

  /* -------------------- fertigation -------------------- */
  const F = useMemo(() => {
    const areaBlock = (H.Nm * Sr * Llat * H.mult) / 10000;
    const nutrient = nRate * areaBlock;
    const product = nutrient / (fertN / 100);
    const stockVol = (product * 1000) / tankConc;
    const injMin = Math.max(5, SCH.designHours * 60 * 0.5);
    const waterVol = H.man.Q * SCH.designHours * 3600 * 1000;
    return {
      areaBlock, nutrient, product, stockVol, injMin,
      injRate: stockVol / (injMin / 60), waterVol,
      conc: (nutrient * 1e6) / Math.max(waterVol, 1),
      seasonN: nRate * areaBlock * SCH.events.length,
      seasonNha: nRate * SCH.events.length,
    };
  }, [H, Sr, Llat, nRate, fertN, tankConc, SCH.designHours, SCH.events.length]);

  const st = (ok, warn) => (ok ? "ok" : warn ? "warn" : "fail");

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900">
      <header className="mb-4 border-b-2 border-slate-800 pb-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Drip Irrigation Design Workbench</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Network hydraulics · van Genuchten–Mualem soil · discharge-to-flux boundary condition ·
              daily ETc water balance · bulb geometry
            </p>
          </div>
          <nav className="flex flex-wrap gap-1">
            {[["hyd", "Hydraulics"], ["water", "Crop water use"], ["soil", "Soil & flux"],
              ["bulb", "Wetting front"], ["fert", "Fertigation"]].map(([id, lb]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`rounded-t border-b-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                  tab === id ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {lb}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ---------------- inputs ---------------- */}
        <div className="space-y-3 lg:col-span-4 xl:col-span-3">
          <Panel title="Block geometry" tone="soil">
            <Field label="Row / lateral spacing" unit="m" value={Sr} onChange={setSr} step={0.1} />
            <Field label="Leaching fraction" unit="%" value={LR} onChange={setLR} step={1} />
            <div className="mt-2 rounded bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
              design ETc = {fmt(SCH.ETcDesign, 2)} mm/d ({designRule === "p7" ? "peak 7-day mean" : designRule === "max" ? "season max" : designRule === "p95" ? "95th percentile" : "manual"})
            </div>
          </Panel>

          {tab === "water" && (
            <>
              <Panel title="Season & crop coefficient" tone="soil">
                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-xs text-slate-600">Planting date</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-32 rounded border border-slate-300 bg-white px-1 py-1 text-right font-mono text-[11px] focus:border-cyan-600 focus:outline-none" />
                </label>
                <div className="my-2 border-t border-dashed border-slate-200" />
                <div className="grid grid-cols-2 gap-x-3">
                  <Field label="L initial" unit="d" value={kc.Lini} onChange={setKcKey("Lini")} />
                  <Field label="L develop" unit="d" value={kc.Ldev} onChange={setKcKey("Ldev")} />
                  <Field label="L mid" unit="d" value={kc.Lmid} onChange={setKcKey("Lmid")} />
                  <Field label="L late" unit="d" value={kc.Llate} onChange={setKcKey("Llate")} />
                  <Field label="Kc ini" unit="–" value={kc.Kci} onChange={setKcKey("Kci")} step={0.05} />
                  <Field label="Kc mid" unit="–" value={kc.Kcm} onChange={setKcKey("Kcm")} step={0.05} />
                  <Field label="Kc end" unit="–" value={kc.Kce} onChange={setKcKey("Kce")} step={0.05} />
                </div>
              </Panel>

              <Panel title="ETc source" tone="water">
                <Select label="Method" wide value={srcMode} onChange={setSrcMode}
                  options={["gen", "et0", "etc"]}
                  render={(o) => ({ gen: "Monthly ET0 × Kc", et0: "Paste daily ET0", etc: "Paste daily ETc" }[o])} />
                {srcMode === "gen" ? (
                  <>
                    <Select label="Climate preset" wide value={climate}
                      onChange={(v) => { setClimate(v); setEt0Monthly([...CLIMATES[v]]); }}
                      options={Object.keys(CLIMATES)} />
                    <div className="mt-2 mb-1 text-[10px] uppercase tracking-wider text-slate-400">Monthly mean ET0 [mm/d]</div>
                    <MonthGrid values={et0Monthly} onChange={setEt0Monthly} />
                  </>
                ) : (
                  <>
                    <div className="mt-2 mb-1 text-[10px] uppercase tracking-wider text-slate-400">
                      One value per line, or date,value
                    </div>
                    <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={7}
                      placeholder={"2026-04-20,1.8\n2026-04-21,2.1\n2026-04-22,2.4"}
                      className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-[11px] focus:border-cyan-600 focus:outline-none" />
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      {parseSeries(pasted).length} days parsed
                    </div>
                  </>
                )}
                <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-slate-400">Effective rainfall [mm/month]</div>
                <MonthGrid values={rainMonthly} onChange={setRainMonthly} step={5} />
              </Panel>

              <Panel title="Scheduling strategy" tone="water">
                <Select label="Mode" wide value={schedMode} onChange={setSchedMode}
                  options={["depletion", "fixed", "daily"]}
                  render={(o) => ({ depletion: "Depletion-triggered", fixed: "Fixed interval", daily: "Daily" }[o])} />
                {schedMode === "fixed" && (
                  <Field label="Irrigation interval" unit="d" value={fixedInterval}
                         onChange={setFixedInterval} step={1} min={1} />
                )}
                <Field label="Refill target" unit="%" value={refillTarget} onChange={setRefillTarget} step={5} />
                <Field label="Pulses per day" unit="–" value={pulsesPerDay} onChange={setPulsesPerDay} step={1} min={1} />
                <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[10px] leading-relaxed text-slate-500">
                  {schedMode === "depletion" && (
                    <>FAO-56 approach: wait until depletion reaches RAW, then refill. Built for surface and
                    sprinkler systems that occasionally recharge the whole root zone. The interval follows from the
                    soil — currently about {fmt(SCH.meanInterval, 1)} d.</>
                  )}
                  {schedMode === "fixed" && (
                    <>Standard drip practice: irrigate every {fmt(fixedInterval, 0)} d and replace what the crop
                    used, regardless of depletion. Keeps the bulb continuously moist and maintains a leaching flux.
                    Usual in arid and semi-arid regions, where 1–3 d is typical.</>
                  )}
                  {schedMode === "daily" && (
                    <>High-frequency drip: replace yesterday's use every day. Common on sandy soils, in
                    greenhouses, and wherever the wetted volume stores too little to carry the crop.</>
                  )}
                  {refillTarget !== 100 && (
                    <span className="mt-1 block text-amber-700">
                      Refilling to {fmt(refillTarget, 0)} % — deliberate deficit irrigation, so depletion will
                      accumulate. Watch the stress-days tile.
                    </span>
                  )}
                  {pulsesPerDay > 1 && (
                    <span className="mt-1 block">
                      Each event split into {pulsesPerDay} pulses — {fmt(SCH.designHours / pulsesPerDay, 2)} h each
                      on the largest event. Set the same number on the Wetting front tab to see the bulb effect.
                    </span>
                  )}
                </div>
              </Panel>
              <Panel title="Root zone & management" tone="soil">
                <Field label="Zr at planting" unit="m" value={zrMin} onChange={setZrMin} step={0.05} />
                <Field label="Zr maximum" unit="m" value={rootD} onChange={setRootD} step={0.05} />
                <Field label="Depletion fraction p (MAD)" unit="–" value={pDep} onChange={setPDep} step={0.05} />
                <label className="flex items-start justify-between gap-3 py-1">
                  <span className="text-xs leading-tight text-slate-600">
                    Adjust p for daily ETc
                    <span className="block text-[10px] text-slate-400">FAO-56 Eq. 83</span>
                  </span>
                  <input type="checkbox" checked={adjustP} onChange={(e) => setAdjustP(e.target.checked)}
                         className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-700" />
                </label>
                <div className="mb-1 rounded bg-slate-50 px-2 py-1 text-[10px] leading-relaxed text-slate-500">
                  {adjustP ? (
                    <>p<sub>adj</sub> = p + 0.04(5 − ETc), clipped to 0.1–0.8.
                    {" "}Applied this season: <span className="font-mono">{fmt(SCH.pMin, 3)}–{fmt(SCH.pMax, 3)}</span>,
                    mean <span className="font-mono">{fmt(SCH.pMean, 3)}</span>
                    {Math.abs(SCH.pMean - pDep) > 0.03 && (
                      <span className="text-amber-700"> — differs from your {fmt(pDep, 2)} by
                        {" "}{fmt(100 * (SCH.pMean / Math.max(pDep, 0.01) - 1), 0)} %</span>
                    )}</>
                  ) : (
                    <>Your MAD of <span className="font-mono">{fmt(pDep, 2)}</span> is applied literally on every day.
                    {" "}RAW = MAD × TAW = <span className="font-mono">{fmt(pDep * 1000 * S.awc * rootD * fwMan, 1)} mm</span> at full root depth.</>
                  )}
                </div>
                <Field label="Managed wetted fraction" unit="–" value={fwMan} onChange={setFwMan} step={0.05} />
                <Field label="Initial depletion" unit="mm" value={drInit} onChange={setDrInit} step={5} />
                <Field label="Blocks in system" unit="–" value={nBlocksTotal} onChange={setNBlocksTotal} step={1} />
                <Field label="Max operating hours" unit="h/d" value={maxHoursDay} onChange={setMaxHoursDay} step={1} />
                <Field label="Min practical set" unit="h" value={minSetHours} onChange={setMinSetHours} step={0.25} />
                <Select label="Design ETc rule" wide value={designRule} onChange={setDesignRule}
                  options={["p7", "pm", "p95", "max", "man"]}
                  render={(o) => ({ p7: "Peak 7-day mean", pm: "Peak month mean", p95: "95th percentile", max: "Season maximum", man: "Manual" }[o])} />
                {designRule === "man" && <Field label="Manual design ETc" unit="mm/d" value={ETcManual} onChange={setETcManual} step={0.1} />}
                <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[10px] leading-relaxed text-slate-500">
                  Wetting-front tab currently gives P = {fmt(W.P * 100, 0)} %. Setting the managed wetted
                  fraction to roughly that value keeps the balance consistent with the bulb.
                </div>
              </Panel>
            </>
          )}

          {tab === "hyd" && (
            <>
              <Panel title="Emitter" tone="water">
                <Field label="Nominal discharge qₙ" unit="L/h" value={qn} onChange={setQn} step={0.1} />
                <Field label="Nominal head hₙ" unit="m" value={hn} onChange={setHn} step={1} />
                <Field label="Exponent x" unit="–" value={xExp} onChange={setXExp} step={0.05} />
                <Field label="Manufacturing CV" unit="–" value={CV} onChange={setCV} step={0.01} />
                <Field label="Emitter spacing Sₑ" unit="m" value={Se} onChange={setSe} step={0.05} />
                <Field label="Emitters per plant" unit="–" value={nEmit} onChange={setNEmit} step={1} />
              </Panel>
              <Panel title="Lateral" tone="water">
                <Select label="Inside diameter [mm]" value={Dlat} onChange={(v) => setDlat(+v)} options={LATERAL_ID} />
                <Field label="Length" unit="m" value={Llat} onChange={setLlat} step={5} />
                <Field label="Slope (+ downhill)" unit="%" value={slopeLat} onChange={setSlopeLat} step={0.1} />
                <Field label="Barb loss factor" unit="–" value={klocal} onChange={setKlocal} step={0.05} />
              </Panel>
              <Panel title="Manifold" tone="water">
                <Select label="Inside diameter [mm]" value={Dman} onChange={(v) => setDman(+v)} options={PIPE_ID} />
                <Field label="Laterals served" unit="–" value={nLat} onChange={setNLat} step={2} />
                <Field label="Slope (+ downhill)" unit="%" value={slopeMan} onChange={setSlopeMan} step={0.1} />
                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-xs text-slate-600">Laterals both sides</span>
                  <input type="checkbox" checked={bothSides} onChange={(e) => setBothSides(e.target.checked)}
                    className="h-4 w-4 accent-cyan-700" />
                </label>
              </Panel>
              <Panel title="Mainline & pump">
                <Select label="Inside diameter [mm]" value={Dmain} onChange={(v) => setDmain(+v)} options={PIPE_ID} />
                <Field label="Length" unit="m" value={Lmain} onChange={setLmain} step={10} />
                <Field label="Static lift" unit="m" value={zLift} onChange={setZLift} step={1} />
                <Field label="Filter + injector loss" unit="m" value={hFilter} onChange={setHFilter} step={0.5} />
                <Field label="Fittings allowance" unit="%" value={minorPct} onChange={setMinorPct} step={1} />
                <Field label="Pump efficiency" unit="%" value={pumpEff} onChange={setPumpEff} step={1} />
                <Field label="Blocks running at once" unit="–" value={nBlocks} onChange={setNBlocks} step={1} />
              </Panel>
            </>
          )}

          {(tab === "soil" || tab === "bulb") && (
            <>
              <Panel title="Soil — van Genuchten–Mualem" tone="soil">
                <Select label="Texture preset" value={preset} onChange={applyPreset}
                  options={SOILS.map((_, i) => i)} render={(i) => SOILS[i].name} />
                <div className="my-2 border-t border-dashed border-slate-200" />
                <Field label="θr" unit="cm³/cm³" value={soil.tr} onChange={setSoilKey("tr")} step={0.005} />
                <Field label="θs" unit="cm³/cm³" value={soil.ts} onChange={setSoilKey("ts")} step={0.005} />
                <Field label="α" unit="1/cm" value={soil.al} onChange={setSoilKey("al")} step={0.001} />
                <Field label="n" unit="–" value={soil.n} onChange={setSoilKey("n")} step={0.01} />
                <Field label="l (tortuosity)" unit="–" value={soil.l} onChange={setSoilKey("l")} step={0.1} />
                <Field label="Ks" unit="cm/d" value={soil.Ks} onChange={setSoilKey("Ks")} step={1} />
                <div className="mt-2 rounded bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
                  m = {fmt(S.m, 4)} · Ks = {fmt(S.Ks_cmh, 4)} cm/h · AWC = {fmt(S.awc, 3)} cm³/cm³
                </div>
              </Panel>
              <Panel title="Source & initial state" tone="water">
                <Field label="Source radius r₀" unit="cm" value={r0} onChange={setR0} step={0.5} />
                <Field label="Initial head hᵢ" unit="cm" value={hInit} onChange={setHInit} step={50} />
                <Field label="Head at field capacity" unit="cm" value={hFC} onChange={setHFC} step={10} />
                <Field label="Head inside wetted bulb" unit="cm" value={hWet} onChange={setHWet} step={5} />
                <Field label="Pulses per event" unit="–" value={nPulse} onChange={setNPulse} step={1} min={1} />
                <div className="mt-2 rounded bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
                  θᵢ {fmt(S.thI, 3)} · θ<sub>wet</sub> {fmt(S.thWet, 3)} · θ<sub>FC</sub> {fmt(S.thFC, 3)} · θ<sub>WP</sub> {fmt(S.thWP, 3)} · Δθ<sub>bulb</sub> {fmt(S.dThetaBulb, 3)}
                </div>
              </Panel>
            </>
          )}

          {tab === "fert" && (
            <Panel title="Dose" tone="soil">
              <Field label="N rate per event" unit="kg/ha" value={nRate} onChange={setNRate} step={1} />
              <Field label="N content of product" unit="%" value={fertN} onChange={setFertN} step={0.5} />
              <Field label="Stock solution" unit="g/L" value={tankConc} onChange={setTankConc} step={10} />
            </Panel>
          )}
        </div>

        {/* ---------------- results ---------------- */}
        <div className="space-y-4 lg:col-span-8 xl:col-span-9">

          {tab === "hyd" && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                <Stat label="Emission uniformity" value={fmt(H.EU, 1)} unit="%" status={st(H.EU >= 90, H.EU >= 85)} />
                <Stat label="Discharge variation" value={fmt(H.dq, 1)} unit="%" status={st(H.dq <= 10, H.dq <= 15)} />
                <Stat label="Lateral inlet head" value={fmt(H.lat.hIn, 1)} unit="m" />
                <Stat label="Manifold inlet head" value={fmt(H.man.hIn, 1)} unit="m" />
                <Stat label="Total dynamic head" value={fmt(H.TDH, 1)} unit="m" />
                <Stat label="Shaft power" value={fmt(H.kW, 2)} unit="kW" />
                <Stat label="System flow" value={fmt(H.Qsys * 3600, 1)} unit="m³/h" />
                <Stat label="Application rate" value={fmt(H.appRate, 2)} unit="mm/h" />
                <Stat label="Design event depth" value={fmt(SCH.designGross, 1)} unit="mm" />
                <Stat label="Design set duration" value={fmt(SCH.designHours, 2)} unit="h" />
                <Stat label="v lateral" value={fmt(H.vLat, 2)} unit="m/s" status={st(H.vLat <= 1.5, H.vLat <= 2.0)} />
                <Stat label="v main" value={fmt(H.vMain, 2)} unit="m/s" status={st(H.vMain <= 2.0, H.vMain <= 2.5)} />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Panel title={`Lateral profile — ${H.N} emitters over ${fmt(Llat, 0)} m`}>
                  <div className="h-56 w-full">
                    <ResponsiveContainer>
                      <LineChart data={H.profile} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                        <CartesianGrid stroke="#e2e8f0" />
                        <XAxis dataKey="x" tick={{ fontSize: 10 }} stroke="#64748b" />
                        <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#0e7490" />
                        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#b45309" />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 10 }} />
                        <Line yAxisId="l" type="monotone" dataKey="h" name="pressure head (m)" stroke="#0e7490" dot={false} strokeWidth={2} />
                        <Line yAxisId="r" type="monotone" dataKey="q" name="emitter q (L/h)" stroke="#b45309" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-600">
                    <div>q<sub>min</sub> {fmt(H.qmin, 3)}</div>
                    <div>q<sub>avg</sub> {fmt(H.qavg, 3)}</div>
                    <div>q<sub>max</sub> {fmt(H.qmax, 3)} L/h</div>
                  </div>
                </Panel>

                <Panel title={`Manifold — ${H.Nm} outlets, Q = ${fmt(H.man.Q * 3600, 1)} m³/h`}>
                  <div className="h-56 w-full">
                    <ResponsiveContainer>
                      <LineChart data={H.profileMan} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                        <CartesianGrid stroke="#e2e8f0" />
                        <XAxis dataKey="x" tick={{ fontSize: 10 }} stroke="#64748b" />
                        <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#0e7490" />
                        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#b45309" />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 10 }} />
                        <Line yAxisId="l" type="monotone" dataKey="h" name="pressure head (m)" stroke="#0e7490" dot={false} strokeWidth={2} />
                        <Line yAxisId="r" type="monotone" dataKey="q" name="lateral inflow (m³/h)" stroke="#b45309" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-600">
                    Q = K·h<sup>{fmt(H.xl, 3)}</sup> · Δh<sub>lat</sub> {fmt(H.dh, 1)} % · Δh<sub>man</sub> {fmt(H.dhMan, 1)} % · h<sub>f,main</sub> {fmt(H.hfMain, 2)} m
                  </div>
                </Panel>
              </div>

              <Panel title="Design checks">
                <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                  <Check pass={H.EU >= 90}>Emission uniformity ≥ 90 % — {fmt(H.EU, 1)} %</Check>
                  <Check pass={H.dq <= 10}>Discharge variation ≤ 10 % — {fmt(H.dq, 1)} %</Check>
                  <Check pass={H.dh + H.dhMan <= 20}>Subunit head variation ≤ 20 % of hₙ — {fmt(H.dh + H.dhMan, 1)} %</Check>
                  <Check pass={H.vLat <= 2.0}>Lateral velocity ≤ 2.0 m/s — {fmt(H.vLat, 2)}</Check>
                  <Check pass={H.vMan <= 2.0}>Manifold velocity ≤ 2.0 m/s — {fmt(H.vMan, 2)}</Check>
                  <Check pass={H.vMain <= 2.0}>Main velocity ≤ 2.0 m/s — {fmt(H.vMain, 2)}</Check>
                  <Check pass={SCH.limitedDays === 0}>
                    {SCH.limitedDays === 0
                      ? `Capacity meets demand on every day of the season (peak needs ${fmt(SCH.hoursPerDayPeak, 1)} h/d over ${SCH.shifts} shift${SCH.shifts > 1 ? "s" : ""})`
                      : `Under-capacity on ${SCH.limitedDays} day(s): ${fmt(SCH.deficitTot, 1)} mm unmet — needs ≥ ${fmt(SCH.emitterFor(SCH.etcMax), 2)} L/h emitters or more simultaneous blocks`}
                  </Check>
                  <Check pass={SCH.minHours >= minSetHours}>
                    Shortest set ≥ {fmt(minSetHours, 2)} h — {fmt(SCH.minHours, 2)} h
                  </Check>
                </div>
              </Panel>
            </>
          )}

          {tab === "water" && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                <Stat label="Design ETc" value={fmt(SCH.ETcDesign, 2)} unit="mm/d" />
                <Stat label="Season min ETc" value={fmt(SCH.etcMin, 2)} unit="mm/d" />
                <Stat label="Season mean ETc" value={fmt(SCH.etcMean, 2)} unit="mm/d" />
                <Stat label="Peak 7-day mean" value={fmt(SCH.peak7, 2)} unit="mm/d" />
                <Stat label="Peak month mean" value={fmt(SCH.peakMonth, 2)} unit="mm/d" />
                <Stat label="Season max ETc" value={fmt(SCH.etcMax, 2)} unit="mm/d" />
                <Stat label="Capacity-limited days" value={SCH.limitedDays} unit="d"
                      status={st(SCH.limitedDays === 0, SCH.limitedDays <= 3)} />
                <Stat label="Stress days (Dr > RAW)" value={SCH.stressDays} unit="d"
                      status={st(SCH.stressDays === 0, SCH.stressDays <= 5)} />
                <Stat label="Unmet demand" value={fmt(SCH.deficitTot, 1)} unit="mm"
                      status={st(SCH.deficitTot < 1, SCH.deficitTot < 20)} />
                <Stat label="Deliverable per day" value={fmt(SCH.maxGrossPerDay, 1)} unit="mm" />
                <Stat label="Shortest set" value={fmt(SCH.minHours, 2)} unit="h"
                      status={st(SCH.minHours >= minSetHours, SCH.minHours >= minSetHours * 0.6)} />
                <Stat label="Longest set" value={fmt(SCH.designHours, 2)} unit="h" />
                <Stat label="Season ETc" value={fmt(SCH.totETc, 0)} unit="mm" />
                <Stat label="Effective rain" value={fmt(SCH.totRain, 0)} unit="mm" />
                <Stat label="Season irrigation" value={fmt(SCH.totGross, 0)} unit="mm gross" />
                <Stat label="Events" value={SCH.events.length} unit="–" />
                <Stat label="Mean interval" value={fmt(SCH.meanInterval, 1)} unit="d" />
                <Stat label="Season length" value={SCH.nDays} unit="d" />
              </div>

              <Panel title="Capacity envelope — can the system deliver each level of demand?" tone="water">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-300 text-left text-[9px] uppercase tracking-wider text-slate-500">
                        <th className="py-1">Demand level</th>
                        <th className="py-1 text-right">ETc (mm/d)</th>
                        <th className="py-1 text-right">Gross (mm/d)</th>
                        <th className="py-1 text-right">h/d per block</th>
                        <th className="py-1 text-right">Total h/d</th>
                        <th className="py-1 text-right">Emitter needed</th>
                        <th className="py-1 text-center">Feasible</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-slate-700">
                      {SCH.envelope.map((r) => (
                        <tr key={r.k} className="border-b border-slate-100">
                          <td className="py-1 font-sans">{r.k}</td>
                          <td className="py-1 text-right">{fmt(r.v, 2)}</td>
                          <td className="py-1 text-right">{fmt(r.v / SCH.effy, 2)}</td>
                          <td className="py-1 text-right">{fmt(r.h / SCH.shifts, 2)}</td>
                          <td className="py-1 text-right">{fmt(r.h, 1)}</td>
                          <td className="py-1 text-right">{fmt(SCH.emitterFor(r.v), 2)} L/h</td>
                          <td className="py-1 text-center">
                            <span className={`inline-block h-2 w-2 rounded-full ${r.ok ? "bg-emerald-600" : "bg-red-600"}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                  {SCH.shifts} shift{SCH.shifts > 1 ? "s" : ""} ({nBlocksTotal} blocks, {nBlocks} running at once),
                  so each block has {fmt(SCH.hoursPerBlock, 1)} h/d and can receive at most {fmt(SCH.maxGrossPerDay, 1)} mm gross
                  per day at the current {fmt(H.appRate, 2)} mm/h application rate. The last column is the emitter discharge
                  that would be required at Sₑ = {fmt(Se, 2)} m and row spacing {fmt(Sr, 2)} m to make each level feasible
                  within {fmt(maxHoursDay, 0)} h/d.
                </p>
              </Panel>

              <Panel title="Daily crop water use, rainfall and irrigation" tone="water">
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <ComposedChart data={SCH.daily} margin={{ top: 8, right: 8, left: -18, bottom: 14 }}>
                      <CartesianGrid stroke="#e2e8f0" />
                      <XAxis dataKey="d" tick={{ fontSize: 10 }} stroke="#64748b"
                             label={{ value: "days after planting", position: "insideBottom", offset: -6, fontSize: 10 }} />
                      <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#a16207" />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#0e7490" />
                      <Tooltip contentStyle={{ fontSize: 11 }}
                               labelFormatter={(d) => SCH.daily[d - 1] ? `day ${d} — ${SCH.daily[d - 1].date}` : `day ${d}`} />
                      <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 10 }} />
                      <Bar yAxisId="r" dataKey="irr" name="irrigation (mm gross)" fill="#0e7490" opacity={0.55} />
                      <Bar yAxisId="l" dataKey="rain" name="effective rain (mm)" fill="#64748b" opacity={0.45} />
                      <Line yAxisId="l" type="monotone" dataKey="etc" name="ETc (mm/d)" stroke="#a16207" dot={false} strokeWidth={2} />
                      <ReferenceLine yAxisId="l" y={SCH.ETcDesign} stroke="#b91c1c" strokeDasharray="5 4"
                                     label={{ value: "design ETc", fontSize: 9, fill: "#b91c1c", position: "right" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <Panel title="Root-zone depletion — irrigation triggered at readily available water" tone="soil">
                    <div className="h-60 w-full">
                      <ResponsiveContainer>
                        <LineChart data={SCH.daily} margin={{ top: 8, right: 8, left: -18, bottom: 14 }}>
                          <CartesianGrid stroke="#e2e8f0" />
                          <XAxis dataKey="d" tick={{ fontSize: 10 }} stroke="#64748b"
                                 label={{ value: "days after planting", position: "insideBottom", offset: -6, fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} stroke="#64748b" reversed
                                 label={{ value: "depletion (mm)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                          <Tooltip contentStyle={{ fontSize: 11 }}
                                   labelFormatter={(d) => SCH.daily[d - 1] ? `day ${d} — ${SCH.daily[d - 1].date}` : `day ${d}`} />
                          <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 10 }} />
                          <Line type="monotone" dataKey="Dr" name="depletion Dr" stroke="#b45309" dot={false} strokeWidth={2} />
                          <Line type="monotone" dataKey="RAW" name="RAW = p·TAW" stroke="#0e7490" dot={false} strokeWidth={1.5} strokeDasharray="5 4" />
                          <Line type="monotone" dataKey="TAW" name="TAW" stroke="#b91c1c" dot={false} strokeWidth={1.5} strokeDasharray="2 3" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                      TAW = 1000·(θ<sub>FC</sub> − θ<sub>WP</sub>)·Z<sub>r</sub>·f<sub>w</sub>, with θ from the retention
                      curve on the Soil tab. Both thresholds rise as the root zone grows.
                      {adjustP
                        ? ` p is adjusted for the day's demand as p + 0.04(5 − ETc), so the trigger tightens in hot weather — this season it ranged ${fmt(SCH.pMin, 2)} to ${fmt(SCH.pMax, 2)} against your entered ${fmt(pDep, 2)}.`
                        : ` Your MAD of ${fmt(pDep, 2)} is applied literally, unadjusted, so RAW follows only the root-zone growth.`}
                    </p>
                  </Panel>
                </div>
                <Panel title={`Irrigation calendar — ${SCH.events.length} events`}>
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-300 text-left text-[9px] uppercase tracking-wider text-slate-500">
                          <th className="py-1">Date</th><th className="py-1 text-right">DAP</th>
                          <th className="py-1 text-right">mm</th><th className="py-1 text-right">h</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono text-slate-700">
                        {SCH.events.map((e) => (
                          <tr key={e.t} className="border-b border-slate-100">
                            <td className="py-0.5">{e.date}</td>
                            <td className="py-0.5 text-right">{e.t + 1}</td>
                            <td className="py-0.5 text-right">{fmt(e.gross, 1)}</td>
                            <td className="py-0.5 text-right">{fmt(e.hours, 2)}</td>
                          </tr>
                        ))}
                        {!SCH.events.length && (
                          <tr><td colSpan={4} className="py-3 text-center text-slate-400">
                            No events — rainfall covers demand, or TAW is too large to trigger.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>

              <Panel title="Does the strategy hold up against the water balance?">
                <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                  <Check pass={SCH.stressDays === 0}>
                    {SCH.stressDays === 0
                      ? "Depletion never exceeded RAW — no crop stress at any point"
                      : `${SCH.stressDays} day(s) with depletion above RAW. ${
                          schedMode === "fixed"
                            ? `Shorten the interval below ${fmt(fixedInterval, 0)} d`
                            : schedMode === "daily"
                              ? "Even daily irrigation is not keeping up — raise the refill target or the application rate"
                              : "Raise the application rate or run more blocks at once"}.`}
                  </Check>
                  <Check pass={SCH.limitedDays === 0}>
                    {SCH.limitedDays === 0
                      ? "Every scheduled event was delivered in full"
                      : `${SCH.limitedDays} day(s) capacity-limited, ${fmt(SCH.deficitTot, 1)} mm unmet`}
                  </Check>
                  <Check pass={SCH.maxDr <= 1000 * S.awc * rootD * fwMan}>
                    Peak depletion {fmt(SCH.maxDr, 1)} mm against TAW {fmt(1000 * S.awc * rootD * fwMan, 1)} mm
                  </Check>
                  <Check pass={SCH.minHours >= minSetHours}>
                    Shortest set {fmt(SCH.minHours, 2)} h ≥ {fmt(minSetHours, 2)} h practical minimum
                    {pulsesPerDay > 1 && ` (${fmt(SCH.minHours / pulsesPerDay, 2)} h per pulse)`}
                  </Check>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                  {schedMode === "depletion"
                    ? `The soil is choosing the interval: ${fmt(SCH.meanInterval, 1)} d on average. If that seems long for a drip system, check the managed wetted fraction — values near 1.0 assume full surface wetting and inflate the reservoir. Under drip it should match the wetted fraction P from the bulb, typically 0.2–0.5.`
                    : schedMode === "fixed"
                      ? `You are choosing the interval: ${fmt(fixedInterval, 0)} d, ${SCH.events.length} events, mean depth ${fmt(SCH.totGross / Math.max(SCH.events.length, 1), 1)} mm. The balance above is now a check rather than a controller — it confirms the interval you picked is safe, and flags it if not.`
                      : `Daily replacement, ${SCH.events.length} events, mean depth ${fmt(SCH.totGross / Math.max(SCH.events.length, 1), 1)} mm. Soil storage plays almost no role; the emitter is doing the work each day.`}
                </p>
              </Panel>

              <Panel title="Sizing versus scheduling">
                <p className="text-xs leading-relaxed text-slate-600">
                  Capacity and scheduling are different numbers, but the design ETc is a floor, not a
                  convenience. The system must be able to meet the highest sustained demand it will face:
                  here the season maximum is {fmt(SCH.etcMax, 2)} mm/d and the peak 7-day mean is {fmt(SCH.peak7, 2)} mm/d,
                  needing {fmt(SCH.hoursFor(SCH.etcMax), 1)} and {fmt(SCH.hoursFor(SCH.peak7), 1)} h/d respectively
                  across {SCH.shifts} shift{SCH.shifts > 1 ? "s" : ""}.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Sizing below the season maximum is only defensible if soil storage actually covers the gap.
                  That credit is worth (season max − design ETc) × the length of the hot spell, and it has to fit
                  inside RAW. RAW here peaks near {fmt(1000 * S.awc * rootD * fwMan * pDep, 0)} mm, which buys
                  roughly {fmt((1000 * S.awc * rootD * fwMan * pDep) / Math.max(SCH.etcMax - SCH.peak7, 0.01), 1)} days
                  at the difference between those two rates. Under drip the credit is usually small, because f<sub>w</sub> is
                  only {fmt(fwMan, 2)} and high-frequency operation deliberately keeps the profile near field capacity —
                  so the storage buffer shrinks exactly in the hot, sandy, shallow-rooted conditions that produce the
                  highest ETc. Do not assume it; read the deficit indicators above.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  The balance is now capacity-constrained: when demand exceeds what the block can receive in
                  {" "}{fmt(SCH.hoursPerBlock, 1)} h, the shortfall is carried forward as depletion rather than
                  silently satisfied. <strong>{SCH.limitedDays === 0
                    ? "No day was capacity-limited, so the current sizing meets demand throughout."
                    : `${SCH.limitedDays} day(s) were capacity-limited, leaving ${fmt(SCH.deficitTot, 1)} mm unmet and ${SCH.stressDays} day(s) above RAW.`}</strong>
                  {SCH.limitedDays > 0 && ` Fix it by raising the application rate to at least ${fmt(SCH.rateFor(SCH.etcMax), 2)} mm/h — emitter discharge ${fmt(SCH.emitterFor(SCH.etcMax), 2)} L/h at the current spacing — or by running more blocks simultaneously.`}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  The minimum matters too. At the season low of {fmt(SCH.etcMin, 2)} mm/d the shortest scheduled set
                  is {fmt(SCH.minHours, 2)} h. Below roughly {fmt(minSetHours, 2)} h the fill and drain transients become a
                  large fraction of the run, uniformity falls well below the steady-state EU computed on the Hydraulics
                  tab, and drain-out water collects at low points. If sets get that short, lengthen the interval rather
                  than shortening the run.
                </p>
              </Panel>
            </>
          )}

          {tab === "soil" && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                <Stat label="Applied flux q₀" value={fmt(FX.q0, 2)} unit="cm/h" status={st(!FX.ponding, FX.ratio < 3)} />
                <Stat label="q₀ / Ks" value={fmt(FX.ratio, 2)} unit="–" status={st(FX.ratio <= 1, FX.ratio <= 3)} />
                <Stat label="Wooding radius r_w" value={fmt(FX.rW, 2)} unit="cm" />
                <Stat label="Flux at r_w" value={fmt(FX.qW, 2)} unit="cm/h" />
                <Stat label="Capillary length λc" value={fmt(S.lambdaC, 1)} unit="cm" />
                <Stat label="α effective" value={fmt(S.alphaEff, 4)} unit="1/cm" />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Panel title="Discharge → boundary flux" tone="water">
                  <Row k="Emitter discharge Q" v={`${fmt(qn, 2)} L/h`} hint={`${fmt(FX.Q_cm3h, 0)} cm³/h`} />
                  <Row k="Source area πr₀²" v={`${fmt(FX.A0, 2)} cm²`} hint={`r₀ = ${fmt(r0, 1)} cm`} />
                  <Row k="q₀ (HYDRUS, cm/h)" v={fmt(FX.q0, 4)} />
                  <Row k="q₀ (HYDRUS, cm/min)" v={fmt(FX.q0 / 60, 5)} />
                  <Row k="q₀ (mm/h)" v={fmt(FX.q0 * 10, 2)} />
                  <Row k="q₀ (m/s)" v={sci(FX.q0 / 100 / 3600, 3)} />
                  <div className="my-2 border-t border-dashed border-slate-200" />
                  <Row k="Line source strength Q_L" v={`${fmt(FX.QL, 1)} cm²/h`} hint="= Q / Sₑ" />
                  <Row k="Planar 2D flux over 2b" v={`${fmt(FX.qLine, 3)} cm/h`} hint={`b = ${fmt(FX.bHalf, 1)} cm`} />
                  <div className={`mt-3 rounded border px-3 py-2 text-xs leading-relaxed ${
                    FX.ponding ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
                    {FX.ponding ? (
                      <><strong>q₀ &gt; Ks — the assumed r₀ cannot absorb this discharge.</strong> Water ponds and the
                        source spreads. Two valid boundary conditions:
                        <br />• <strong>Constant head</strong> h = 0 over r_w = {fmt(FX.rW, 2)} cm. The mean flux there is
                        {" "}{fmt(FX.qW, 2)} cm/h, which exceeds Ks legitimately because a saturated disc also draws water
                        laterally — valid for a head BC only.
                        <br />• <strong>Constant flux</strong> at q ≤ Ks, which requires r ≥ {fmt(FX.rMinFlux, 2)} cm
                        (= √(Q/πKs)). At q = {fmt(0.8 * S.Ks_cmh, 2)} cm/h use r = {fmt(FX.rAt80, 2)} cm.
                        <br />Never impose {fmt(FX.qW, 2)} cm/h as a flux BC — it is above Ks and will not converge.</>
                    ) : (
                      <><strong>q₀ ≤ Ks — no ponding.</strong> A constant-flux Neumann BC of {fmt(FX.q0, 4)} cm/h over
                        r₀ = {fmt(r0, 1)} cm is physically consistent.</>
                    )}
                  </div>
                </Panel>
                <Panel title="Retention and conductivity functions" tone="soil">
                  <div className="h-64 w-full">
                    <ResponsiveContainer>
                      <LineChart data={S.curve} margin={{ top: 8, right: 4, left: -12, bottom: 14 }}>
                        <CartesianGrid stroke="#e2e8f0" />
                        <XAxis dataKey="ah" type="number" scale="log" domain={[1, 1e5]}
                               ticks={[1, 10, 100, 1000, 1e4, 1e5]} tick={{ fontSize: 10 }} stroke="#64748b"
                               tickFormatter={(v) => (v >= 1000 ? `1e${Math.round(Math.log10(v))}` : v)}
                               label={{ value: "|h| (cm)", position: "insideBottom", offset: -6, fontSize: 10 }} />
                        <YAxis yAxisId="t" tick={{ fontSize: 10 }} stroke="#a16207" domain={[0, "auto"]} />
                        <YAxis yAxisId="k" orientation="right" scale="log" domain={["auto", "auto"]}
                               tick={{ fontSize: 9 }} stroke="#0e7490"
                               tickFormatter={(v) => `1e${Math.round(Math.log10(v))}`} />
                        <Tooltip contentStyle={{ fontSize: 11 }}
                                 formatter={(v, n) => [n === "K (cm/d)" ? v.toExponential(2) : v, n]} />
                        <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 10 }} />
                        <Line yAxisId="t" type="monotone" dataKey="th" name="θ (cm³/cm³)" stroke="#a16207" dot={false} strokeWidth={2} />
                        <Line yAxisId="k" type="monotone" dataKey="K" name="K (cm/d)" stroke="#0e7490" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500">
                    φ = ∫K dh = {sci(S.phi, 3)} cm²/d · λc = φ/Ks = {fmt(S.lambdaC, 1)} cm
                  </div>
                </Panel>
              </div>
            </>
          )}

          {tab === "bulb" && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                <Stat label={W.inconsistent ? "Width w (corrected)" : "Width w (S&Z)"}
                      value={fmt(W.wUse * 100, 0)} unit="cm" status={W.inconsistent ? "warn" : undefined} />
                <Stat label={W.inconsistent ? "Depth z (corrected)" : "Depth z (S&Z)"}
                      value={fmt(W.zUse * 100, 0)} unit="cm" status={W.inconsistent ? "warn" : undefined} />
                <Stat label="Width (mass bal.)" value={fmt(W.wMB * 100, 0)} unit="cm" />
                <Stat label="Depth (mass bal.)" value={fmt(W.zMB * 100, 0)} unit="cm" />
                <Stat label="Water per emitter" value={fmt(W.Vtot * 1000, 1)} unit="L" />
                <Stat label="Wetted fraction P" value={fmt(W.P * 100, 0)} unit="%" status={st(W.P >= 0.3, W.P >= 0.2)} />
                <Stat label="Δθ in bulb" value={fmt(S.dThetaBulb, 3)} unit="–" />
                <Stat label="Depth / root depth" value={fmt(W.zUse / rootD, 2)} unit="–" status={st(W.zUse / rootD <= 1.2, W.zUse / rootD <= 1.5)} />
                <Stat label="Aspect z / (w/2)" value={fmt(W.A, 2)} unit="–" />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <Panel title="Wetted bulb cross-section — vertical plane along the lateral" tone="soil">
                    <BulbDrawing w={W.wUse} z={W.zUse} zOv={W.zOv} Se={Se} rootD={rootD}
                                 r0={FX.ponding ? FX.rW / 100 : r0 / 100} />
                  </Panel>
                </div>
                <div className="space-y-3">
                  <Panel title="Consistency check — implied water content" tone="water">
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      Treating the Schwartzman–Zur bulb as a half-ellipsoid, the water applied must fit inside it.
                      That fixes the volume-averaged water content the correlation implies:
                    </p>
                    <div className="mt-2 rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700">
                      V<sub>bulb</sub> = ⅔π(w/2)²z = {fmt(W.VbulbSZ * 1000, 1)} L ·
                      applied {fmt(W.Vtot * 1000, 2)} L
                      <br />Δθ<sub>implied</sub> = {fmt(W.dThImplied, 4)} ·
                      θ̄ = {fmt(S.thI + W.dThImplied, 4)} = {fmt(W.satFrac * 100, 0)} % of θ<sub>s</sub>
                    </div>
                    <div className="mt-2">
                      <Check pass={!W.inconsistent && W.satFrac > 0.35}>
                        {W.inconsistent
                          ? `Implied θ̄ = ${fmt(S.thI + W.dThImplied, 3)} exceeds porosity ${fmt(soil.ts, 3)} — the raw correlation predicts a bulb too small to hold the water applied.`
                          : W.satFrac < 0.35
                            ? `Implied θ̄ is only ${fmt(W.satFrac * 100, 0)} % of saturation, low for a bulb near an emitter. The correlation may be overestimating the bulb here.`
                            : `Implied θ̄ is ${fmt(W.satFrac * 100, 0)} % of saturation — plausible for a wetted bulb.`}
                      </Check>
                    </div>
                    {W.inconsistent && (
                      <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                        <strong>Corrected automatically.</strong> The aspect ratio A = {fmt(W.A, 3)} is the robust part
                        of the correlation, so it is kept and the size rescaled until mass balance holds exactly:
                        <div className="mt-1 font-mono text-[10px]">
                          a = [3V / (2πA·Δθ)]<sup>1/3</sup>, Δθ = θ<sub>FC</sub> − θ<sub>i</sub> = {fmt(W.dThFC, 4)}
                        </div>
                        <div className="mt-1 font-mono">
                          raw S&amp;Z {fmt(W.w * 100, 0)} × {fmt(W.z * 100, 0)} cm →
                          corrected <strong>{fmt(W.wCorr * 100, 0)} × {fmt(W.zCorr * 100, 0)} cm</strong>
                        </div>
                        Δθ is taken to field capacity, i.e. the drained bulb the roots see between irrigations, which is
                        the design-relevant one. Every overlap and spacing figure on this tab now uses the corrected
                        dimensions. Confirm with a numerical solution before publishing.
                      </div>
                    )}
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      This is a genuine test with nothing to tune. Schwartzman &amp; Zur was fitted on mineral field
                      soils; on engineered substrates such as wood fibre or peat an implausible θ̄ is the signal that
                      the correlation does not transfer, and that the bulb should be computed numerically instead.
                    </p>
                  </Panel>
                  <OverlapDesigner W={W} Se={Se} setSe={setSe} rootD={rootD}
                                   qn={qn} setQn={setQn} tset={SCH.designHours}
                                   ovTarget={ovTarget} setOvTarget={setOvTarget}
                                   ovMode={ovMode} setOvMode={setOvMode}
                                   plantSp={plantSp} setPlantSp={setPlantSp}
                                   Ks_mh={S.Ks_mh} Sr={Sr}
                                   TAW={1000 * S.awc * rootD * fwMan} Ea={SCH.effy} fmt={fmt} />
                  <Panel title="Overlap between adjacent bulbs" tone="soil">
                    <Row k="Normalised spacing Sₑ/w" v={fmt(W.kTrue, 3)}
                         hint={W.kTrue >= 1 ? "≥ 1, no overlap" : "overlapping"} />
                    <Row k="Lens width w − Sₑ" v={`${fmt(W.wOv * 100, 0)} cm`} />
                    <Row k="Merge depth z_ov" v={`${fmt(W.zOv * 100, 0)} cm`} hint={`${fmt(100 * W.zOv / Math.max(W.z, 1e-6), 0)} % of z`} />
                    <Row k="Dry wedge below join" v={`${fmt(W.notch * 100, 0)} cm`} />
                    <Row k="Overlap area fraction" v={`${fmt(W.areaFrac * 100, 1)} %`} />
                    <div className="my-2 border-t border-dashed border-slate-200" />
                    <Row k="Sₑ for join at root depth" v={`${fmt(W.seForDepth(rootD), 2)} m`}
                         hint={W.z > rootD ? "" : "unreachable"} />
                    <Row k="Sₑ for 20 % overlap area" v={`${fmt(0.72 * W.w, 2)} m`} />
                    <div className="mt-2 space-y-1">
                      <Check pass={W.zOv >= rootD}>
                        {W.zOv >= rootD
                          ? `Continuous wetted strip through the whole ${fmt(rootD * 100, 0)} cm root zone`
                          : W.z <= rootD
                            ? `Bulb depth z = ${fmt(W.z * 100, 0)} cm is itself shallower than the ${fmt(rootD * 100, 0)} cm root zone, so no emitter spacing can join the bulbs at that depth. Lengthen the set or raise the emitter discharge.`
                            : `Strip is continuous only to ${fmt(W.zOv * 100, 0)} cm — a dry wedge sits between emitters below that. Close Sₑ to ${fmt(W.seForDepth(rootD), 2)} m to join at root depth.`}
                      </Check>
                      <Check pass={W.areaFrac <= 0.35}>
                        {W.areaFrac <= 0.35
                          ? `Overlap area ${fmt(W.areaFrac * 100, 1)} % — emitters are not redundant`
                          : `Overlap area ${fmt(W.areaFrac * 100, 1)} % — emitters are doing duplicate work; widen Sₑ or reduce qₙ`}
                      </Check>
                      <Check pass={!(FX.ponding && 2 * FX.rW > Se * 100)}>
                        {FX.ponding && 2 * FX.rW > Se * 100
                          ? `Saturated source discs themselves merge (2·r_w = ${fmt(2 * FX.rW, 0)} cm > Sₑ = ${fmt(Se * 100, 0)} cm) — model this as a line source, not point sources`
                          : "Source discs stay separate — point-source treatment is valid"}
                      </Check>
                    </div>
                    <div className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      z_ov = z·√(1 − (Sₑ/w)²). Sized on the largest scheduled event ({fmt(SCH.designHours, 2)} h);
                      smaller events give proportionally shallower bulbs and a deeper dry wedge.
                    </div>
                  </Panel>
                </div>
              </div>
            </>
          )}

          {tab === "fert" && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Block area" value={fmt(F.areaBlock, 3)} unit="ha" />
                <Stat label="Nutrient per event" value={fmt(F.nutrient, 2)} unit="kg N" />
                <Stat label="Season N (all events)" value={fmt(F.seasonN, 1)} unit="kg N" />
                <Stat label="Season N per hectare" value={fmt(F.seasonNha, 0)} unit="kg N/ha"
                      status={st(F.seasonNha <= 400, F.seasonNha <= 600)} />
                <Stat label="Product mass" value={fmt(F.product, 2)} unit="kg" />
                <Stat label="Stock volume" value={fmt(F.stockVol, 1)} unit="L" />
                <Stat label="Injection window" value={fmt(F.injMin, 0)} unit="min" />
                <Stat label="Injection rate" value={fmt(F.injRate, 1)} unit="L/h" />
                <Stat label="Concentration" value={fmt(F.conc, 0)} unit="mg N/L" status={st(F.conc <= 150, F.conc <= 250)} />
              </div>
              <Panel title="Injection schedule — quarter / half / quarter" tone="water">
                <ol className="space-y-2 text-xs text-slate-700">
                  <li><span className="font-mono text-cyan-800">0 – {fmt(SCH.designHours * 15, 0)} min</span> — clear water, so solute enters wet soil rather than a dry front.</li>
                  <li><span className="font-mono text-cyan-800">{fmt(SCH.designHours * 15, 0)} – {fmt(SCH.designHours * 45, 0)} min</span> — inject at {fmt(F.injRate, 1)} L/h.</li>
                  <li><span className="font-mono text-cyan-800">{fmt(SCH.designHours * 45, 0)} – {fmt(SCH.designHours * 60, 0)} min</span> — clear water, flushing the lines and centring the pulse.</li>
                </ol>
                {F.seasonNha > 400 && (
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                    <strong>{fmt(F.seasonNha, 0)} kg N/ha over the season is implausible.</strong> Typical field-crop
                    demand is 100–300 kg N/ha. The dose is applied at every one of the {SCH.events.length} scheduled
                    events, so a short irrigation interval multiplies it. Either reduce the per-event rate to about
                    {" "}{fmt(200 / Math.max(SCH.events.length, 1), 1)} kg/ha for a 200 kg/ha season total, or fertigate
                    on only a fraction of the events. Check the irrigation interval on the Crop water use tab first — an
                    interval near one day usually means the managed wetted fraction is set too high relative to the
                    wetted fraction P computed from the bulb.
                  </div>
                )}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                  Applying this dose at every one of the {SCH.events.length} scheduled events gives {fmt(F.seasonN, 1)} kg N
                  on the block over the season. Match that against the crop's uptake curve rather than dosing uniformly —
                  demand during the initial stage is a fraction of mid-season, and early over-application sits below the
                  root front at {fmt(W.z * 100, 0)} cm with nothing to take it up.
                </p>
              </Panel>
            </>
          )}
        </div>
      </div>

      <footer className="mt-6 border-t border-slate-300 pt-3 text-[11px] leading-relaxed text-slate-500">
        Network solved by bisection on the distal head, not the Christiansen F factor. Soil hydraulics: van Genuchten
        (1980) with Mualem l. Crop coefficients and the depletion balance follow FAO-56; capillary length from the
        integrated matric flux potential; source radius from Wooding (1968); bulb geometry from Schwartzman &amp; Zur
        (1986) cross-checked against mass balance. Screening tools — confirm with an axisymmetric Richards solution.
      </footer>
    </div>
  );
}

/* ---------------- overlap designer: inverse problem ---------------- */

function OverlapDesigner({ W, Se, setSe, rootD, qn, setQn, tset,
                           ovTarget, setOvTarget, ovMode, setOvMode,
                           plantSp, setPlantSp, Ks_mh, Sr, TAW, Ea, fmt }) {
  const w = W.wUse, z = W.zUse;

  let kReq = null, note = "";
  if (ovMode === "area") {
    kReq = W.kForArea(ovTarget / 100);
  } else if (ovMode === "depth") {
    const target = ovTarget / 100;
    kReq = z > target ? Math.sqrt(Math.max(0, 1 - Math.pow(target / z, 2))) : null;
    if (kReq === null) note = `Bulb depth z = ${fmt(z * 100, 0)} cm is shallower than the ${fmt(target * 100, 0)} cm target, so no spacing reaches it.`;
  } else {
    const target = ovTarget / 100;
    kReq = target < w ? (w - target) / w : null;
    if (kReq === null) note = `A lens wider than the bulb itself (${fmt(w * 100, 0)} cm) is impossible.`;
  }

  const seReq = kReq === null ? null : kReq * w;

  /* Search the real product catalogue. Changing the emitter changes the bulb,
     so each candidate must be evaluated with its own discharge.               */
  const wFor = (q, t) => {
    const Q = q / 1000, V = Q * t;
    return 1.82 * Math.pow(V, 0.22) * Math.pow(Q / Ks_mh, 0.17);
  };
  const targetF = ovMode === "area" ? ovTarget / 100 : null;
  const candidates = DRIPLINE_PRODUCTS.map(([sp, q]) => {
    const wq = wFor(q, Math.max(tset, 0.01));
    const f = W.fovOf(Math.min(1, sp / wq));
    const r = plantSp / sp;
    const alignedC = r >= 1 && Math.abs(r - Math.round(r)) < 0.02;
    const perM = q / sp;                        // L/h per metre of lateral
    const I = q / (sp * Sr);                    // mm/h application rate
    return { sp, q, w: wq, f, aligned: alignedC, perPlant: Math.round(r), perM, I };
  }).filter((c) => c.aligned && c.perPlant >= 1);

  // best = meets the target with the widest spacing (fewest emitters); else the closest
  const meeting = candidates.filter((c) => targetF === null || c.f >= targetF);
  const pick = meeting.length
    ? meeting.reduce((a, b) => (b.sp > a.sp ? b : a))
    : (candidates.length ? candidates.reduce((a, b) => (b.f > a.f ? b : a)) : null);
  const meetsTarget = pick !== null && targetF !== null && pick.f >= targetF;

  const snap = pick ? pick.sp : null;
  const fovAtSnap = pick ? pick.f : null;
  const emInt = pick ? pick.perPlant : null;
  const isAligned = pick ? pick.aligned : false;
  const emCount = pick ? plantSp / pick.sp : null;
  const emPerPlant = emCount;
  const drift = 0;

  // if emitter spacing is forced to equal plant spacing, what emitter is needed?
  const wNeededSp = kReq === null ? null : plantSp / kReq;
  const ratioSp = wNeededSp === null ? null : wNeededSp / w;
  // w = 1.82 q^0.39 t^0.22 Ks^-0.17  ->  invert for q  (q in m3/h, w in m)
  const qForW = (wt, t) =>
    Math.pow(wt / (1.82 * Math.pow(t, 0.22) * Math.pow(Ks_mh, -0.17)), 1 / 0.39) * 1000;
  const qNeeded = wNeededSp === null ? null : qForW(wNeededSp, Math.max(tset, 0.01));
  // Route B must obey the same limits the feasibility search uses
  const areaPerEmitter = plantSp * Sr;
  const VmaxB = (TAW / Math.max(Ea, 0.01)) * areaPerEmitter;      // litres
  const VB = qNeeded === null ? null : qNeeded * tset;
  const zB = qNeeded === null ? null
    : 2.54 * Math.pow((qNeeded / 1000) * tset, 0.63) * Math.pow(Ks_mh / (qNeeded / 1000), 0.45);
  const volOK = VB !== null && VB <= VmaxB * 1.02;
  const depthOK = zB !== null && zB <= rootD * 1.02;
  const qOK = qNeeded !== null && qNeeded <= 16;
  const spFeasible = volOK && depthOK && qOK;

  const modes = [["area", "Overlap area %"], ["depth", "Merge depth cm"], ["lens", "Lens width cm"]];

  return (
    <Panel title="Overlap designer — work backwards from a target" tone="water">
      <div className="mb-2 flex flex-wrap gap-1">
        {modes.map(([id, lb]) => (
          <button key={id} onClick={() => {
              setOvMode(id);
              setOvTarget(id === "area" ? 25 : id === "depth" ? Math.round(rootD * 100) : 15);
            }}
            className={`rounded border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
              ovMode === id ? "border-cyan-700 bg-cyan-50 text-cyan-800"
                            : "border-slate-300 text-slate-500 hover:text-slate-800"}`}>
            {lb}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-between gap-3 py-1">
        <span className="text-xs text-slate-600">
          Target {ovMode === "area" ? "overlap area" : ovMode === "depth" ? "merge depth" : "lens width"}
          {" "}<span className="text-slate-400">[{ovMode === "area" ? "%" : "cm"}]</span>
        </span>
        <input type="number" step={ovMode === "area" ? 5 : 1} value={ovTarget}
          onChange={(e) => setOvTarget(parseFloat(e.target.value))}
          onWheel={(e) => e.currentTarget.blur()}
          className="w-24 shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-right font-mono text-xs focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" />
      </label>
      <label className="flex items-center justify-between gap-3 py-1">
        <span className="text-xs text-slate-600">Plant spacing in the row <span className="text-slate-400">[m]</span></span>
        <input type="number" step={0.05} value={plantSp}
          onChange={(e) => setPlantSp(parseFloat(e.target.value))}
          onWheel={(e) => e.currentTarget.blur()}
          className="w-24 shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-right font-mono text-xs focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" />
      </label>

      {note ? (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{note}</div>
      ) : (
        <>
          <FeasibilityCheck W={W} plantSp={plantSp} rootD={rootD} Ks_mh={Ks_mh}
                            target={ovMode === "area" ? ovTarget / 100 : null}
                            qn={qn} setQn={setQn} setSe={setSe} snap={snap}
                            emPerPlant={emPerPlant} TAW={TAW} Ea={Ea} Sr={Sr} fmt={fmt} />
          <div className={`mt-3 rounded border px-3 py-2 ${meetsTarget ? "border-cyan-300 bg-cyan-50" : "border-amber-300 bg-amber-50"}`}>
            <div className="text-[10px] uppercase tracking-wider text-cyan-800">
              Route A — choose a real dripline product
            </div>
            {pick ? (
              <>
                <div className="mt-1 font-mono text-lg text-slate-900">
                  Sₑ = {fmt(pick.sp, 2)} m @ {fmt(pick.q, 1)} L/h
                  <span className="ml-2 text-xs text-slate-500">
                    ({fmt(pick.perM, 1)} L/h per m of lateral)
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-600">
                  bulb {fmt(pick.w * 100, 0)} cm wide → <strong>{fmt(pick.f * 100, 1)} % overlap</strong> ·
                  {" "}exactly {pick.perPlant} emitter{pick.perPlant > 1 ? "s" : ""} per plant ·
                  {" "}application rate {fmt(pick.I, 2)} mm/h
                </div>
                {!meetsTarget && targetF !== null && (
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-900">
                    This is the best real product available; it reaches {fmt(pick.f * 100, 1)} % against your
                    {" "}{fmt(targetF * 100, 0)} % target. No catalogue dripline that divides {fmt(plantSp, 2)} m
                    can do better on this soil.
                  </p>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                  {fmt(pick.sp, 2)} m divides {fmt(plantSp, 2)} m exactly, so the pattern repeats with no drift.
                  Note the discharge changes with the spacing — real dripline delivers 4–12 L/h per metre of
                  lateral, so a close spacing must carry a small emitter. Keeping {fmt(qn, 1)} L/h at
                  {" "}{fmt(pick.sp, 2)} m would mean {fmt(qn / pick.sp, 0)} L/h per metre, which no manufacturer
                  supplies and which would overrun the lateral velocity limit.
                </p>
                <button onClick={() => { setSe(pick.sp); setQn(pick.q); }}
                  className="mt-2 rounded bg-cyan-700 px-3 py-1 text-[11px] font-medium text-white hover:bg-cyan-800">
                  Apply {fmt(pick.sp, 2)} m @ {fmt(pick.q, 1)} L/h
                </button>
              </>
            ) : (
              <p className="mt-1 text-[11px] text-amber-900">
                No catalogue dripline divides {fmt(plantSp, 2)} m evenly. Adjust the plant spacing, or accept
                emitters that drift relative to the plants.
              </p>
            )}
          </div>

          <div className={`mt-2 rounded border px-3 py-2 ${spFeasible ? "border-slate-300 bg-slate-50" : "border-amber-300 bg-amber-50"}`}>
            <div className="text-[10px] uppercase tracking-wider text-slate-600">
              Route B — one emitter per plant, Sₑ = {fmt(plantSp, 2)} m
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-slate-700">
              The bulb would have to widen from {fmt(w * 100, 0)} to {fmt(wNeededSp * 100, 0)} cm
              (factor {fmt(ratioSp, 2)}), which needs <strong>{fmt(qNeeded, 1)} L/h</strong> emitters at the
              current {fmt(tset, 2)} h set — {fmt(VB, 2)} L per emitter, bulb depth {fmt(zB * 100, 0)} cm.
            </div>
            <div className="mt-2 space-y-0.5 text-[11px]">
              <div className={qOK ? "text-slate-600" : "text-red-700"}>
                {qOK ? "✓" : "✗"} discharge {fmt(qNeeded, 1)} L/h {qOK ? "within" : "above"} the 16 L/h drip limit
              </div>
              <div className={volOK ? "text-slate-600" : "text-red-700"}>
                {volOK ? "✓" : "✗"} event {fmt(VB, 2)} L = {fmt(VB / areaPerEmitter, 1)} mm
                {volOK ? " fits" : ` is ${fmt(VB / VmaxB, 1)}× `} the soil's storage (TAW {fmt(TAW, 2)} mm,
                limit {fmt(VmaxB, 2)} L)
              </div>
              <div className={depthOK ? "text-slate-600" : "text-red-700"}>
                {depthOK ? "✓" : "✗"} front at {fmt(zB * 100, 0)} cm
                {depthOK ? " stays inside" : ` is ${fmt((zB - rootD) * 100, 0)} cm below`} the
                {" "}{fmt(rootD * 100, 0)} cm root zone
              </div>
            </div>
            {spFeasible ? (
              <button onClick={() => { setSe(+plantSp.toFixed(2)); setQn(+qNeeded.toFixed(2)); }}
                className="mt-2 rounded border border-slate-400 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-white">
                Apply {fmt(plantSp, 2)} m spacing with {fmt(qNeeded, 1)} L/h
              </button>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-900">
                <strong>Not a valid option.</strong>{" "}
                {!qOK && "Above roughly 16 L/h this is a micro-sprinkler or bubbler, not drip. "}
                {!volOK && `The event would be ${fmt(VB / VmaxB, 1)}× what the root zone can hold, so most of it drains straight past the roots. `}
                {!depthOK && `The wetting front would reach ${fmt(zB * 100, 0)} cm, ${fmt((zB - rootD) * 100, 0)} cm below the root zone. `}
                Use Route A, add pulses, or accept separate bulbs with one emitter at each plant.
              </p>
            )}
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Duration is the weak lever: w ∝ t<sup>0.22</sup> but z ∝ t<sup>0.63</sup>, so running longer mostly
            drives water below the root zone. Discharge is stronger (w ∝ q<sup>0.39</sup>). Pulsing raises w/z for
            the same volume — set it on the left and re-read this panel.
          </p>
        </>
      )}

      <div className="mt-3 border-t border-dashed border-slate-200 pt-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Reference — overlap area vs spacing</div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
              <th className="py-0.5">Overlap</th><th className="py-0.5 text-right">Sₑ/w</th>
              <th className="py-0.5 text-right">Sₑ (m)</th><th className="py-0.5 text-right">commercial</th>
              <th className="py-0.5 text-right">per plant</th><th className="py-0.5 text-right">merge depth</th>
            </tr>
          </thead>
          <tbody className="font-mono text-slate-700">
            {[0.10, 0.20, 0.25, 0.30, 0.40, 0.45, 0.50, 0.60].map((f) => {
              const kk = W.kForArea(f);
              const ex = kk * w;
              const al = DRIPLINE_SE.filter((v) => {
                const r = plantSp / v;
                return v <= ex + 1e-9 && r >= 1 && Math.abs(r - Math.round(r)) < 0.02;
              });
              const sn = al.length ? al[al.length - 1]
                : (DRIPLINE_SE.filter((v) => v <= ex + 1e-9).pop() ?? DRIPLINE_SE[0]);
              const nEm = plantSp / sn;
              const aligned2 = Math.abs(nEm - Math.round(nEm)) < 0.02;
              return (
                <tr key={f} className="border-t border-slate-100">
                  <td className="py-0.5 font-sans">{(f * 100).toFixed(0)} %</td>
                  <td className="py-0.5 text-right">{fmt(kk, 3)}</td>
                  <td className="py-0.5 text-right">{fmt(ex, 3)}</td>
                  <td className="py-0.5 text-right">{fmt(sn, 2)}</td>
                  <td className={`py-0.5 text-right ${aligned2 ? "" : "text-amber-700"}`}>
                    {aligned2 ? Math.round(nEm) : fmt(nEm, 2)}</td>
                  <td className="py-0.5 text-right">{fmt(z * Math.sqrt(1 - kk * kk) * 100, 0)} cm</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          Typical targets: <strong>15–25 %</strong> for row crops needing a continuous strip;
          <strong> 40–50 %</strong> where a fully wetted bed is wanted, or under salinity where a leached strip
          matters — common in sandy soils and in greenhouse vegetable production;
          <strong> 0 %</strong> for widely spaced orchard trees where separate bulbs are intended.
          Higher overlap costs emitters and increases drainage at the midpoint.
        </p>
      </div>
    </Panel>
  );
}

/* ---- can the three constraints hold together? ---- */

function FeasibilityCheck({ W, plantSp, rootD, Ks_mh, target, qn, setQn, setSe,
                            snap, emPerPlant, TAW, Ea, Sr, fmt }) {
  if (target === null) return null;

  const wOf = (q, t, N) => {
    const Q = q / 1000, V = (Q * t) / N;
    return 1.82 * Math.pow(V, 0.22) * Math.pow(Q / Ks_mh, 0.17) * Math.pow(N, 0.07);
  };
  const zOf = (q, t, N) => {
    const Q = q / 1000, V = (Q * t) / N;
    return 2.54 * Math.pow(V, 0.63) * Math.pow(Ks_mh / Q, 0.45) * Math.pow(N, 0.18);
  };

  /* Agronomic ceiling: an event cannot usefully exceed what the managed root
     zone can hold. Anything beyond TAW drains past the roots.               */
  const areaPerEmitter = plantSp * Sr;                       // m2
  const Vmax = (TAW / Math.max(Ea, 0.01)) * areaPerEmitter;  // litres per emitter
  const depthOf = (V) => V / Math.max(areaPerEmitter, 1e-6); // mm gross

  let best = 0, bestCfg = null;
  for (const q of [1, 2, 4, 6, 8, 12, 16]) {
    for (const N of [1, 2, 4, 6]) {
      // longest set that satisfies BOTH the depth limit and the volume limit
      const tVol = Vmax / q;
      let lo = 0.02, hi = Math.min(48, tVol);
      if (hi <= lo) continue;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (zOf(q, mid, N) <= rootD) lo = mid; else hi = mid;
      }
      if (lo <= 0.03) continue;
      const ov = W.fovOf(Math.min(1, plantSp / wOf(q, lo, N)));
      if (ov > best) { best = ov; bestCfg = { q, N, t: lo, V: q * lo, w: wOf(q, lo, N), z: zOf(q, lo, N) }; }
    }
  }

  const ok = best >= target;
  return (
    <div className={`mt-3 rounded border px-3 py-2 ${ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
      <div className={`text-[10px] uppercase tracking-wider ${ok ? "text-emerald-800" : "text-red-800"}`}>
        Feasibility — one emitter per plant at {fmt(plantSp, 2)} m
      </div>
      <div className="mt-1 font-mono text-[10px] text-slate-500">
        constraints: q ≤ 16 L/h · z ≤ {fmt(rootD * 100, 0)} cm · event ≤ TAW = {fmt(TAW, 2)} mm
        (V ≤ {fmt(Vmax, 2)} L per emitter)
      </div>
      {ok && bestCfg ? (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
          Achievable. Up to <strong>{fmt(best * 100, 1)} %</strong> overlap while keeping the front inside the root
          zone and the event within the soil's storage — at {bestCfg.q} L/h, {bestCfg.N} pulse{bestCfg.N > 1 ? "s" : ""},
          {" "}{fmt(bestCfg.t, 2)} h ({fmt(bestCfg.V, 2)} L = {fmt(depthOf(bestCfg.V), 1)} mm,
          bulb {fmt(bestCfg.w * 100, 0)} × {fmt(bestCfg.z * 100, 0)} cm).
          <button onClick={() => { setQn(bestCfg.q); setSe(+plantSp.toFixed(2)); }}
            className="ml-2 rounded border border-emerald-500 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-white">
            Apply
          </button>
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
            <strong>Not achievable on this soil.</strong> The most reachable at {fmt(plantSp, 2)} m spacing is
            {" "}<strong>{fmt(best * 100, 1)} %</strong> against your {fmt(target * 100, 0)} % target
            {bestCfg && <> ({bestCfg.q} L/h, {fmt(bestCfg.t, 2)} h, {fmt(bestCfg.V, 2)} L, bulb
              {" "}{fmt(bestCfg.w * 100, 0)} × {fmt(bestCfg.z * 100, 0)} cm)</>}.
            A wider bulb needs more water, and on a soil this coarse the extra water goes down rather than sideways —
            width grows as V<sup>0.22</sup> but depth as V<sup>0.63</sup>.
          </p>
          <div className="mt-2 text-[11px] leading-relaxed text-slate-700">
            One of the constraints has to give:
            <ul className="mt-1 space-y-1">
              <li>• <strong>Drop “one emitter per plant”</strong> — use {fmt(snap, 2)} m dripline,
                {" "}{Math.round(emPerPlant)} emitters per plant. The normal answer on sandy soils, and agronomically free.</li>
              <li>• <strong>Accept {fmt(best * 100, 0)} % overlap</strong>, treating each plant as a separate bulb.</li>
              <li>• <strong>Irrigate less often with larger events</strong> — raises TAW's role but only if the root zone
                can store it. On this soil TAW is just {fmt(TAW, 2)} mm, which is why events must stay small.</li>
              <li>• <strong>Accept deep percolation</strong> — reachable, but the front passes the root zone and leaches
                nitrate. Defensible only where leaching is wanted for salinity control.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- engineering-drawing bulb section ---------------- */

function BulbDrawing({ w, z, zOv, Se, rootD, r0 }) {
  const VW = 700, VH = 340, surfaceY = 70;
  const span = Math.max(w * 2 + Se * 1.4, Se * 2.6, 1.2);
  const depthSpan = Math.max(z * 1.5, rootD * 1.5, 0.6);
  const s = Math.min((VW - 120) / span, (VH - surfaceY - 50) / depthSpan);
  const cx1 = VW / 2 - (Se * s) / 2, cx2 = VW / 2 + (Se * s) / 2;
  const rx = (w / 2) * s, ry = z * s, rootY = surfaceY + rootD * s;
  const mid = VW / 2, ovY = surfaceY + (zOv || 0) * s;

  const Dim = ({ x1, x2, y, label }) => (
    <g stroke="#334155" strokeWidth="1">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <text x={(x1 + x2) / 2} y={y - 6} fontSize="11" textAnchor="middle" fill="#334155" stroke="none"
            fontFamily="ui-monospace, monospace">{label}</text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" role="img" aria-label="Wetted bulb cross-section">
      <defs><clipPath id="belowGround"><rect x="0" y={surfaceY} width={VW} height={VH - surfaceY} /></clipPath></defs>
      <rect x="0" y={surfaceY} width={VW} height={VH - surfaceY} fill="#f5f0e6" />
      <g clipPath="url(#belowGround)">
        {[cx1, cx2].map((cx, i) => (
          <g key={i}>
            <ellipse cx={cx} cy={surfaceY} rx={rx} ry={ry} fill="#0e7490" opacity="0.18" />
            <ellipse cx={cx} cy={surfaceY} rx={rx * 0.62} ry={ry * 0.62} fill="#0e7490" opacity="0.22" />
            <ellipse cx={cx} cy={surfaceY} rx={rx} ry={ry} fill="none" stroke="#0e7490" strokeWidth="1.5" />
          </g>
        ))}
        <line x1="0" y1={rootY} x2={VW} y2={rootY} stroke="#a16207" strokeWidth="1.5" strokeDasharray="7 4" />
        <text x={VW - 8} y={rootY - 5} fontSize="10" textAnchor="end" fill="#a16207"
              fontFamily="ui-monospace, monospace">root zone {(rootD * 100).toFixed(0)} cm</text>
        {zOv > 0 && (
          <g>
            <line x1={mid} y1={surfaceY} x2={mid} y2={ovY} stroke="#0f766e" strokeWidth="2" />
            <line x1={mid - 26} y1={ovY} x2={mid + 26} y2={ovY} stroke="#0f766e" strokeWidth="1.5" />
            <text x={mid + 32} y={ovY + 4} fontSize="10" fill="#0f766e"
                  fontFamily="ui-monospace, monospace">join to {(zOv * 100).toFixed(0)} cm</text>
          </g>
        )}
        {zOv < z && (
          <text x={mid} y={surfaceY + (zOv + (z - zOv) / 2) * s} fontSize="10" textAnchor="middle"
                fill="#b45309" fontFamily="ui-monospace, monospace">dry wedge</text>
        )}
      </g>
      <line x1="0" y1={surfaceY} x2={VW} y2={surfaceY} stroke="#1e293b" strokeWidth="2" />
      {Array.from({ length: 35 }).map((_, i) => (
        <line key={i} x1={i * 20} y1={surfaceY} x2={i * 20 - 7} y2={surfaceY - 7} stroke="#94a3b8" strokeWidth="1" />
      ))}
      {[cx1, cx2].map((cx, i) => (
        <g key={i}>
          <rect x={cx - 7} y={surfaceY - 16} width="14" height="14" fill="#1e293b" rx="2" />
          <ellipse cx={cx} cy={surfaceY} rx={Math.max(3, r0 * s)} ry={Math.max(1.5, r0 * s * 0.35)} fill="#0e7490" />
        </g>
      ))}
      <line x1={cx1} y1={surfaceY - 30} x2={cx2} y2={surfaceY - 30} stroke="#334155" strokeWidth="1" />
      <Dim x1={cx1} x2={cx2} y={surfaceY - 30} label={`Sₑ = ${Se.toFixed(2)} m`} />
      <Dim x1={cx1 - rx} x2={cx1 + rx} y={VH - 22} label={`w = ${(w * 100).toFixed(0)} cm`} />
      <line x1={cx1 - rx} y1={surfaceY} x2={cx1 - rx} y2={VH - 22} stroke="#94a3b8" strokeWidth="0.75" strokeDasharray="3 3" />
      <line x1={cx1 + rx} y1={surfaceY} x2={cx1 + rx} y2={VH - 22} stroke="#94a3b8" strokeWidth="0.75" strokeDasharray="3 3" />
      <g stroke="#334155" strokeWidth="1">
        <line x1={VW - 40} y1={surfaceY} x2={VW - 40} y2={surfaceY + ry} />
        <line x1={VW - 46} y1={surfaceY} x2={VW - 34} y2={surfaceY} />
        <line x1={VW - 46} y1={surfaceY + ry} x2={VW - 34} y2={surfaceY + ry} />
        <text x={VW - 34} y={surfaceY + ry / 2} fontSize="11" fill="#334155" stroke="none"
              fontFamily="ui-monospace, monospace">z = {(z * 100).toFixed(0)} cm</text>
      </g>
    </svg>
  );
}
