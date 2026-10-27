# Sentinel charts and tables

One kit, in `app/sentinel/lib/viz`, used by KPIs, Peers and trends, Statements and each project's Overview.
Built from the dataviz method: pick the form by the job, give colour a job, validate the palette, put the
hover layer in by default, give every chart a table twin.

## Which form, and why

| Question | Form | Where |
| --- | --- | --- |
| How is *this* company doing against its peers over time? | **Line, emphasis form**: the company in bronze, in front, named at its end; peers neutral grey behind | Peers and trends |
| ...with many peers | **Peer range**: the peers' median and low-to-high band replace the lines | Peers and trends (3+ peers) |
| Where does it stand among peers right now? | **Ranking bars**, best first, a hairline for the peer average | KPIs: Peer standing |
| An amount over the years | **Columns on a zero baseline**; a loss hangs below it | KPIs: Trend |
| Two margins over the years | Line, two featured series (bronze, steel blue) | KPIs: Trend |
| Revenue to profit, step by step | **Waterfall**: always ends on the reported profit | Statements |
| Debt against equity | One **split bar** (not a pie) | KPIs: Capital structure |
| A single figure and how it moved | **Stat tile**: value, change on last year, shape over the years, formula one press away | KPIs, Overview |
| Companies against each other on many measures | **Benchmark table**, heat-shaded within each column, sortable | Peers and trends |
| A statement over several periods | **Comparative statement table** with trend, YoY, CAGR and peer gap | Statements |

Not used, on purpose: pie or donut charts, dual axes, a legend of ten colours, a number on every point,
dashed grid lines, a rainbow.

## Colour

Brand colours (black and sandstone) stay for chrome. Data marks use `viz/tokens.ts`, validated with the
dataviz validator on the white card (light mode):

| Pair | Result |
| --- | --- |
| bronze `#B0652B` and steel blue `#2B6CB0` (subject, secondary; debt, equity) | colour-blind separation dE 20.4 (protan), normal vision 25.0, contrast over 3:1, chroma over 0.10: all pass |
| steel blue `#2B6CB0` and orange `#C2571A` (favourable, unfavourable) | dE 21.5 (protan), 27.8 normal, all pass |

The brand sandstone `#A47551` **fails the chroma floor** (0.078; it reads as grey), which is why marks use
bronze. Green and red were rejected for good and bad: green `#2F6F4F` against brick `#B04A2B` is dE 5.3 under
protanopia (fail). A change always carries an arrow, a sign and, for screen readers, its meaning in words
("Up 30.0% versus FY25, favourable"), so colour is never the only channel.

Text never wears a data colour. Peers are one grey; who is who comes from the legend (press a name to compare
against just that peer), the line nearest the pointer, and the tooltip. Costs rising with the business are
left neutral rather than painted as bad news. Payable days is not shaded in the benchmark table: longer can
mean good cash management or stretched suppliers.

## Interaction

- **Hover or touch**: a crosshair snaps to the nearest period; one tooltip lists every series, with the
  company's change on the period before. Bars and rows lift on hover. Hit areas are whole bands, not the
  painted pixels.
- **Keyboard**: Tab to a chart; Left and Right step through periods, Home and End jump, Esc lets go; the
  value under the cursor is announced politely. Ranking rows are focusable.
- **Chart | Table** on every chart: the same numbers as text, so no value is reachable only by hover.
- **Tables**: header buttons sort (`aria-sort`); a missing value is always last; rows glide to their new
  place; the first column and header stay in view; Copy CSV and Download (text cells that start with `=`, `+`,
  `-` or `@` are defused so a spreadsheet cannot read them as formulas).
- **Units**: every chart takes its figures already converted to the Display unit and names the unit.

## Motion (framer-motion)

Lines draw in, columns and bars grow from the baseline, tiles arrive in a short stagger, the tooltip fades,
the selected pill glides, sorted rows and re-ranked bars slide to their places. Everything uses one easing
curve. `MotionConfig reducedMotion="user"` is set for the whole section and the charts also check
`useReducedMotion`, so people who ask for less motion get the final state immediately (there is a browser
check for this). Figures are never counted up from zero: what you copy or screenshot is what is true.

## Honest edges

- A **profit bridge** shows a step "Other / unreconciled" where the filing's own lines do not add up to the
  reported profit (tolerance 0.1% of revenue, the size of rounding), and stars a step that was worked out
  rather than read.
- The line chart gives a **CAGR** only for amounts, with two or more whole years between the ends.
- Sentinel has no dark mode, so none of this has a dark palette. Texture fills (the colour-blind and print
  fallback in the method) are not built; the arrows, signs, direct labels and table twin carry that job.
- The health sentences ("Revenue of 1,000.0 cr ...") are written in the company's own unit and are not
  re-converted by the Display switch.
- Tested on the seeded demo data and a handful of periods. A company with dozens of quarters will exercise the
  label thinning and marker rules more than anything here has.
