# GLP-1 Pilot — GHL Tag Architecture

Reference for checklist item **4.1** in `LAUNCH_CHECKLIST.md`. Nine tags in
three groups, defined by when and how they are applied. The `glp1-` prefix on
the quiz tags avoids collision with the existing consult-funnel quiz, which
writes into the same GHL account.

## Group 1 — Applied automatically at purchase (existing GHL provisioning workflows)

| Tag | Who gets it |
|---|---|
| `pilot-member` | Every buyer, both plans. The count of contacts carrying this tag is the seat count for checklist 3.6 (never revised upward). |
| `founding-3mo` | Three-month ($129) buyers. |
| `founding-monthly` | Monthly ($49) buyers. Configured 2026-07-29; not yet observed landing on a real buyer — verification rides with the next test checkout or the first real monthly sale. |

## Group 2 — Applied automatically before purchase (scorecard + launch email)

| Tag | Who gets it |
|---|---|
| `glp1-quiz-complete` | Finished the scorecard. |
| `glp1-risk-high` / `glp1-risk-elevated` / `glp1-risk-low` | Their scored risk band. |
| `glp1-prestart` | Chose "Not currently, but I'm considering it" on Q1. Gets a risk tag too. See checklist 5.4 (pre-starter results path). |
| `src-list` | Clicked the trigger link in the launch email ("Founding — list CTA" workflow). Marks list-sourced rather than cold. |

## Group 3 — Applied by hand each Sunday from the CSV export

Source: weekly run of `scripts/export-member-activity` (see checklist 4.4).

| Tag | Definition |
|---|---|
| `activated` | Logged a meal AND a weight within their first 7 days. Deliberately does not require a glucose reading, because the meter ships from Amazon and needs strips, so requiring it would make day-7 activation partly a measure of shipping speed. |
| `at-risk` | Fewer than 2 days logged in the past week. |

**`at-risk` departs from the checklist's original 4.4 wording ("5-day-inactivity
trigger") — this is a deliberate change, recorded 2026-08-01.** Rationale:
someone silent a full week has usually already decided to leave, while someone
logging once a week is drifting but still reachable.

**Known issue (BACKLOG #14 — delete this note once fixed):** the export
script's `EXCLUDE_EMAILS` is missing two internal addresses
(`nlarson817@gmail.com`, `hippocratesdogood@gmail.com`), so those accounts will
appear in the CSV as members and get tagged. Fix deferred under the dev freeze
(Standing Rule 1). Until then, skip both addresses by hand during the Sunday
routine.

## Cadence and maintenance

- Weekly, Sunday evening. Gives a clean Monday-to-Sunday week and lands before
  the Monday SMS in the weekly-rhythm sequence (checklist 4.3).
- `at-risk` must be REMOVED as well as added each Sunday. If it only
  accumulates, by month two everyone who ever had a slow week still carries it
  and the re-engagement sequence fires at people who came back weeks ago.
- The two hand-applied tags (`activated`, `at-risk`) are the only ones that can
  go stale if a week is skipped.
