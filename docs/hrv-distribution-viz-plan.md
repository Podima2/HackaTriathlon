# Plan: Real-Time HRV Distribution Visualization

## What This Is

A live, animated bell-curve visualization of RR interval distribution. As RR values stream in from the heart rate belt, the histogram builds and reshapes in real time. Athletes with high HRV produce a wide, shallow bell; athletes under stress or at high intensity produce a narrow, tall spike. The curve breathes and shifts as the session progresses.

---

## How It Works Conceptually

Each RR interval value (in milliseconds) is a data point. Over a session, these accumulate into a distribution:

- **X axis:** RR interval duration in ms (typically 400–1200ms range for most humans)
- **Y axis:** Frequency / density
- **Shape:** Approximately normal (bell curve) for resting; skews and narrows under exertion

The visualization:

1. Collects all RR interval values received so far in the session
2. Bins them into a histogram (e.g., 10ms-wide bins)
3. Overlays a smooth kernel density estimate (KDE) curve
4. Animates transitions as new values arrive — the curve widens, narrows, shifts left/right
5. Highlights the current live RR value as a pulsing dot on the x-axis

Key visual indicators:
- **Wide curve** = high HRV = relaxed / fit / recovered
- **Narrow curve** = low HRV = stressed / fatigued / high exertion
- **Standard deviation annotation** = SDNN (literally the width of this distribution)
- **Mean annotation** = average RR interval (inversely related to HR)

---

## Data Source

Already available in the frontend:

- `TelemetrySample.rrLatestMs` — the most recent RR interval per sample (single value)
- `TelemetrySample.rrIntervalsMs` — array of RR intervals from that BLE notification (can contain multiple)
- `TelemetrySample.rmssd` and `TelemetrySample.sdnn` — pre-computed server-side (can display as annotations)

The RR values arrive via the existing polling/chain-read cycle that populates `state.rrIntervalSamples`. Each sample may contain one or more RR intervals.

---

## Rendering Approach

### Technology: SVG (matches existing codebase)

The existing charts use inline SVG returned as template strings from `renderIntervalChart()`. Stay consistent — no new library dependencies.

### Components of the visualization

1. **Histogram bars** — vertical bars for each bin, height proportional to count
2. **KDE smooth curve** — a `<path>` tracing the smoothed density estimate over the bars
3. **Live RR marker** — a pulsing `<circle>` at the current RR value on the x-axis
4. **Mean line** — dashed vertical line at the mean RR
5. **SDNN annotation** — horizontal double-arrow spanning mean ± 1 SD, labeled with the SDNN value
6. **RMSSD annotation** — small text readout, since RMSSD doesn't map to a visual width as cleanly
7. **Tail shading** — optional: shade the area beyond ±1 SD in a different opacity to visually emphasize the tails

### Layout

```
┌──────────────────────────────────────────────────┐
│                                                  │
│           ╱╲          KDE curve                  │
│          ╱  ╲                                    │
│        ╱      ╲                                  │
│      ╱          ╲                                │
│    ╱    ██████    ╲       histogram bars          │
│  ╱   ███████████    ╲                            │
│╱  ████████████████    ╲                          │
│████████████████████████╲                         │
│──┬──────────┬──────────┬──── x: RR (ms)         │
│  400    ●  700       1000                        │
│         ↑ live RR    ◄─── SDNN: 48ms ───►       │
│         mean: 712ms       RMSSD: 42ms            │
└──────────────────────────────────────────────────┘
```

---

## Algorithm

### Histogram binning

```
binWidth = 10  // ms
bins: Map<number, number>  // binCenter → count

for each rrValue:
  binCenter = Math.round(rrValue / binWidth) * binWidth
  bins[binCenter] += 1
```

### Kernel Density Estimate (KDE)

Gaussian KDE for the smooth curve overlay:

```
bandwidth = 1.06 * sdnn * n^(-1/5)   // Silverman's rule of thumb

kde(x) = (1 / (n * bandwidth)) * sum(
  gaussian((x - rrValue_i) / bandwidth)
)

gaussian(u) = (1 / sqrt(2π)) * exp(-0.5 * u²)
```

Evaluate KDE at ~100 evenly spaced points across the RR range to generate the smooth path.

If SDNN is not yet available (too few samples), use a fixed bandwidth of 20ms as a sensible default.

### Animation

On each new batch of RR values:

1. Recompute bins + KDE
2. Generate new SVG path and bar heights
3. Apply CSS transitions on bar heights and path morphing

For smooth transitions without a framework:
- Bars: use `<rect>` elements with CSS `transition: height 300ms ease-out, y 300ms ease-out`
- KDE curve: interpolate between old and new path data points and update `d` attribute on a `requestAnimationFrame` loop, or use CSS `transition` on the `d` property (supported in modern browsers via CSS `d` property transitions)
- Live RR dot: CSS `transition: cx 200ms ease-out` + pulsing `animation`

### Responsive scaling

- X range: `[min(allRR) - 50, max(allRR) + 50]` — adapts as distribution shifts
- Y range: `[0, max(binCount) * 1.2]` — auto-scales to tallest bar
- Smooth rescaling: when the range changes, transition all elements together

---

## State Additions

Add to the existing `state` object in `main.ts`:

```typescript
// All RR intervals collected during the active session
rrDistributionValues: number[],

// Precomputed for render
rrDistributionBins: { center: number; count: number }[],
rrDistributionMean: number | null,
rrDistributionSdnn: number | null,
rrDistributionRmssd: number | null,
rrDistributionLatestRr: number | null,
```

### Accumulation logic

Each time `state.rrIntervalSamples` updates (in the existing polling cycle):

```typescript
function accumulateRrDistribution(samples: TelemetrySample[]) {
  const allRr: number[] = [];
  for (const sample of samples) {
    if (sample.rrIntervalsMs) {
      allRr.push(...sample.rrIntervalsMs);
    } else if (sample.rrLatestMs) {
      allRr.push(sample.rrLatestMs);
    }
  }
  state.rrDistributionValues = allRr;
  state.rrDistributionBins = computeBins(allRr, 10);
  state.rrDistributionMean = allRr.length > 0 ? mean(allRr) : null;
  state.rrDistributionSdnn = allRr.length > 1 ? sdnn(allRr) : null;
  state.rrDistributionRmssd = allRr.length > 2 ? rmssd(allRr) : null;
  state.rrDistributionLatestRr = allRr[allRr.length - 1] ?? null;
}
```

---

## New Functions

All in `src/client/main.ts`:

### `computeBins(values: number[], binWidth: number): { center: number; count: number }[]`
Groups RR values into fixed-width bins. Returns sorted array.

### `computeKde(values: number[], bandwidth: number, nPoints: number): { x: number; y: number }[]`
Evaluates Gaussian KDE at `nPoints` evenly spaced across the value range. Returns array of (x, density) pairs for SVG path generation.

### `renderRrDistributionChart(): string`
Returns SVG inner content for the distribution visualization. Called from a new `refreshRrDistribution()` function that runs alongside the existing `refreshRrIntervalExperience()`.

Components rendered:
- Background rect (matches existing chart style)
- Histogram `<rect>` bars with class for CSS transitions
- KDE `<path>` with smooth curve
- Mean vertical dashed line
- SDNN range indicator (horizontal bracket/arrow)
- Live RR pulsing dot
- Axis labels and metric annotations

### `refreshRrDistribution()`
Orchestrator: calls `accumulateRrDistribution()`, then updates the SVG element's innerHTML with `renderRrDistributionChart()`.

---

## HTML Addition

Add a new section in the existing page HTML (in the template string in `main.ts`), placed near the existing RR interval market section:

```html
<section class="card reveal">
  <div class="section-header">
    <h2>Heart Rate Variability Distribution</h2>
    <p class="section-lede">Live RR interval distribution — wider curve means higher variability.</p>
  </div>
  <div class="interval-chart-wrap">
    <svg id="rr-distribution-chart" viewBox="0 0 720 320" preserveAspectRatio="none"></svg>
  </div>
  <div class="rr-distribution-stats">
    <div class="stat-pill"><span>Mean RR</span><strong id="rr-dist-mean">--</strong></div>
    <div class="stat-pill"><span>SDNN</span><strong id="rr-dist-sdnn">--</strong></div>
    <div class="stat-pill"><span>RMSSD</span><strong id="rr-dist-rmssd">--</strong></div>
    <div class="stat-pill"><span>Samples</span><strong id="rr-dist-count">0</strong></div>
  </div>
</section>
```

---

## CSS Additions

Add to `src/client/styles.css`:

```css
/* Distribution chart transitions */
#rr-distribution-chart rect.bin-bar {
  transition: height 300ms var(--ease-out-quart), y 300ms var(--ease-out-quart);
}

#rr-distribution-chart path.kde-curve {
  transition: d 400ms var(--ease-out-quint);
}

#rr-distribution-chart .live-rr-dot {
  animation: pulse-rr 1.5s ease-in-out infinite;
}

@keyframes pulse-rr {
  0%, 100% { r: 5; opacity: 1; }
  50% { r: 9; opacity: 0.6; }
}

.rr-distribution-stats {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-3);
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  background: var(--card-strong);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: var(--space-1) var(--space-2);
  flex: 1;
  min-width: 80px;
}

.stat-pill span {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.stat-pill strong {
  font-family: "IBM Plex Mono", monospace;
  font-size: 1.1rem;
  font-weight: 600;
}
```

---

## Integration Points

### Where to call `refreshRrDistribution()`

In the existing polling cycle — the same place that calls `refreshRrIntervalExperience()`. Both consume the same underlying RR sample data, just visualize it differently.

Look for the function that updates `state.rrIntervalSamples` (around line ~1803). After that state update, add:

```typescript
accumulateRrDistribution(state.rrIntervalSamples);
refreshRrDistribution();
```

Also call it in the session reset paths (around lines ~1725, ~1735) to clear the distribution state.

### Data dependency

The distribution visualization needs **all RR values from the session**, not just the current 5-minute window. The existing `state.rrIntervalSamples` is scoped to the active interval window. 

Two options:
- **Option A:** Accumulate into `state.rrDistributionValues` across all polling cycles (append-only, clear on session change). This gives the full-session distribution.
- **Option B:** Recompute from the full sample set each cycle by fetching all session samples.

**Recommendation:** Option A. Append new RR values on each poll, never re-fetch the full set. Clear on session change. This keeps the distribution responsive without extra API calls. The tradeoff is that if the page reloads mid-session, you lose accumulated history — acceptable for a live demo.

---

## Files Modified

| File | Change |
|------|--------|
| `src/client/main.ts` | Add state fields, add `computeBins`, `computeKde`, `renderRrDistributionChart`, `refreshRrDistribution`, `accumulateRrDistribution`. Add HTML section. Hook into polling cycle. |
| `src/client/styles.css` | Add distribution chart styles, stat pills, pulse animation |

No new files. No new dependencies. No backend changes.

---

## Visual Polish Details

### Color scheme (matches existing)

- Histogram bars: `#ff8a4c` at 40% opacity (accent, softened)
- KDE curve: `#ff8a4c` solid, 3px stroke
- Mean line: `rgba(255,138,76,0.65)` dashed (same as existing reference line)
- SDNN bracket: `rgba(255,138,76,0.4)` with text label
- Live RR dot: `#ff8a4c` solid with pulse animation
- Tail shading beyond ±1 SD: `rgba(255,138,76,0.1)` fill under the KDE curve

### Empty / loading states

- 0 samples: "Waiting for live RR intervals — the distribution will build as data arrives."
- 1–4 samples: Show individual dots on the x-axis, no curve yet. Label: "Accumulating RR data..."
- 5+ samples: Begin drawing histogram bars
- 15+ samples: Add the KDE smooth curve overlay (too few points before this makes a jagged meaningless curve)

### Readability

- X-axis tick marks every 100ms (e.g., 500, 600, 700, 800, 900, 1000)
- Y-axis: no numeric labels (relative density is more intuitive than raw counts)
- Current sample count shown in the stat pills below

---

## Verification

1. Start a session with a strap that reports RR intervals
2. Confirm the distribution chart appears and shows "Waiting for live RR intervals..."
3. After ~5 samples, histogram bars should begin appearing
4. After ~15 samples, the KDE curve should overlay smoothly
5. Observe the curve widening/narrowing as HRV changes (e.g., rest vs. exercise)
6. Confirm the live RR dot pulses and tracks the most recent value
7. Confirm mean/SDNN/RMSSD stat pills update in real time
8. Confirm the visualization resets cleanly on session change
9. Confirm smooth CSS transitions — no jumpiness when new bins appear or the range rescales
