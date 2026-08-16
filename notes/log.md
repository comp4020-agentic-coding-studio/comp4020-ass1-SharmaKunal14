# Working log

Rough notes kept while building, so PROCESS.md can be curated from a real
record instead of reconstructed afterwards. Not part of the deployed site.

## Sat 15 Aug — CP1, the street's travel-time curve

First run of the target config gave **−1.2%**: the connector *helped*. Control
gave −11.1%, which is the direction a control should go, so the engine was
working — the target was simply not a Braess configuration.

The obvious move was to raise demand until the sign flipped. `--curve` shows why
that would have been fraud:

```
demand   closed SA flow / t_SA    open SA flow / t_SA    journey
   400       198 / 112s               315 / 119s         334 → 294  better
  1000       527 / 135s               752 / 138s         360 → 356  better
  1200       545 / 140s               774 / 143s         405 → 472  WORSE
  1400       540 / 140s               774 / 142s         480 → 595  WORSE (unusable)
```

SA's flow saturates at ~770 veh/h and its travel time at ~143s. Beyond that,
extra demand does not go onto the street — it queues at the origin. So the
"WORSE" rows are an oversaturated network, not a worse equilibrium. Raising
demand would have produced exactly the artefact I wrote a steady-state check to
catch, and at 1200 the drift check *passed*, so the check alone would not have
saved me. The curve did.

Wrote down the design equation from the run rather than from intuition. In the
open equilibrium all three routes cost the same, which pins the street at
`t_street = t_parkway − t_connector`; the closed equilibrium costs
`t_street(D/2) + t_parkway`. So

    effect = (t_parkway − t_connector) − t_street(D/2)

and the whole effect has to fit inside the street's congested-to-free-flow
range. With `r = t_sat / t_freeflow`, the ceiling is `(r − 1)/(r + 1)`. Measured
r = 143/108 = 1.32, so **the effect was capped at ~13% at any demand**, and my
parkway was asking for 166s of budget from a street that can only spend 35s.

Root cause: a homogeneous link has no bottleneck inside it. It runs at free flow
below capacity and spills back past its own entrance above it, so its own
traversal time barely moves. Fix at the model level, using the mechanism the
source paper uses itself — Treiber et al. describe capacity changes as local
variations of a model parameter, and report that a parameter-induced local
capacity drop behaves like an on-ramp. So: the streets get a narrow throat near
the junction. A queue then forms *upstream of the throat, inside the street*,
and the street's traversal time can rise by a factor of 2–3 while still being a
stable equilibrium rather than a spillback.

Bonus, and it matters for the explanation: the queue now has a *visible
location*. The bottleneck is a place on the map, not an abstraction.

## Sat 15 Aug — CP1, three false positives and the check that caught them

After the throat went in, the target gave **+23.9%**. It was wrong, and so were
the two results after it. The sequence is worth keeping because each fix was at a
different level.

**1. Global origin queue (real bug).** `admitWaiting` returned on the first
vehicle that could not get on, so a driver heading for an empty parkway waited
behind one queued for a full street. That made the origin a single server shared
by every route and quietly coupled routes sharing no road. Fixed to one queue per
road out of the origin. Barely moved the numbers, but it was wrong.

**2. Oversaturation dressed as an equilibrium.** Lengthening the horizon moved
the "effect" +20.5% → +38.8% → +49.5% → +58.4% while the settled fraction stayed
at ~6/10. The queue was growing the whole time; "worse" just meant "watched
longer". My within-window drift check *passed on 6 of 10 seeds* while this
happened, because a slow monotone ramp looks flat inside any one window.

So I added `horizonCheck`: run the same config over a 1.75× longer horizon and
require the same answer. It is the only honest test of an equilibrium, and it is
now a gate — a config that fails it may not be quoted at all. Run against the
whole grid, the verdict was total: **every Braess-positive configuration failed,
every configuration that passed showed the connector helping.** Disjoint regions,
not adjacent ones.

**3. Under-damped route learning (the real culprit).** The open equilibrium was
coming out lopsided — north 6% / south 34% on a perfectly symmetric network —
with one street at 90% of capacity. A symmetric network cannot have an asymmetric
equilibrium, so the learning was the suspect, not the physics. θ=0.04 over a 100s
cost gap is a 55:1 preference and α=0.3 moves a belief a third of the way on
every trip. Damping it (θ=0.015, α=0.1) restored symmetry to a 2-point gap, made
the runs horizon-invariant — and the effect disappeared.

I had also measured throat discharge directly and found it within 4% of nominal,
which killed my "effective capacity is much lower" hypothesis before I built
anything on it.

**The actual design error.** With learning that converges, the connector saved
116s of free-flow time while a street can only stably add tens of seconds of
delay. `budget = t_parkway − t_connector` is the street travel time the open
equilibrium drives towards, so it has to sit *inside* the street's stable elastic
range. Mine was 237s against a street that stably reaches ~160s. The shortcut was
too good to ever be overturned, and the only way to "get" the effect was to run
the model somewhere it had not converged.

Shortening the parkway from 8200 m to 5600 m fixes it. The result:

| | closed | open | Δ | 10 seeds |
| --- | --- | --- | --- | --- |
| target, 860 veh/h | 331.2s | 342.8s | **+3.5%** | mean +5.4%, sd 3.1%, 8/10 settled, all positive |
| control, 300 veh/h | 318.6s | 310.7s | **−2.5%** | mean −3.0%, sd 0.4%, 10/10 settled, all negative |

Same network, same engine, same code path, one number different: the sign flips.
That is the control case the brief asked for, and it is stronger than I planned
for — not "some other network behaves differently" but "this network's answer
depends on how much traffic there is".

The honest effect is **~12 seconds on a five-and-a-half minute commute**. Every
larger number I saw was an artefact. Open question for the direction of the
piece: whether 12s can carry the reveal, or whether the visible change has to be
the route shares (0% → 38% on the shortcut) with the seconds as the consequence.

## Sat 15 Aug — the page and the experiment disagreed

Built the chart, screenshotted it, and the caption said **54 seconds worse**. The
controlled experiment says 11.6 seconds. Something had to be wrong.

Probed the live run at increasing simulated times and it settled cleanly at 5:57
against a 5:27 baseline — stable from sim 3,600s through 9,000s. So it was an
equilibrium, not a growing queue. But it was a *different* equilibrium from the
headless one, and the reason was the protocol:

- **headless:** two independent runs, one with the link, one without. The "with"
  run starts cold — the link is simply always there, and nobody has habits.
- **live:** the network settles closed, and *then* the link opens on it.

Day-to-day route learning is path dependent, so those converge differently. The
warm start is obviously the honest one — nobody builds a road into a town whose
drivers have no habits — and it is also what a visitor watches. So `intervene()`
now does that: one run, settle closed, measure, open the link on the running
network, let drivers re-learn, measure again. Both halves share one seed and one
driver population by construction, which is stronger than two runs sharing a
config object.

Then the gate fired again. `interventionHoldsUp` gives the network twice as long
to settle, and the warm-start effect fell from **+10.1% to +3.4%** — 67% apart, so
FAIL. The +10% is a real transient that decays to the cold-start equilibrium of
+3.5%. Both protocols agree about the equilibrium; they disagree about how long it
takes to get there.

Which means the page was about to overstate its own result by three times, in a
project whose whole argument is about not doing that. Fixed by stating both
numbers and saying which is which: the adjustment period is ~10% worse, the
settled equilibrium ~3.5% worse, both worse than before. A test now asserts the
two protocols agree at equilibrium — if they ever stop agreeing, one of them is
lying.

Honestly the transient makes the piece better. The worst part of building the road
is the year everyone spends working out that it did not help.

## Sat 15 Aug — performance, decided by measurement

The plan said choose SVG or canvas by measuring, not by preference. Measured at
390×844 with the real vehicle count (88 on screen), CPU-throttled to emulate a
slower device:

| CPU throttle | first average | frame work (median / p95) |
| --- | --- | --- |
| 1× | 176 ms | 8.3 ms / 9.2 ms |
| 4× | 266 ms | 8.3 ms / 9.2 ms |
| 8× | 564 ms | 8.3 ms / 16.7 ms |

Frame time is pinned to the browser's own 8.3 ms rAF cadence even at 8× throttle,
so our per-frame work is well inside budget. SVG stays; no canvas fallback needed,
and no need to cut the vehicle count. Caveat worth keeping: this is throttled
headless Chromium on a laptop, not a real handset.

## Sat 15 Aug — CP4: timing the page as a marker would

Ran the attacks a marker might: 320 px, phone landscape, 2560 px, 32 px root font,
twelve rapid clicks, backgrounding mid-run, and the replay path. Zero failures.

Then timed the actual experience at real speed — click Build, then wait — and found
the worst bug in the project so far:

```
  3s  5:27  shortcut  0%   free flowing     adapting
 15s  5:30  shortcut  8%   slowing          adapting
 30s  5:24  shortcut 46%   slowing          adapting     ← BETTER than baseline
 36s  5:28  shortcut 45%   1.3× slower      worse        ← verdict fires here
 42s  5:40  shortcut 44%   1.5× slower      worse
```

The reveal fired at 36 s on a number showing **+1 second**, and five seconds
earlier it had read *better* than the baseline. Two causes:

1. **A fixed countdown.** The readout cannot know a trip's duration until the trip
   finishes, so it lags departures by a whole journey. A countdown fires whenever
   it fires. Replaced with the same criterion the harness uses: reveal when the
   rolling average has settled — two consecutive stretches that agree — bounded
   below so it cannot fire early and above so an unlucky run cannot hang.
2. **A rolling window as the headline.** Route learning genuinely oscillates, so a
   60-trip window swings, and a visitor could catch it reading level with the
   baseline while the page claimed it had got worse. The headline is now the
   *running average since the decision*, which converges and cannot swing back —
   and is exactly what a resident would notice. The oscillation is still shown, in
   the chart, where it belongs.

Also damped the learning (α 0.1 → 0.06), which cut the transient from +10.1% to
+6.4% while holding the sign on all 8 seeds. The arc now reads:

```
 3s 5:30 → 15s 5:23 (briefly better) → 25s 5:38 verdict → settles ~5:40
```

which is the intended shape, honestly produced, and self-consistent.

**One check had to be loosened, so I proved it still bites.** With α at 0.06 the
gate rejected the target: 3.8% over one horizon against 4.9% over a longer one —
1.1 percentage points of wobble, but 30% in relative terms, and my tolerance was
purely relative. That is a scaling defect in the criterion, not a growing queue.
Gave it an absolute floor of 1.5 points, and added a regression test that feeds the
gate the original +23.9%→+58.4% artefact and requires it to still reject it.
Loosening a check is only defensible with that test next to it.

## Sat 15 Aug — the focused version was too passive

The user rejected the five-state redesign for a different reason than the earlier
dashboard: it had only Build and Close, and Build started a long automatic sequence.
The page looked controlled but the visitor did not conduct the investigation.

Reframed it as six chapters on the same network, with no new slider or second model:
trace both routes; select the connector endpoints; predict the 300/h control; choose
a peak route; release traffic in checkpoints; choose the fair comparison; inspect
both bridges; close the connector; name the result. This is more interaction, but
every action reveals one part of the same causal claim.

The redesign exposed another scientific presentation bug. The old live percentage
used the last 60 completed trips, so shortly after opening it mixed pre-opening
arrivals with post-opening trips and favoured routes that finished sooner. Added an
anchor over the simulation's departure-choice counts instead. At the first exact
checkpoint it reports 46/90 choices (51%), before most of those journeys can finish.
The controlled verdict remains a different object: 106/280 departures (38%) in the
complete paired open-road cohort.

An adversarial visual audit rejected the 1,300-second checkpoint too: Riverside was
only 1.056× its free-flow reference while the interface drew two queue callouts. The
new fourth checkpoint at 1,800 seconds shows Riverside at 1.195×, Millbrook at 1.210×
and the connector at 1.013×. The picture now supports its own explanation. Static
labels say “paired cohort” and live labels say “live choices” so the two protocols
cannot quietly blur together.

## Sat 16 Aug — chapter-turn animation, and a scrollbar red herring

Added a real "page unfold" transition between chapters: a hinge-at-the-top
`perspective()/rotateX()/scaleY()` open, 560ms, easeOutExpo-ish, with a small
overshoot that reads as paper settling rather than a mechanical snap. It fires
only when `STORY[next].chapter !== STORY[state].chapter` -- the quick
fade-and-rise stays for in-chapter steps (the quiet-road replay steps, the four
peak waves), so stepping through one chapter's own sub-states doesn't repeat a
big flourish on every click. Verified with `Element.getAnimations()`: chapter
boundaries measure 560ms/expo, in-chapter steps measure 320ms/soft-ease, with no
overlap once each fully settles. Reduced motion still returns zero animations,
confirming the existing `reducesMotion` gate covers the new path too.

While sweeping viewports for this I found `scrollWidth: 396` against
`innerWidth: 390` first appearing at the "peak" chapter on a 390x844 phone
viewport. Confirmed present on the prior commit too (via `git stash`), so it
predates this change. Chased it down: no element's own `getBoundingClientRect()`
exceeds 390px anywhere in the tree (checked every element including SVG
children), and it correlates exactly with `scrollHeight > innerHeight` first
becoming true at that chapter -- i.e. the first point the page needs a vertical
scrollbar. That is the signature of headless Chromium's classic (non-overlay)
scrollbar being counted into `documentElement.scrollWidth`, not a real
horizontal overflow: a real phone has no reserved-width scrollbar at all, and
`pnpm check`'s own browser suite (97/97) does not trip on it. Added
`min-width: 0` to `.control`, `.choices` and a new `.option__copy` rule anyway,
since the grid/flex chain feeding the radio-group quiz options was missing it
and the project already has a standing rule about exactly this trap -- cheap
insurance, not a claimed fix for the scrollbar artifact.

## Sat 16 Aug — the fold was invisible because of its own easing

Reported: "I can't see the animation." Screenshotted the first ~120ms after a
chapter click and the opacity fade WAS visible, but the panel never looked
tilted -- just faded in flat. Two separate problems, found in order:

1. The rotation itself was too shallow to read as a fold: -18deg at a 1200px
   perspective distance foreshortens a text block by only a few pixels.
   Steepened to -78deg at 640px.

2. The real bug. Scrubbing the animation's own `currentTime` (rather than
   racing real timers) and reading `getComputedStyle().transform` at each
   point showed the rotation at 12% real-time progress was ~-0.7 degrees --
   essentially already flat -- when the authored keyframe offsets (0, 0.22,
   0.62, 1) call for about -60 degrees there. The overall animation `easing`
   was `cubic-bezier(0.16, 1, 0.3, 1)`, an aggressive ease-out, applied ON TOP
   of the keyframe offsets that were already shaping the pacing. An eased-out
   curve front-loads nearly all visual progress into the first ~10% of the
   real duration, so a fold authored to open gradually over 620ms actually
   completed within about the first 60ms and was gone before a human eye could
   register it -- what remained for the other 560ms was just the already-flat,
   already-opaque resting state, which reads as "it faded in," exactly the
   complaint.

Fixed by setting the chapter transition's overall easing to `linear` and
letting the three keyframe offsets do 100% of the pacing work themselves.
Re-scrubbing confirmed the fix numerically: rotation at 12%/25%/50%/75% now
lands at -60.5/-42.0/-8.9/+4.6 degrees, matching hand-calculated linear
interpolation between the authored offsets to within rounding. Also added a
box-shadow + opaque background toggled only while a chapter fold is in flight,
so the panel reads as a lifted sheet of paper rather than text alone rotating
in space -- and removed the per-panel stagger for chapter transitions (all
three now start in perfect sync) so the group reads as one page turning
instead of three pieces moving independently.

Two things this is NOT: not a rendering bug (the transform was always being
computed correctly, just interpolated into a curve that made it invisible),
and not something the earlier `getAnimations()` inspection could have caught,
since duration/easing/keyframe-count all looked correct in isolation -- only
sampling actual interpolated values at real progress points exposed it.

Reverified after the fix: reduced motion still produces zero animations, no
new overflow at 390px at any point during the now-steeper fold, and keyboard
focus still lands on the headline through a chapter transition.

## Sun 17 Aug — the interaction now reveals the mechanism

The latest request was not for more explanation cards; it was for interactions that
make the paradox discoverable. I started below the interface by deriving and testing
the model's two landmarks: 500 shortcut users gives the 64.6875-minute minimum, and
1,000 returns the town to its 65-minute baseline. The page now asks for a prediction,
lets the visitor search those points with the slider, and keeps the original average
visible beside the current one.

The remaining changes were split by causal purpose. Eighty 50-driver dots keep every
100-driver slider step visually exact. A highlighted YOU marker traces either personal
route. Narrow roads become darker and wider as shared traffic grows. At full adoption,
closing the shortcut disables the unavailable choice, redistributes the dots and restores
65 minutes; reopening returns to the same 80-minute endpoint. The five equations moved
into a native disclosure so transparency no longer means permanent visual load.

The important explanatory correction is explicit in both the interaction and reveal:
the town's best balance cannot hold because the shortcut is still 22.5 minutes quicker
for the next individual. Each implementation slice was tested and committed separately;
the final browser contract covers both marking viewports, keyboard use, reduced motion,
landmarks, route highlighting, congestion and the reversible comparison.

## Mon 17 Aug — the layout stopped repeating itself

The latest layout pass began with a correctness problem, not a spacing token: the
shortcut equation silently treated the middle connector as a zero-minute road while
the page claimed the model had only two rules. I made that simplifying assumption an
exported constant, a third rule, a map label and an explicit `+ 0` in the equation.

I then removed the three-card time summary because it repeated values already shown in
the town comparison and personal route choice. The right column now has three jobs in
order: move the crowd, choose as one driver, and optionally inspect the arithmetic.
Shared spacing tokens and a bordered map surface make those groups readable without
adding another staged flow. The required desktop, phone, keyboard and reduced-motion
paths still use the same controls and calculation.

## Mon 17 Aug — the endpoint became the reveal

The three-zone layout still made setup, personal choice and arithmetic compete for
attention, and it separated the crucial `80 vs 85` individual incentive from the
`65 vs 80` same-driver comparison. I removed the personal-route card rather than add
another explanation. The experiment now keeps its five equations visible beside the
slider, and reaching 4,000 shortcut users reveals one controlled comparison: same
drivers, only the road changes.

Play/Pause/Replay advances the existing slider in the same 100-driver steps; it does
not introduce another model or result. Reduced-motion visitors jump to the identical
endpoint. I also shortened the introduction, moved SVG labels away from road strokes,
and added browser checks for the first-screen experiment position, label clearance and
the complete play lifecycle.

## Mon 17 Aug — finishing stopped hijacking the page

The first endpoint reveal was technically in normal document flow, but the controller
scrolled it into view as soon as playback finished. That made a large result panel feel
like a pop-up and interrupted the visitor before they had chosen to compare anything.
I removed every automatic result scroll and separated “finish moving drivers” from
“compare the networks.” The endpoint now adds one small invitation inside the existing
calculator. Its button deliberately opens a centred result surface with the controlling
`65 → 80` comparison first, followed by only two explanations: what changed and why the
bad state persists. Keyboard and reduced-motion paths use the same explicit action.

## Mon 17 Aug — the extra playback control did not earn its place

The slower Play/Pause/Replay control worked, but it duplicated the slider and made the
experiment feel managed rather than directly explored. The user rejected it. I removed
the control, timer, playback state, responsive styling and dedicated browser path rather
than merely hiding the button. The range input is again the only mechanism that changes
driver allocation; the deliberate comparison and close-road actions remain distinct.
