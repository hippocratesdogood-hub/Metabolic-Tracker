# macro-calculator-spec.md

Build spec for the macro target calculator in Metabolic-Tracker.

**Status:** built — this document reflects the as-built implementation
**Owner:** Chad Larson, NMD
**Written:** 2026-07-27 · **Updated to as-built:** 2026-07-27

---

## 1. Why this exists

Macro targets are currently typed in by hand, per participant, in the admin
Participants page. Until a target exists a member sees no nutrition progress
bars, no meal quality scores, and no coaching messages, so most of the app is
inert until Chad intervenes.

At fifty founding members that is fifty manual setups standing between
purchase and any usable product. This replaces the manual step with a
calculation the member runs themselves during onboarding, reviewed afterward
rather than beforehand.

## 2. Design principle: calculate, then review

The member enters measurements and receives a target immediately. The target
is live and the app works. It also lands in an admin review queue flagged
unreviewed, where Chad confirms or adjusts.

This is deliberate rather than a compromise. It removes the launch bottleneck
without removing clinical oversight, it keeps the honest claim ("calculated
from your measurements, reviewed by your physician"), and it keeps a human in
the loop on a calculation that issues personalized nutrition targets — which
matters given the FDA SaMD considerations already in scope for this app.

## 3. Inputs

Collected from the member:

| Input | Type | Notes |
|---|---|---|
| Biological sex | male / female | Required by the Navy equation. Asked as biological sex, not gender identity, with a line explaining why. Stored on the user profile (`users.sex`). |
| Height | inches | Collected here; stored on the existing `users.height` column (integer cm), which predated this feature but was never populated. |
| Weight | pounds | Sourced from the member's most recent WEIGHT metric entry (logged at onboarding baseline). Not re-asked. |
| Waist | inches | Sourced from the most recent WAIST metric entry; the calculator screen prefills it and lets the member enter or correct it (edits save as a new metric entry first). Measure at navel, end of normal exhale. |
| Neck | inches | New. Measure below the larynx, tape sloping slightly down at the front. |
| Hip | inches | New. Women only. Measure at the widest point. |
| Activity level | one of four bands | See §4. |

Age is not collected. No formula in §4 uses it — the Navy equation is
circumference-based and Katch-McArdle deliberately replaces the age-dependent
Mifflin — and `users.date_of_birth` already exists if age is ever wanted for
calibration.

Units: the formula runs in inches and pounds, but the member enters
measurements in their preferred units (the app already supports a Metric
preference, and metric entries are stored normalized to kg/cm). Conversion to
imperial happens at the API boundary via the existing `shared/units.ts`
helpers.

Nothing else. No lab values, no goal selection, no deficit choice — the
deficit is fixed and clinical, not a member preference.

## 4. The calculation

All measurements in inches, weight in pounds, unless stated.

### Step 1 — Body fat percentage, Navy circumference method

Men:

```
BF% = 86.010 × log10(waist − neck) − 70.041 × log10(height) + 36.76
```

Women:

```
BF% = 163.205 × log10(waist + hip − neck) − 97.684 × log10(height) − 78.387
```

### Step 2 — Lean body mass

```
LBM_lb = weight_lb × (1 − BF%/100)
LBM_kg = LBM_lb / 2.20462
```

### Step 3 — Basal metabolic rate, Katch-McArdle

```
BMR = 370 + (21.6 × LBM_kg)
```

Katch-McArdle rather than Mifflin-St Jeor because a body composition estimate
is available, and Katch derives from lean mass rather than total weight.

Note for calibration: Katch returns a lower BMR than Mifflin for anyone
carrying meaningful body fat — roughly 6% lower at 200 lb and 35% body fat,
widening as body fat rises. Targets from this calculator will read lower than
the same person's ruled.me output at an equivalent deficit.

### Step 4 — Total daily energy expenditure

```
TDEE = BMR × activity_multiplier
```

| Band | Multiplier | Description shown to member |
|---|---|---|
| Sedentary | 1.200 | Little or no exercise, desk job |
| Lightly active | 1.375 | Daily walking, under 20 minutes of exercise |
| Moderately active | 1.550 | Physical job, or exercise several times a week |
| Very active | 1.725 | Physically demanding job, or intense daily exercise |

### Step 5 — Calorie target

```
calories = TDEE × 0.95
```

A fixed 5% deficit. Not member-configurable and not exposed as a choice.

The rationale belongs in the code comment: GLP-1 members are already eating
well below maintenance involuntarily because the medication suppressed
appetite. A prescribed deficit stacks on top of a pharmacological one, and
aggressive deficits drive the lean mass loss this program exists to prevent.
5% is a nudge, not a restriction.

### Step 6 — Protein

```
protein_g = LBM_lb × 1.2
```

1.2 g per pound of lean mass. This is the number the whole program turns on
and the one thing a member cannot get from a consumer app.

### Step 7 — Net carbohydrate

```
net_carbs_g = 60
```

Fixed for every member. Combined with the program's 14-hour overnight fast,
this produces at least mild intermittent ketosis in practice. It is not a
ketogenic-diet carb target and should not be described as one.

### Step 8 — Fat, as the remainder

```
fat_g = (calories − (protein_g × 4) − (net_carbs_g × 4)) / 9
```

Fat is the lever. Protein and carbs are fixed by the steps above; fat absorbs
whatever the calorie target leaves.

### Rounding

Round protein and fat to the nearest 5 g, then **restate calories as
(protein × 4) + (carbs × 4) + (fat × 9)** and store that restated figure as
the target. Carbs are already a round 60. Fat is derived from the unrounded
calorie and protein values before its own rounding.

Displaying 128.4 g of protein implies a precision the underlying body fat
estimate does not have — and restating calories from the rounded macros means
the four numbers the member sees reconcile exactly, and the stored target
matches what they were shown.

### Worked example

Woman, 5'6", 210 lb, waist 42", neck 14", hip 46", lightly active.

```
BF%      = 163.205 × log10(74) − 97.684 × log10(66) − 78.387  = 48.9%
LBM      = 210 × 0.511                                        = 107 lb / 48.6 kg
BMR      = 370 + (21.6 × 48.6)                                = 1420
TDEE     = 1420 × 1.375                                       = 1953
Raw cal  = 1953 × 0.95                                        = 1856
Protein  = 107.2 × 1.2                                        = 129 → 130 g
Carbs                                                         = 60 g
Fat      = (1856 − 515 − 240) / 9                             = 122 → 120 g
Calories = (130 × 4) + (60 × 4) + (120 × 9)                   = 1840
```

Used as a unit test (`server/__tests__/macroCalculator.test.ts`), alongside a
second worked example for each sex.

## 5. Guard rails

The calculation must not emit a nonsense target silently. Each condition
below either blocks the calculation or flags the result for review.

### Blocking — cannot compute

| Condition | Behavior |
|---|---|
| Men: waist − neck ≤ 0 | Block. "Those measurements don't look right — waist should be larger than neck. Check both and try again." |
| Women: waist + hip − neck ≤ 0 | Same. |
| Any measurement ≤ 0 or non-numeric | Block with a field-level message. |
| Height outside 48–84 inches | Block. Almost always a unit error. |
| Weight outside 70–700 lb | Block. |

### Flagging — computes, but marks the target for priority review

| Condition | Reason |
|---|---|
| BF% below 3 (men) or 8 (women) | Implausible; likely a mismeasurement |
| BF% above 60 (men) or 65 (women) | Same |
| Calorie target below 1400 (men) or 1200 (women) | Below common clinical floors |
| Fat below 40 g | Approaching essential fatty acid concerns |
| Protein above 250 g | Implausible for this population |

A flagged target still saves and still works. It surfaces at the top of the
review queue with the reason attached. The member is not shown the flag —
they see their target, and Chad sees why it needs a look.

Rationale: the Navy equation loses accuracy at higher body fat percentages,
and a member measuring themselves will mismeasure more often than a clinician
would. Both push the same direction, so the flag is doing real work rather
than decorating.

## 6. Where it sits

The onboarding wizard runs consent → baseline → **calculator** → first meal →
done (`client/src/pages/Onboarding.tsx`).

As built: the baseline step is unchanged (weight required, waist optional,
both saved as metric entries before the calculator runs). The remaining
measurements — sex, height, neck, hip, activity — live on the calculator step
itself (`client/src/components/MacroCalculatorStep.tsx`), which also shows a
waist field prefilled from the latest WAIST entry. One measurement screen
beyond baseline, per the "either is fine" allowance.

At the end of the calculator step the member sees their target and continues.
A "Skip for now" button proceeds without calculating — a member without a
target is in exactly the position every member was in before this existed, so
skipping degrades to prior behavior rather than breaking anything.

Existing members without targets get the prompt on the dashboard: the
pre-existing no-target empty state ("your coach will set your targets") was
repurposed into a "Calculate my targets" card that opens the same calculator
component in a dialog.

## 7. What the member sees

After calculating, four numbers and one sentence of context each:

```
Protein     130 g     The number that matters most. This is what
                      protects your muscle while you lose weight.

Net carbs    60 g     Paired with your overnight fast, this is what
                      moves you toward burning fat for fuel.

Fat         120 g     Fills the rest of your energy needs.

Calories   1,840      What the three above add up to.
```

Because calories are restated from the rounded macros (§4 Rounding), "what
the three above add up to" is exactly true, not approximately.

Do not show body fat percentage as a headline number. It is an input to the
calculation, not a result, and the estimate carries meaningful error. If it is
shown at all, show it small, with a note that it is an estimate from
measurements and will not match a body composition scale.

That note matters: the RENPHO scale in the device kit reports its own
bioimpedance body fat figure, and it will disagree with this one, sometimes
by a lot. The kit page already tells members not to treat any single body fat
number as fact. The app should say which number it used and why rather than
leaving them to discover the discrepancy alone.

Also show, quietly: "Dr. Larson reviews every target. He may adjust yours."

## 8. The review queue

As built: a section on the existing Participants page, implemented as its own
component (`client/src/components/MacroReviewQueue.tsx`). It renders only
when unreviewed calculations exist — the queue drains to zero, so it earns no
permanent navigation entry. API: `GET /api/admin/macro-calculations` and
`POST /api/admin/macro-calculations/:id/review` (coach-scoped like the other
admin routes).

Lists members whose target is unreviewed, flagged ones first, showing the
member, the calculated target, the inputs it came from, any flags, and the
date calculated.

Chad can approve as-is, or edit any of the four numbers and approve. Approving
sets a reviewed timestamp and reviewer. Editing stores both the original
calculated values and the adjusted ones — over fifty members that becomes a
record of where the formula runs hot or cold, which is worth having before
this is offered to anyone else.

Do not notify the member on approval. Silence is correct; the target was
already live.

## 9. Data model

As built: everything calculation-specific lives in a new satellite table,
`macro_calculations` — not columns on the participant record. This follows
the codebase pattern (targets, lab results, and metrics are all satellite
tables), keeps review-lifecycle state off the already-wide `users` row, and
makes v2 recalculation (§10) a zero-migration feature: one row per
calculation run, latest wins, history retained.

```
macro_calculations
  user_id               → users, cascade
  -- input snapshot (imperial, as the formula consumed them)
  sex                   enum male | female
  height_in             real
  weight_lb             real
  waist_in              real
  neck_in               real
  hip_in                real           nullable, women only
  activity_level        enum sedentary | light | moderate | very
  -- derived
  body_fat_pct          real
  lbm_lb                real
  calculated_protein_g  integer        pre-review values, retained verbatim
  calculated_carbs_g    integer
  calculated_fat_g      integer
  calculated_calories   integer
  flags                 jsonb          array of flag codes, empty if none
  review_status         enum unreviewed | approved | adjusted
  reviewed_at           timestamp      nullable
  reviewed_by           → users        nullable, no cascade (trail survives
                                       reviewer deletion)
  created_at            timestamp      (serves as calculated_at)
```

Only two things touch the participant record itself, because they are durable
profile attributes rather than calculation state: `sex` (new enum column) and
height, which reuses the pre-existing `users.height` column (integer cm) that
was never populated.

The live target continues to live in `macro_targets` — the calculator writes
it through the same `upsertMacroTarget` path the manual admin flow uses, so
everything downstream (progress bars, meal scores, Day view) works untouched.

Waist and weight come from existing metric entries — the most recent WAIST
and WEIGHT rows at calculation time; they are not collected into new
participant columns. The calculation row does, however, **snapshot the values
it actually used** (`waist_in`, `weight_lb`, alongside the others). That is
not a live duplicate — the member's metrics remain the source of truth — it
is what keeps a calculation reproducible after the member logs new metrics:
the review queue shows the inputs that produced the output, and the
calculated-vs-adjusted calibration record in §8 stays meaningful.

## 10. Out of scope for v1

Recalculation over time. A member's lean mass changes as they lose weight, so
targets drift out of date. The obvious v2 is a prompt to remeasure every four
to six weeks. Not now.

Goal selection. No maintain-versus-lose choice. Everyone in this program is
losing weight on a GLP-1; the 5% deficit is the clinical decision, not a
member preference.

~~Metric units.~~ Resolved in v1: the app already honors the member's unit
preference everywhere else (Metric members enter kg/cm at baseline), so
restricting this screen to imperial would have been a mid-wizard regression.
Measurements are entered in the preferred units and converted to imperial at
the API boundary (see §3).

## 11. Dependencies

The device kit page needs a line on how to measure neck, since it is a new
measurement and the tape measure is already in the kit. Same for hip.
(Out of this repo — the kit page lives on the marketing site. Still open.
In-app, each measurement field carries its own how-to helper text.)

The onboarding consent copy was updated as part of this build: bullet 1 now
states that the app can calculate personalized nutrition targets from
member-provided measurements and that every calculated target is reviewed by
Dr. Larson.

## 12. Acceptance criteria

- The worked example in §4 returns 130 g protein, 60 g carbs, 120 g fat,
  and 1,840 calories (restated from the rounded macros — see §4 Rounding)
- Men's and women's equations are each unit tested against a second worked
  example
- Every blocking guard rail returns its message rather than an exception
- A target that trips a flag still saves, still works, and appears at the top
  of the review queue with its reason
- A member who skips the calculator can complete onboarding
- The target appears in the app immediately: progress bars, meal scores, and
  the Day view all render without an admin touching anything
- Approving in the review queue does not notify the member
- Adjusting in the review queue preserves the originally calculated values
