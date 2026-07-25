# glp1-quiz-spec.md

Specification for the GLP-1 muscle risk scorecard. Checklist item 3.2.

**Status:** draft for review
**Owner:** Chad Larson, NMD
**Platform:** ScoreApp (new scorecard, separate from the existing consult quiz)
**Written:** 2026-07-25

---

## 1. What this is for

A short assessment that sorts GLP-1 users by how much muscle they are likely
losing, and routes them to the Founding Member offer.

It has three jobs, in order:

1. Capture an email from someone actively taking a GLP-1
2. Surface a risk they can feel but have not named
3. Make measurement look like the obvious response rather than a pitch

The third job is the hard one. A quiz that only generates alarm produces
unsubscribes. The scoring is built so that someone doing it right can score
low, which is what makes a high score mean something.

## 2. Where it sits

```
content (YouTube, podcast, social, email)
        ↓
    the quiz          ← this document
        ↓
  results page ×3     ← identical CTA on all three
        ↓
   sales page         ← item 3.3
        ↓
    checkout          ← built, live
```

Per standing rule 3, every asset points here. The quiz is the single front
door.

## 3. Mechanics

- Eight questions, single-select, no free text
- Email captured before results are shown
- Three result bands
- Score range 0 to 24, higher means higher risk
- Target completion time under 90 seconds

### Why email-before-results

It costs some completions. It is worth it here because the results pages are
the argument for the offer, and a scorecard that gives away its conclusion
without capture leaves the sequence with nothing to send.

## 4. The questions

Copy is written to design system v1.1. Sentence case, no bold, no em dashes.

---

### Q1. How long have you been taking a GLP-1 medication?

| Answer | Points |
|---|---|
| Not currently, but I'm considering it | 1 |
| Less than 2 months | 1 |
| 2 to 6 months | 2 |
| More than 6 months | 2 |

Longer exposure means more cumulative lean mass at stake. The first option
keeps pre-starters in the funnel rather than dead-ending them; see §9 for the
open question about branching them separately.

---

### Q2. Roughly how fast are you losing weight right now?

| Answer | Points |
|---|---|
| Under 1 pound a week | 0 |
| 1 to 2 pounds a week | 1 |
| 2 to 3 pounds a week | 3 |
| More than 3 pounds a week | 4 |
| I'm not sure | 3 |

Rate of loss is the strongest single predictor of how much of that loss is
lean tissue rather than fat. "Not sure" scores high on purpose, because not
knowing is itself the problem this program addresses.

---

### Q3. Do you know roughly how much protein you eat in a day?

| Answer | Points |
|---|---|
| Yes, and I consistently hit a target I've set | 0 |
| Yes, roughly, but I don't always hit it | 2 |
| I have a vague sense but don't track it | 3 |
| No idea | 4 |

Weighted heaviest alongside Q4. Protein is the primary lever, and appetite
suppression makes it the hardest macro to hit on a GLP-1. Most respondents
will land at 3 or 4.

---

### Q4. How often do you do resistance training?

| Answer | Points |
|---|---|
| Three or more times a week | 0 |
| One or two times a week | 2 |
| Occasionally, not on a schedule | 3 |
| Rarely or never | 4 |

The other heaviest weight. Without a load stimulus the body has no reason to
retain muscle it isn't using, and that is true regardless of protein intake.

---

### Q5. What's your age range?

| Answer | Points |
|---|---|
| Under 40 | 0 |
| 40 to 49 | 1 |
| 50 to 59 | 2 |
| 60 or older | 3 |

Not modifiable, but it compounds everything above.

---

### Q6. Since starting, have you noticed changes in strength or stamina?

| Answer | Points |
|---|---|
| No, I feel as strong as before | 0 |
| Hard to say | 1 |
| Yes, some things feel harder than they used to | 2 |
| Yes, noticeably weaker or more tired | 3 |

This is the question that makes the risk concrete. It is also the one most
likely to be answered honestly, because the person has already noticed and
has not had a name for it.

---

### Q7. What are you tracking right now?

| Answer | Points |
|---|---|
| Weight, waist, and at least one blood marker | 0 |
| Weight and waist | 1 |
| Weight only | 2 |
| Nothing regularly | 2 |

Most will answer "weight only," which sets up the entire argument. Scored
lightly because it measures behavior rather than physiological risk.

---

### Q8. Do you have a plan for when you come off the medication?

| Answer | Points |
|---|---|
| Yes, a specific one | 0 |
| A general idea | 1 |
| Not yet | 2 |
| I try not to think about it | 2 |

Surfaces the anxiety underneath the whole category. Scored lightly for the
same reason as Q7, but it is likely the strongest converter in the set.

---

## 5. Scoring and bands

Maximum score: 24.

| Band | Score | GHL tag |
|---|---|---|
| Low | 0 to 9 | `glp1-risk-low` |
| Elevated | 10 to 17 | `glp1-risk-elevated` |
| High | 18 to 24 | `glp1-risk-high` |

### Sanity check on the distribution

A person doing everything right (losing under a pound a week, hitting a
protein target, lifting three times a week, under 40, no strength change,
tracking properly, has an off-ramp plan) scores **2**. Low band. The result is
achievable, which is what keeps the instrument honest.

A realistic median respondent (three months in, losing two to three pounds a
week, vague on protein, lifts occasionally, age 50 to 59, some things feel
harder, weight only, no plan) scores **18**. High band, by one point.

That median is uncomfortable and probably accurate. Most people taking a
GLP-1 without supervision are under-eating protein and not training. If the
bands are ever tuned, tune them because the clinical reasoning changed, not
because the distribution felt unflattering. Standing rule 2 applies to
scorecards as much as to seat counts.

---

## 6. Results pages

All three share the same call to action, per item 3.4. They differ in framing
and in what they name as the driver, never in the offer.

Each page carries the disclaimer footer described in §8.

---

### Low band

**Headline:** Your risk looks low

You're doing the two things that matter most: eating enough protein and
loading your muscles regularly. That combination is why your score came out
where it did.

The thing to watch is that this gets harder, not easier, as the dose goes up
and appetite drops further. The people who lose muscle are rarely the ones who
never knew what to do. They're the ones who were doing it right and drifted
when eating got harder.

What would tell you early that you're drifting is data: waist holding steady
while weight falls, strength staying flat, glucose and ketones showing you're
actually running on fat rather than breaking down tissue.

[CTA]

---

### Elevated band

**Headline:** Your risk is elevated

Based on your answers, some of your weight loss is likely coming from muscle
rather than fat. That's not a failure. It's what the medication does when
protein and training don't keep up with the rate of loss.

The specific things driving your score are [dynamic: the two highest-scoring
answers, named plainly].

The uncomfortable part is that the scale can't tell you which kind of tissue
you're losing. It reports a single number that looks like progress either way.
Waist circumference, strength over time, and glucose and ketone readings can
distinguish them. That's what the program is built to track.

[CTA]

---

### High band

**Headline:** Your risk is high

Your answers put you in the range where meaningful muscle loss is likely
already happening.

That's worth taking seriously without panicking about it. Muscle is the tissue
that sets your metabolic rate, and losing it during weight loss is the single
most common reason weight comes back afterward. The mechanism isn't willpower.
It's that you end up with a smaller engine than you started with.

What's driving your score is [dynamic: the two highest-scoring answers].

None of this means the medication is the wrong choice. It means it works
faster than most people's protein intake and training can keep up with, and
the gap is measurable rather than theoretical.

[CTA]

---

### Shared CTA

Identical across all three bands:

> **Founding Member enrollment is open**
> Fifty seats. Physician-led tracking built specifically for people losing
> weight on a GLP-1.
> [See what's included →]

Links to the sales page (item 3.3).

---

## 7. GHL integration

### Tags written on completion

| Condition | Tag |
|---|---|
| Every completion | `glp1-quiz-complete` |
| Score 0 to 9 | `glp1-risk-low` |
| Score 10 to 17 | `glp1-risk-elevated` |
| Score 18 to 24 | `glp1-risk-high` |
| Q1 = "not currently, but considering" | `glp1-prestart` |

### Fields to pass through

- Email (required)
- First name
- Numeric score
- Band label

The numeric score matters. Band alone loses the difference between an 18 and a
24, and that difference is worth having when reading conversion by band later.

### Namespacing note

Checklist 4.1 currently lists bare `risk-high`, `risk-elevated`, `risk-low`.
This spec prefixes them. The reason is collision: the existing consult quiz
writes into the same GHL account, and unprefixed risk tags from two different
scoring models on one contact are unreadable downstream. 4.1 needs updating to
match, or this spec needs changing. Do not leave them inconsistent.

---

## 8. Disclaimer footer

Appears on every results page:

> This scorecard is an educational tool, not a medical evaluation. It does not
> diagnose anything and it is not a reason to change or stop any medication.
> Talk to whoever prescribes your GLP-1 before making changes. If you're a
> patient of this practice, this doesn't replace your visits.

Written plainly rather than in legal register, consistent with the voice.

---

## 9. Open questions

1. **Pre-starters.** Q1 lets someone who has not started answer the remaining
   questions, several of which assume they are already losing weight. Options
   are to branch them to their own short path, or accept the noise for v1 and
   fix it once there is data. Recommendation: accept for v1, tag them
   `glp1-prestart`, revisit after fifty completions.

2. **Weighting review.** The relative weights in §4 are a proposal built from
   the clinical model, not from your explicit ranking. Q3 and Q4 carry the most
   at 4 points each. Confirm or adjust before build.

3. **Scorecard title.** Working title is "The GLP-1 muscle risk scorecard."
   Alternatives worth considering: "Muscle risk on a GLP-1," "What's actually
   coming off." Avoid anything phrased as a rhetorical question, per the
   anti-patterns list.

4. **Where this file lives.** Written assuming it sits alongside
   LAUNCH_CHECKLIST.md in the Metabolic-Tracker repo, since that is what the
   checklist references. The design system lives in AIS-OS instead, so there is
   an argument for putting funnel copy there. Pick one and keep the other four
   funnel docs with it.

---

## 10. Acceptance criteria

Item 3.2 is done when all of the following pass. Checklist wording is "took
quiz 3× hitting each band; tags land in GHL."

### Test A — low band

Answers: Q1 less than 2 months, Q2 under 1 pound, Q3 consistently hit,
Q4 three or more times, Q5 under 40, Q6 as strong as before, Q7 weight waist
and marker, Q8 specific plan.

Expected score: **2**. Expected band: low. Expected tags:
`glp1-quiz-complete`, `glp1-risk-low`.

### Test B — elevated band

Answers: Q1 2 to 6 months, Q2 1 to 2 pounds, Q3 roughly but inconsistent,
Q4 one or two times, Q5 40 to 49, Q6 hard to say, Q7 weight and waist,
Q8 general idea.

Expected score: **10**. Expected band: elevated. Expected tags:
`glp1-quiz-complete`, `glp1-risk-elevated`.

This one sits exactly on the lower boundary, which is deliberate. It verifies
the band edge rather than the middle.

### Test C — high band

Answers: Q1 more than 6 months, Q2 more than 3 pounds, Q3 no idea, Q4 rarely
or never, Q5 60 or older, Q6 noticeably weaker, Q7 nothing regularly, Q8 try
not to think about it.

Expected score: **24**. Expected band: high. Expected tags:
`glp1-quiz-complete`, `glp1-risk-high`.

### Test D — pre-starter

Q1 not currently but considering, remaining answers arbitrary.

Expected tags include `glp1-prestart`.

### Also verify

- Email capture fires before results render, not after
- Contact appears in GHL with email, first name, numeric score, and band
- All three results pages carry the identical CTA and it resolves to the
  sales page
- Disclaimer footer present on all three
- Mobile: completable one-handed, no horizontal scroll
- Use a plus-alias email per test run, and clean them up afterward the way the
  Phase 2 test contacts were handled
