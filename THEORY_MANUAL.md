# Manual 2 — Theory and Equations

**Drip Irrigation Design Workbench**
Every equation implemented in the code, with symbols defined, units stated, and provenance given.

Each section names the function or block in `src/DripDesign.jsx` that implements it, so the
document can be checked against the source line by line.

---

## Contents

1. [Notation](#1-notation)
2. [Soil hydraulic functions](#2-soil-hydraulic-functions)
3. [Emitter hydraulics and uniformity](#3-emitter-hydraulics-and-uniformity)
4. [Pipe flow and friction](#4-pipe-flow-and-friction)
5. [Network solution](#5-network-solution)
6. [Pump and total dynamic head](#6-pump-and-total-dynamic-head)
7. [Crop water demand](#7-crop-water-demand)
8. [Root-zone water balance and scheduling](#8-root-zone-water-balance-and-scheduling)
9. [Emitter discharge as a boundary condition](#9-emitter-discharge-as-a-boundary-condition)
10. [Wetting front geometry](#10-wetting-front-geometry)
11. [Overlap between adjacent bulbs](#11-overlap-between-adjacent-bulbs)
12. [Fertigation](#12-fertigation)
13. [Numerical methods](#13-numerical-methods)
14. [Assumptions, and what is not literature](#14-assumptions-and-what-is-not-literature)
15. [References](#15-references)

---

## 1. Notation

### Soil

| Symbol | Meaning | Unit |
|---|---|---|
| θ | Volumetric water content | cm³ cm⁻³ |
| θr, θs | Residual, saturated water content | cm³ cm⁻³ |
| θ_FC, θ_WP, θᵢ | At field capacity, wilting point, initial | cm³ cm⁻³ |
| h | Pressure head (negative when unsaturated) | cm |
| Se | Effective saturation | – |
| α | van Genuchten inverse air-entry parameter | cm⁻¹ |
| n, m | Pore-size distribution index; m = 1 − 1/n | – |
| l | Mualem pore-connectivity parameter | – |
| Ks, K(h) | Saturated and unsaturated hydraulic conductivity | cm d⁻¹ |
| φ | Matric flux potential | cm² d⁻¹ |
| λc | Macroscopic capillary length | cm |
| α_eff | Effective Gardner parameter, 1/λc | cm⁻¹ |
| Δθ | Water content change on wetting | cm³ cm⁻³ |
| AWC | Available water capacity, θ_FC − θ_WP | cm³ cm⁻³ |

### Hydraulics

| Symbol | Meaning | Unit |
|---|---|---|
| q, qₙ | Emitter discharge, nominal discharge | L h⁻¹ |
| h, hₙ | Emitter pressure head, nominal head | m |
| k, x | Emitter coefficient and exponent | – |
| CV | Manufacturing coefficient of variation | – |
| n_e | Emitters per plant | – |
| EU | Emission uniformity | % |
| Q | Volumetric flow rate | m³ s⁻¹ |
| D, L | Inside diameter, length | m |
| V | Mean velocity | m s⁻¹ |
| Re | Reynolds number | – |
| f | Darcy friction factor | – |
| ε | Absolute pipe roughness | m |
| ν | Kinematic viscosity | m² s⁻¹ |
| h_f | Head loss | m |
| k_l | Local loss multiplier for emitter barbs | – |
| S₀ | Slope, positive downhill in the flow direction | m m⁻¹ |
| TDH | Total dynamic head | m |
| η | Pump efficiency | – |

### Agronomy

| Symbol | Meaning | Unit |
|---|---|---|
| ET₀, ETc | Reference and crop evapotranspiration | mm d⁻¹ |
| Kc | Crop coefficient | – |
| Zr | Rooting depth | m |
| TAW, RAW | Total and readily available water | mm |
| p, p_adj | Depletion fraction, table and adjusted | – |
| Dr | Root-zone depletion | mm |
| f_w | Managed wetted fraction | – |
| Ea | Application efficiency | – |
| LR | Leaching fraction | – |
| I | Application rate | mm h⁻¹ |
| Sₑ, Sr | Emitter spacing, row spacing | m |
| n_shifts | Number of sequential irrigation shifts | – |
| T_max | Maximum daily operating hours | h |

### Wetting front

| Symbol | Meaning | Unit |
|---|---|---|
| w, z | Bulb width and depth | m |
| V | Water volume applied per emitter per event | m³ |
| r₀, r_w | Assumed and Wooding source radius | cm |
| q₀ | Applied surface flux | cm h⁻¹ |
| k | Normalised spacing, Sₑ/w | – |
| z_ov | Depth to which adjacent bulbs merge | m |
| f_ov | Overlap area fraction | – |
| P | Wetted fraction of the soil surface | – |

---

## 2. Soil hydraulic functions

*Implemented in `seOfH`, `thetaOfH`, `kOfSe`, `kOfH`, `matricFluxPotential`, block `S`.*

### 2.1 van Genuchten retention

van Genuchten (1980):

$$S_e(h)=\left[1+\left|\alpha h\right|^{n}\right]^{-m},\qquad h<0$$

$$S_e=1 \quad\text{for } h\ge0$$

with the Mualem restriction

$$m=1-\frac{1}{n}$$

Water content follows from effective saturation:

$$\theta(h)=\theta_r+(\theta_s-\theta_r)\,S_e(h)$$

### 2.2 Mualem conductivity

Mualem (1976) combined with the van Genuchten retention curve:

$$K(S_e)=K_s\,S_e^{\,l}\left[1-\left(1-S_e^{1/m}\right)^{m}\right]^{2}$$

The exponent l is the pore-connectivity parameter, conventionally 0.5 for mineral soils. It is
exposed as an input because engineered substrates frequently require a different value, and it
influences the shape of K(h) near saturation, which in turn controls the capillary length in
Section 2.4.

### 2.3 Characteristic water contents

| Quantity | Definition | Default head |
|---|---|---|
| θ_FC | θ at the field-capacity head | −100 cm (user-set) |
| θ_WP | θ at the wilting-point head | −15000 cm (fixed) |
| θᵢ | θ at the initial head | −800 cm (user-set) |

$$\text{AWC}=\theta_{FC}-\theta_{WP},\qquad \Delta\theta=\theta_{FC}-\theta_i$$

AWC drives the water balance (Section 8). Δθ drives the mass-balance bulb (Section 10.4). The
field-capacity head is a convention, not a physical constant: −60 to −100 cm is usual for coarse
soils, −330 cm for fine ones.

### 2.4 Matric flux potential and capillary length

The matric flux potential, sometimes called the Kirchhoff transform, is

$$\phi=\int_{-\infty}^{0}K(h)\,\mathrm{d}h \qquad [\mathrm{cm^2\,d^{-1}}]$$

The macroscopic capillary length follows as

$$\lambda_c=\frac{\phi}{K_s}\qquad[\mathrm{cm}],\qquad \alpha_{\text{eff}}=\frac{1}{\lambda_c}$$

**Why this matters.** λc is the length scale over which capillarity competes with gravity. A short
λc means gravity dominates and the bulb is narrow and deep; a long λc means capillarity spreads
water laterally and the bulb is wide and shallow. It is the single number that determines bulb
shape.

**Why it is integrated rather than substituted.** For a Gardner exponential conductivity
K = Ks exp(αh) the integral evaluates to φ = Ks/α exactly, so λc = 1/α. It is therefore tempting to
substitute α_vG directly. That is wrong: the van Genuchten–Mualem K(h) falls off far faster than
Gardner's exponential, so most of the integral accumulates close to saturation and the resulting λc
is substantially shorter than 1/α_vG. For the Loam preset, 1/α_vG = 27.8 cm but the integrated
λc = 6.9 cm — a factor of four. Integrating also means θr, n and l all propagate into the bulb
geometry rather than being decorative.

**Numerical evaluation.** The integral is computed on a log-spaced grid in |h| from 10⁻² to 10⁵ cm
using 800 intervals with geometric-midpoint sampling, plus an analytic sliver Ks × 10⁻² for the
near-saturated region:

$$\phi\approx K_s\times10^{-2}+\sum_{i=1}^{800}K\!\left(-\sqrt{a_i b_i}\right)\left(b_i-a_i\right)$$

where a_i and b_i are consecutive grid points. Reference value for Loam: φ = 172.7 cm² d⁻¹.

### 2.5 Soil database

Twelve textural classes from Carsel & Parrish (1988), the same set distributed with HYDRUS, plus a
**Custom** entry for materials outside that table.

| Class | θr | θs | α (cm⁻¹) | n | Ks (cm d⁻¹) |
|---|---|---|---|---|---|
| Sand | 0.045 | 0.430 | 0.145 | 2.68 | 712.8 |
| Loamy sand | 0.057 | 0.410 | 0.124 | 2.28 | 350.2 |
| Sandy loam | 0.065 | 0.410 | 0.075 | 1.89 | 106.1 |
| Loam | 0.078 | 0.430 | 0.036 | 1.56 | 24.96 |
| Silt loam | 0.067 | 0.450 | 0.020 | 1.41 | 10.80 |
| Silt | 0.034 | 0.460 | 0.016 | 1.37 | 6.00 |
| Sandy clay loam | 0.100 | 0.390 | 0.059 | 1.48 | 31.44 |
| Clay loam | 0.095 | 0.410 | 0.019 | 1.31 | 6.24 |
| Silty clay loam | 0.089 | 0.430 | 0.010 | 1.23 | 1.68 |
| Sandy clay | 0.100 | 0.380 | 0.027 | 1.23 | 2.88 |
| Silty clay | 0.070 | 0.360 | 0.005 | 1.09 | 0.48 |
| Clay | 0.068 | 0.380 | 0.008 | 1.09 | 4.80 |

All use l = 0.5.

---

## 3. Emitter hydraulics and uniformity

*Implemented in `marchLateral` and block `H`.*

### 3.1 Discharge–pressure relation

$$q=k\,h^{x}$$

q in L h⁻¹, h in m. The coefficient is fixed by the catalogue pair (qₙ, hₙ):

$$k=\frac{q_n}{h_n^{\,x}}$$

The exponent x characterises the flow regime inside the emitter:

| x | Emitter type |
|---|---|
| 0.5 | Orifice or nozzle, fully turbulent |
| 0.6–0.7 | Vortex and short-path |
| 0.7–0.8 | Long-path laminar |
| 0 to 0.2 | Pressure-compensating |

Since Δq/q ≈ x·Δh/h, x is exactly the sensitivity of discharge to pressure variation. A 20 % head
variation gives 10 % discharge variation at x = 0.5, but only about 2 % at x = 0.1.

### 3.2 Emission uniformity

Keller & Karmeli (1974), as adopted in ASABE EP405:

$$EU=100\left(1-\frac{1.27\,CV}{\sqrt{n_e}}\right)\frac{q_{min}}{\bar q}$$

The first bracket is the manufacturing contribution, reduced by averaging over n_e emitters per
plant. The ratio q_min/q̄ is the hydraulic contribution, obtained from the stepwise solution rather
than assumed.

Two auxiliary indicators:

$$\Delta q=100\,\frac{q_{max}-q_{min}}{\bar q},\qquad \Delta h=100\,\frac{h_{max}-h_{min}}{h_n}$$

**Design criteria:** EU ≥ 90 %, Δq ≤ 10 %, and Δh summed over lateral and manifold ≤ 20 % of hₙ.

---

## 4. Pipe flow and friction

*Implemented in `frictionFactor`, `headLoss`, `velocity`.*

### 4.1 Velocity and Reynolds number

$$V=\frac{4Q}{\pi D^{2}},\qquad Re=\frac{VD}{\nu}$$

with ν = 1.003 × 10⁻⁶ m² s⁻¹ (water at 20 °C).

### 4.2 Friction factor, by regime

Drip laterals sit in the laminar-to-smooth-turbulent transition, so a single correlation will not
serve. Three regimes are switched:

$$f=\begin{cases}
\dfrac{64}{Re}, & Re<2000 \quad\text{(Hagen–Poiseuille)}\\[2ex]
0.316\,Re^{-0.25}, & 2000\le Re<10^{5} \quad\text{(Blasius)}\\[2ex]
\dfrac{0.25}{\left[\log_{10}\!\left(\dfrac{\varepsilon}{3.7D}+\dfrac{5.74}{Re^{0.9}}\right)\right]^{2}}, & Re\ge10^{5}\quad\text{(Swamee–Jain)}
\end{cases}$$

with ε = 1.5 × 10⁻⁶ m for PE and PVC.

**Why not Hazen–Williams.** The Hazen–Williams formula with C = 150 is calibrated for fully
turbulent flow in larger pipes. In 12–25 mm drip tubing at 0.3–1.5 m s⁻¹ the flow is often below
Re = 10⁴, where H–W is not valid and overestimates losses near the distal end.

### 4.3 Darcy–Weisbach

$$h_f=f\,\frac{L}{D}\,\frac{V^{2}}{2g}$$

### 4.4 The collapsed microirrigation form

For reference only — the code uses the full switched form above. Substituting Blasius and
V = 4Q/(πD²) into Darcy–Weisbach gives

$$h_f=\frac{0.316\times8}{\pi^{2}g}\left(\frac{4}{\pi\nu}\right)^{-0.25}Q^{1.75}D^{-4.75}L
=7.78\times10^{-4}\,Q^{1.75}D^{-4.75}L$$

with Q in m³ s⁻¹, D in m, L and h_f in m, at 20 °C. This is the familiar h_f ∝ Q^1.75 D^-4.75 form
of microirrigation textbooks.

### 4.5 Local losses at emitter connections

In-line and on-line emitters obstruct the bore. Rather than an equivalent length per barb, a single
multiplier is applied to every lateral segment:

$$h_{f,\text{segment}}=k_l\,f\,\frac{S_e}{D}\,\frac{V^{2}}{2g}$$

Typical k_l is 1.05 for thin-wall tape to 1.30 for bulky on-line emitters; the default is 1.10.
The manifold uses a fixed 1.03 for tees.

---

## 5. Network solution

*Implemented in `marchLateral`, `bisect`, block `H`.*

### 5.1 Why stepwise rather than the F factor

The classical approach applies the Christiansen reduction factor

$$F=\frac{1}{m+1}+\frac{1}{2N}+\frac{\sqrt{m-1}}{6N^{2}}$$

to the head loss of a pipe carrying the full flow along its whole length. This assumes every outlet
discharges equally — which is precisely what is being solved for. Because q depends on h and h
depends on the accumulated q, the problem is coupled, and F is a first approximation to its
solution.

The Workbench solves the coupling directly. F is not used anywhere in the code; if you wish to
compare, the classical inlet-head estimate h_in ≈ h_a + ¾h_f + ½Δz becomes a check rather than the
design method.

### 5.2 The upstream march

Number emitters 1 (nearest the inlet) to N (distal), spaced Sₑ apart, with one further segment of
length Sₑ between emitter 1 and the lateral inlet. Given a trial head h_N at the distal emitter,
march upstream. For i = N, N−1, …, 1:

$$q_i=k\,h_i^{\,x}$$

$$Q_i=\sum_{j\ge i}q_j$$

$$h_{i-1}=h_i+k_l\,h_f\!\left(Q_i,D,S_e\right)-S_e S_0$$

with a floor of h ≥ 0.05 m to keep the iteration stable. The sign convention is that S₀ is positive
downhill in the direction of flow, so a downhill lateral *reduces* the required inlet head.

After emitter 1, one more segment gives the lateral inlet head h_in and the lateral discharge
Q_lat = Q₁.

### 5.3 Closure by bisection

The march requires h_N, which is unknown. The physical condition imposed is that the **mean emitter
discharge equals the nominal discharge**:

$$\bar q(h_N)=\frac{1}{N}\sum_{i=1}^{N}q_i \;\overset{!}{=}\; q_n$$

q̄ is monotonically increasing in h_N, so bisection converges reliably. Seventy iterations on the
bracket [0.05, 400] m reduce the interval to about 3 × 10⁻¹⁹ m — far beyond any physical need, but
the cost is negligible.

Choosing q̄ = qₙ as the closure means the block delivers its design flow rate; the pressures then
follow. The alternative closure, h̄ = hₙ, is equally valid and gives a slightly different inlet head.

### 5.4 The lateral as an equivalent emitter

The manifold sees each lateral as an outlet whose discharge depends on its inlet head. Rather than
nesting the lateral solve inside every manifold step, the lateral is fitted to a power law of the
same form as an emitter:

$$Q_{lat}=K_l\,h^{\,x_l}$$

Two solves suffice. Let (h₁, Q₁) be the design solution and (h₂, Q₂) the solution at
h₂ = 1.25 h₁. Then

$$x_l=\frac{\ln\!\left(Q_2/Q_1\right)}{\ln 1.25},\qquad K_l=\frac{Q_1}{h_1^{\,x_l}}$$

For the reference case x_l = 0.509 — slightly above the emitter exponent of 0.5, because friction
along the lateral adds a small additional pressure sensitivity.

### 5.5 Manifold and mainline

The manifold is solved by the identical march, with:

- outlet spacing = row spacing Sr,
- outlet discharge law Q = (K_l · n_sides) h^x_l, where n_sides is 2 when laterals run both ways,
- number of outlets N_m = N_lat / n_sides,
- local loss multiplier 1.03.

The mainline carries the whole block flow in a single reach, so a direct Darcy–Weisbach evaluation
suffices:

$$Q_{sys}=Q_{man}\times n_{blocks,\ simultaneous},\qquad h_{f,main}=f\frac{L}{D}\frac{V^{2}}{2g}$$

### 5.6 Velocity limits

| Component | Limit |
|---|---|
| Lateral | ≤ 1.5 m s⁻¹ preferred, 2.0 absolute |
| Manifold | ≤ 2.0 m s⁻¹ |
| Mainline | ≤ 2.0 m s⁻¹ |

Above about 2 m s⁻¹ water-hammer risk and friction cost both rise steeply.

---

## 6. Pump and total dynamic head

*Implemented in block `H`.*

$$TDH=\left(h_{in,man}+h_{f,main}+\Delta z_{static}+h_{filter}\right)\left(1+\frac{\text{fittings \%}}{100}\right)$$

| Term | Meaning | Typical |
|---|---|---|
| h_in,man | Manifold inlet head from the network solve | 10–20 m |
| h_f,main | Mainline friction | 1–5 m |
| Δz_static | Elevation from source to manifold | site |
| h_filter | Filter plus fertigation injector | 3 m clean, 7 m dirty |
| fittings | Valves, bends, tees | 10 % |

Shaft power:

$$P=\frac{\rho g\,Q_{sys}\,TDH}{\eta}=\frac{9.81\,Q_{sys}\,TDH}{\eta}\ \ [\mathrm{kW}]$$

with Q_sys in m³ s⁻¹, TDH in m, and η the wire-to-water efficiency as a fraction. The constant 9.81
already carries the kN m⁻³ unit weight of water, so the result is kilowatts directly.

---

## 7. Crop water demand

*Implemented in `monthlyToDaily`, `kcAt`, `zrAt`, `parseSeries`, block `SCH`.*

### 7.1 Three input routes

| Method | Formula |
|---|---|
| Monthly ET₀ × Kc | ETc(t) = ET₀_interp(DOY) × Kc(t) |
| Pasted daily ET₀ | ETc(t) = ET₀(t) × Kc(t) |
| Pasted daily ETc | ETc(t) used directly |

### 7.2 Monthly to daily interpolation

Each monthly mean is assigned to the mid-day of its month, using the day-of-year values
15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349. Between consecutive mid-days the value is
linearly interpolated:

$$ET_0(d)=ET_{0,i_0}+\frac{d-d_0}{d_1-d_0}\left(ET_{0,i_1}-ET_{0,i_0}\right)$$

with wrap-around at the December–January boundary handled by offsetting d₀ or d₁ by 365 days.

### 7.3 FAO-56 crop coefficient curve

The four-stage piecewise curve of Allen et al. (1998), with t the days after planting:

$$K_c(t)=\begin{cases}
K_{c,ini}, & 0\le t<L_{ini}\\[1ex]
K_{c,ini}+\left(K_{c,mid}-K_{c,ini}\right)\dfrac{t-L_{ini}}{L_{dev}}, & L_{ini}\le t<L_{ini}+L_{dev}\\[2ex]
K_{c,mid}, & L_{ini}+L_{dev}\le t<L_{ini}+L_{dev}+L_{mid}\\[1ex]
K_{c,mid}+\left(K_{c,end}-K_{c,mid}\right)\dfrac{t-\sum L}{L_{late}}, & \text{late stage}
\end{cases}$$

Season length is the sum of the four stage lengths.

### 7.4 Root growth

$$Z_r(t)=Z_{r,min}+\left(Z_{r,max}-Z_{r,min}\right)\min\!\left(1,\frac{t}{L_{ini}+L_{dev}}\right)$$

Roots reach full depth at the end of the development stage. This is a common simplification; the
consequence in the balance is that TAW grows through the first half of the season, so event depths
increase while the interval stays roughly constant.

### 7.5 Demand statistics

From the daily series, six summary values are computed:

| Statistic | Definition |
|---|---|
| Minimum | Smallest ETc above 0.01 mm d⁻¹ |
| Mean | Arithmetic mean over the season |
| Peak 7-day mean | Maximum of all 7-day running means |
| Peak month mean | Maximum of the calendar-month means |
| 95th percentile | Order statistic at rank 0.95(N−1) |
| Maximum | Largest single day |

Any one may be selected as the **design ETc**, or a manual value entered.

---

## 8. Root-zone water balance and scheduling

*Implemented in block `SCH`.*

### 8.1 Application efficiency and rate

$$E_a=\frac{EU}{100}\left(1-\frac{LR}{100}\right)$$

$$I=\frac{q_n\,n_e}{S_e\,S_r}\qquad[\mathrm{mm\,h^{-1}}]$$

The application rate identity holds because 1 L h⁻¹ spread over 1 m² is exactly 1 mm h⁻¹.

### 8.2 Available water

$$TAW=1000\left(\theta_{FC}-\theta_{WP}\right)Z_r\,f_w\qquad[\mathrm{mm}]$$

FAO-56 Equation 82 gives TAW without f_w. **The multiplication by the managed wetted fraction is an
adaptation for localised irrigation, not a formula from FAO-56.** Under drip only part of the root
zone is wetted, so only that part constitutes a usable reservoir. f_w should be set to match the
wetted fraction P computed on the Wetting front tab.

$$RAW=p_{adj}\,TAW$$

### 8.3 Depletion fraction adjustment

FAO-56 Equation 83:

$$p_{adj}=p+0.04\left(5-ET_c\right),\qquad 0.1\le p_{adj}\le0.8$$

The trigger tightens as evaporative demand rises: at ETc = 14 mm d⁻¹ the adjustment drives p to its
0.1 floor, so irrigation becomes daily. This is the mechanism that makes high-demand climates
irrigate frequently in small doses, and it has an important consequence for capacity — see
Section 8.6.

### 8.4 Deliverable capacity

$$n_{shifts}=\left\lceil\frac{N_{blocks,\ total}}{N_{blocks,\ simultaneous}}\right\rceil$$

$$T_{block}=\frac{T_{max}}{n_{shifts}},\qquad D_{max}=I\cdot T_{block}$$

D_max is the largest gross depth one block can receive in one day.

### 8.5 The daily recursion

For each day t:

1. **Demand and rainfall**

$$D_r \leftarrow \max\!\left(0,\;D_r+ET_c(t)-P_{eff}(t)\right)$$

2. **Trigger test.** If D_r ≥ RAW and RAW > 0:

$$G_{req}=\frac{D_r}{E_a},\qquad G_{app}=\min\!\left(G_{req},\,D_{max}\right),\qquad
t_{set}=\frac{G_{app}}{I}$$

$$D_r \leftarrow \max\!\left(0,\;D_r-G_{app}E_a\right)$$

If G_app < G_req the day is flagged **capacity-limited** and the shortfall G_req − G_app is
accumulated as unmet demand.

3. **Cap and diagnose**

$$D_r\leftarrow\min\left(D_r,\,TAW\right)$$

A day ending with D_r > RAW is counted as a **stress day**.

**The distinction matters.** A capacity-limited day is a scheduling constraint; a stress day is an
agronomic consequence. In the reference case there are 10 capacity-limited days and 0 stress days,
because each shortfall is recovered the following morning. The check is deliberately conservative.

### 8.6 Capacity feasibility and inversion

Hours per day the whole system must run to meet a given demand:

$$T_{req}(ET_c)=\frac{ET_c}{E_a\,I}\,n_{shifts}$$

Feasible when T_req ≤ T_max. Inverting for the application rate and hence the emitter needed:

$$I_{req}=\frac{ET_c}{E_a\,T_{block}},\qquad q_{req}=\frac{I_{req}\,S_e\,S_r}{n_e}$$

**The constraint is a valley, not a slope.** The required event depth is whichever is larger — the
readily available water, or one day's demand:

$$G_{req}\approx\frac{\max\left(RAW,\;ET_c\right)}{E_a}$$

At low ETc, p_adj rises toward 0.8, RAW grows, the interval stretches, and events become large. At
high ETc, p_adj hits its 0.1 floor, the interval collapses to one day, and the event equals a full
day's demand. Both extremes can exceed D_max, while the middle range is safe. For the reference
configuration the safe window is roughly 2.4 to 17.5 mm d⁻¹.

This explains a result that appears paradoxical: a temperate design with 4 sequential blocks is
capacity-limited on 10 days, while an arid design at 16 mm d⁻¹ is limited on none. Sizing on peak
seasonal demand alone would not detect it.

---

## 9. Emitter discharge as a boundary condition

*Implemented in `woodingRadius`, block `FX`.*

This section converts a catalogue discharge into the boundary condition a Richards solver requires.

### 9.1 Point source flux

$$Q=q_n\times1000\ \ [\mathrm{cm^3\,h^{-1}}],\qquad A_0=\pi r_0^{2},\qquad q_0=\frac{Q}{A_0}\ \ [\mathrm{cm\,h^{-1}}]$$

Unit conversions offered:

| Target | Conversion |
|---|---|
| HYDRUS with hours | q₀ (cm h⁻¹) |
| HYDRUS with minutes | q₀ / 60 |
| mm h⁻¹ | q₀ × 10 |
| m s⁻¹ | q₀ / 100 / 3600 |

### 9.2 The ponding criterion

$$q_0\le K_s \;\Rightarrow\; \text{constant-flux Neumann boundary over } r_0 \text{ is valid}$$

$$q_0>K_s \;\Rightarrow\; \text{the soil cannot absorb the discharge over that area; water ponds}$$

**This is the most common error in drip modelling.** For a 2.3 L h⁻¹ emitter on loam with r₀ = 3 cm,
q₀ = 81.3 cm h⁻¹ against Ks = 1.04 cm h⁻¹ — a ratio of 78. The assumed radius is physically
impossible, and a fixed-flux boundary over it will bias the bulb badly.

### 9.3 Wooding's steady solution

Wooding (1968) for steady infiltration from a shallow circular pond of radius r on a soil with
Gardner exponential conductivity:

$$Q=\pi r^{2}K_s\left(1+\frac{4}{\pi\alpha r}\right)$$

The first term is the gravity-driven flux through the disc; the second is the capillary contribution
drawn laterally from the perimeter, which scales with the capillary length. Solving for r gives the
radius at which a saturated disc can just absorb Q at steady state.

Solved by Newton–Raphson:

$$F(r)=\pi r^{2}K_s\left(1+\frac{4}{\pi\alpha r}\right)-Q,\qquad
F'(r)=2\pi rK_s+\frac{4K_s}{\alpha}$$

$$r_{k+1}=\max\!\left(10^{-4},\;r_k-\frac{F(r_k)}{F'(r_k)}\right)$$

from r₀ = 1 cm, 80 iterations. α here is α_eff from Section 2.4, **not** α_vG.

The effective flux at that radius is q_w = Q/(πr_w²), which necessarily exceeds Ks because the
capillary term contributes.

### 9.4 Line source

When emitters are close enough that their sources merge, the correct idealisation is a line source
of strength

$$Q_L=\frac{q_n\times1000}{S_e\times100}\qquad[\mathrm{cm^2\,h^{-1}}]$$

applied over a strip of half-width b = max(r₀, r_w), giving a planar two-dimensional flux

$$q_{line}=\frac{Q_L}{2b}\qquad[\mathrm{cm\,h^{-1}}]$$

**Test for which idealisation applies:** if 2r_w > Sₑ the saturated discs themselves overlap and
the point-source treatment is invalid regardless of what the bulbs do.

---

## 10. Wetting front geometry

*Implemented in `bulbSZ`, block `W`.*

### 10.1 Physical basis

Bulb shape is governed by the competition between gravity and capillarity, characterised by λc. A
short λc (sand, λc ≈ 7 cm) gives a narrow, columnar bulb. A long λc (clay, λc > 100 cm) gives a
wide, flattened bulb with strong surface spreading.

### 10.2 Schwartzman & Zur correlation

Schwartzman & Zur (1986), with V in m³, q in m³ h⁻¹, Ks in m h⁻¹, w and z in m:

$$w=1.82\,V^{0.22}\left(\frac{q}{K_s}\right)^{0.17}$$

$$z=2.54\,V^{0.63}\left(\frac{K_s}{q}\right)^{0.45}$$

**Read the exponents.** Width scales with V^0.22, depth with V^0.63. Irrigating longer buys depth,
not width — a factor of eight in volume gives 1.6× the width but 3.6× the depth. This is why
pulsing is the standard remedy on coarse soils and for keeping nitrate inside the root zone.

The volume applied per emitter per event is

$$V=\frac{q_n\,t_{set}}{1000}\qquad[\mathrm{m^3}]$$

using the **largest scheduled event** from the water balance, so the bulb reported is the worst case.

### 10.3 Pulsing adjustment

With N_p equal pulses per event, V_p = V/N_p, and the correlation is evaluated on V_p, then scaled:

$$w=w(V_p)\,N_p^{0.07},\qquad z=z(V_p)\,N_p^{0.18}$$

**These two exponents are a heuristic, not a published correlation.** They encode the qualitative
result that pulsing recovers depth more than width once redistribution between pulses is allowed,
but they are not calibrated. Treat pulsed results as indicative only, and verify numerically.

### 10.4 Mass-balance cross-check

Idealising the bulb as a half-ellipsoid of horizontal semi-axis a = w/2 and vertical semi-axis z,
its volume is

$$V_{bulb}=\frac{2}{3}\pi a^{2}z$$

Conservation requires V_bulb·Δθ = V. Holding the aspect ratio A = z/a from the correlation and
solving for a:

$$a_{MB}=\left[\frac{3V}{2\pi A\,\Delta\theta}\right]^{1/3},\qquad w_{MB}=2a_{MB},\qquad z_{MB}=A\,a_{MB}$$

The two estimates should agree within roughly 20 %. A larger gap indicates that Δθ or Ks is wrong.
**This is a parameter diagnostic, not a design result.**

### 10.5 Wetted fraction

$$P=\begin{cases}
\min\left(1,\;\dfrac{w}{S_r}\right), & S_e<w \quad\text{(bulbs merge into a strip)}\\[2ex]
\min\left(1,\;\dfrac{\pi w^{2}/4}{S_e S_r}\right), & S_e\ge w\quad\text{(discrete circles)}
\end{cases}$$

Targets: 30–40 % for widely spaced orchard crops, above 70 % for row crops. P must be fed back into
the water balance as f_w.

---

## 11. Overlap between adjacent bulbs

*Implemented in block `W`, rendered by `BulbDrawing`.*

Two adjacent emitters produce half-ellipses with semi-axes a = w/2 horizontally and b = z
vertically, with centres Sₑ apart on the soil surface. Define the normalised spacing

$$k=\frac{S_e}{w}$$

### 11.1 Merge depth

The two ellipses intersect on the vertical midplane x = 0. Substituting into the equation of the
left-hand ellipse, whose centre is at x = −Sₑ/2:

$$\left(\frac{S_e/2}{w/2}\right)^{2}+\left(\frac{z_{ov}}{z}\right)^{2}=1$$

$$\boxed{\;z_{ov}=z\sqrt{1-\left(\frac{S_e}{w}\right)^{2}}=z\sqrt{1-k^{2}}\;}$$

**z_ov is the depth to which the wetted strip is genuinely continuous.** Below it lies a dry wedge
between emitters of thickness

$$z-z_{ov}=z\left(1-\sqrt{1-k^{2}}\right)$$

The horizontal width of the overlap lens at the surface is simply w − Sₑ.

### 11.2 Overlap area

The area shared by the two half-ellipses, obtained by integrating the left ellipse's lower boundary
from x = 0 to x = a − Sₑ/2 and doubling:

$$A_{ov}=2\int_{0}^{a-S_e/2}b\sqrt{1-\left(\frac{x+S_e/2}{a}\right)^{2}}\;\mathrm{d}x
=ab\left[\frac{\pi}{2}-k\sqrt{1-k^{2}}-\arcsin k\right]$$

Expressed as a fraction of one bulb's cross-sectional area (πab/2):

$$\boxed{\;f_{ov}=\frac{\dfrac{\pi}{2}-k\sqrt{1-k^{2}}-\arcsin k}{\pi/2}\;}$$

Limits check: f_ov = 1 at k = 0 (coincident) and f_ov = 0 at k = 1 (just touching).

### 11.3 Inverting for the design spacing

To place the join at a target depth z_target:

$$\boxed{\;S_e=w\sqrt{1-\left(\frac{z_{target}}{z}\right)^{2}}\;}$$

valid only when z > z_target. **If the bulb is shallower than the target, no spacing can achieve
it** — the remedy is a longer set or a larger emitter, not closer emitters.

### 11.4 Worked table

For w = 54 cm, z = 32 cm:

| Sₑ | k | Lens | z_ov | Dry wedge | f_ov |
|---|---|---|---|---|---|
| 0.30 m | 0.556 | 24 cm | 27 cm | 5 cm | 33 % |
| 0.35 m | 0.648 | 19 cm | 24 cm | 8 cm | 25 % |
| 0.40 m | 0.743 | 14 cm | 21 cm | 11 cm | 15 % |
| 0.50 m | 0.928 | 4 cm | 12 cm | 20 cm | 2 % |

### 11.5 Design guidance

| Indicator | Target | Failure mode if violated |
|---|---|---|
| z_ov | ≥ root depth | Dry wedge between plants; salt accumulation at the fringe |
| f_ov | 15–35 % | Below: discontinuous strip. Above: redundant emitters, deeper drainage at the midpoint |
| 2 r_w vs Sₑ | 2 r_w < Sₑ | Sources merge; point-source model invalid, switch to line source |

**Four levers, in order of practical use.** Emitter spacing acts directly on k. Set duration raises
z far more than w (Section 10.2). Pulsing raises w/z and therefore the overlap for the same volume.
Emitter discharge raises w through q/Ks.

---

## 12. Fertigation

*Implemented in block `F`.*

### 12.1 Dose

$$A_{block}=\frac{N_m\,S_r\,L_{lat}\,n_{sides}}{10000}\qquad[\mathrm{ha}]$$

$$M_N=R_N\,A_{block}\ [\mathrm{kg\ N}],\qquad M_{prod}=\frac{M_N}{\%N/100}\ [\mathrm{kg}]$$

$$V_{stock}=\frac{M_{prod}\times1000}{C_{stock}}\qquad[\mathrm{L}]$$

### 12.2 Injection

$$t_{inj}=\max\left(5,\;0.5\,t_{set}\times60\right)\ [\mathrm{min}],\qquad
R_{inj}=\frac{V_{stock}}{t_{inj}/60}\ [\mathrm{L\,h^{-1}}]$$

$$c=\frac{M_N\times10^{6}}{V_{water}}\qquad[\mathrm{mg\ N\ L^{-1}}]$$

Keep c below about 150 mg N L⁻¹ to limit the electrical-conductivity rise at the emitter and the
risk of precipitation in the lines.

### 12.3 The quarter–half–quarter schedule

| Fraction of set | Action | Reason |
|---|---|---|
| First ¼ | Clear water | Fills the network and starts the bulb, so solute enters wet soil rather than an advancing dry front |
| Middle ½ | Inject at R_inj | Places the pulse in the body of the bulb |
| Last ¼ | Clear water | Flushes the lines; keeps the pulse central rather than at the perimeter |

**Do not extend the flush.** A long final rinse drives nitrate toward the wetting front, which is at
or beyond the root depth in most designs. This is the direct link between the fertigation schedule
and the bulb depth computed in Section 10.

### 12.4 Solute transport, for the numerical stage

The Workbench does not solve transport. When you move to a numerical model, the companion equation
to Richards in the same axisymmetric domain is

$$\frac{\partial(\theta c)}{\partial t}+\rho\frac{\partial s}{\partial t}
=\nabla\!\cdot\left(\theta\mathbf{D}\nabla c\right)-\nabla\!\cdot\left(\mathbf{q}c\right)-S\,c_r$$

with the nitrogen chain urea → NH₄⁺ (sorbed, distribution coefficient K_d) → NO₃⁻ (mobile) as
first-order transformations.

---

## 13. Numerical methods

| Method | Applied to | Settings |
|---|---|---|
| Bisection | Distal head in each lateral and manifold march | 70 iterations, bracket [0.05, 400] m |
| Newton–Raphson | Wooding radius | 80 iterations from r = 1 cm, floor 10⁻⁴ cm |
| Log-spaced quadrature | Matric flux potential | 800 intervals, \|h\| from 10⁻² to 10⁵ cm |
| Two-point log fit | Lateral equivalent exponent | h and 1.25h |
| Forward Euler, daily step | Root-zone depletion | Δt = 1 d |

Bisection is used in preference to Newton for the network because the derivative is not available
in closed form and monotonicity guarantees convergence without a good initial guess. Iteration
counts are set far beyond convergence because the cost is negligible in a browser.

---

## 14. Assumptions, and what is not literature

### 14.1 Physical assumptions

1. Water at 20 °C throughout; ν = 1.003 × 10⁻⁶ m² s⁻¹.
2. Soil homogeneous, isotropic, non-hysteretic. No layering, no preferential flow, no
   shrink–swell.
3. Steady-state hydraulics; no water-hammer, no fill or drain transients.
4. Emitters characterised entirely by (qₙ, hₙ, x, CV); no clogging, no temperature sensitivity.
5. Uniform emitter spacing and a single lateral diameter per block.
6. The bulb is a half-ellipsoid, symmetric about the emitter.
7. Rainfall is spread uniformly within each month, and all of it is effective.
8. No capillary rise from a water table; no runoff.

### 14.2 Departures from the cited sources — stated explicitly

| Item | Source | Departure |
|---|---|---|
| TAW × f_w | FAO-56 Eq. 82 | The f_w factor is an adaptation for localised irrigation, not in FAO-56 |
| Pulsing exponents N^0.07, N^0.18 | none | Heuristic, uncalibrated |
| Lateral power-law fit | none | A numerical device to decouple manifold from lateral; not a physical law |
| α_eff from ∫K dh | White & Sully (1987) | The integration is standard; feeding it to Wooding in place of α_vG is a deliberate choice, documented in Section 2.4 |
| Capacity constraint in the balance | none | An engineering constraint added to FAO-56's unconstrained balance |
| Overlap geometry | none | Exact for the assumed half-ellipsoid, but the ellipsoid itself is an idealisation |

### 14.3 Validity boundaries

- **Schwartzman & Zur** was fitted on mineral field soils. On wood fibre, peat or engineered
  substrates the coefficients are very likely wrong even with correct van Genuchten parameters.
- **Wooding** is steady-state, so r_w is an upper bound for short sets. Run the numerical model with
  both a small observed r₀ and the steady r_w as bounding cases.
- **Emission uniformity** is steady-state; short sets have materially lower real uniformity, which
  is why the minimum set duration check exists.

---

## 15. References

Allen, R.G., Pereira, L.S., Raes, D. & Smith, M. (1998). *Crop evapotranspiration: guidelines for
computing crop water requirements.* FAO Irrigation and Drainage Paper 56. FAO, Rome.

Carsel, R.F. & Parrish, R.S. (1988). Developing joint probability distributions of soil water
retention characteristics. *Water Resources Research*, 24(5), 755–769.

Christiansen, J.E. (1942). *Irrigation by sprinkling.* California Agricultural Experiment Station
Bulletin 670.

Keller, J. & Karmeli, D. (1974). Trickle irrigation design parameters. *Transactions of the ASAE*,
17(4), 678–684.

Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous
media. *Water Resources Research*, 12(3), 513–522.

Schwartzman, M. & Zur, B. (1986). Emitter spacing and geometry of wetted soil volume. *Journal of
Irrigation and Drainage Engineering*, 112(3), 242–253.

Swamee, P.K. & Jain, A.K. (1976). Explicit equations for pipe-flow problems. *Journal of the
Hydraulics Division ASCE*, 102(5), 657–664.

van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of
unsaturated soils. *Soil Science Society of America Journal*, 44(5), 892–898.

White, I. & Sully, M.J. (1987). Macroscopic and microscopic capillary length and time scales from
field infiltration. *Water Resources Research*, 23(8), 1514–1522.

Wooding, R.A. (1968). Steady infiltration from a shallow circular pond. *Water Resources Research*,
4(6), 1259–1273.
