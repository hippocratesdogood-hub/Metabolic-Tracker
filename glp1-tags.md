# GLP-1 Pilot — GHL Tag Architecture

Reference for checklist item **4.1** in `LAUNCH_CHECKLIST.md`. Twelve tags in
four groups, defined by when and how they are applied. The `glp1-` prefix on
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

## Group 3 — Applied automatically during onboarding (engagement tracking)

| Tag | Who gets it |
|---|---|
| `kit-viewed` | Clicked the device-kit page trigger link in an onboarding-sequence email (Sequence 1, checklist 4.2). Applied automatically by the separate "Kit link clicked" workflow. A record of who opened the kit page — the planned day-2 conditional branch on this tag was dropped (GHL branches cannot rejoin; see checklist 4.2), so nothing currently branches on it. |
| `sms-ok` | Clicked the SMS opt-in trigger link (points at join.theadaptlab.com/texts). Applied automatically by the "SMS opt-in — tag sms-ok" workflow. The record that someone consented to text check-ins. Consumed two ways: Sequence 2's Monday text is a **manual bulk send** to this segment as part of the weekly routine (the email goes to everyone automatically; see checklist 4.3), and Sequence 4's renewal −1 message **branches automatically** on this tag with an email fallback (checklist 4.5). |
| `onboarded` | Applied automatically as the final action of Sequence 1 (checklist 4.2), marking completion of the onboarding sequence. Consumed as the trigger for Sequence 2 (checklist 4.3) — the handoff from onboarding into the weekly rhythm. |

**Why `sms-ok` exists — the reasoning matters more than the tag.** The order
form collects a phone number but carries no consent language, and GoHighLevel's
One Step Order element has no way to add an optional checkbox — its only
checkbox is a required Terms and Conditions toggle, which can't serve as
marketing consent since consent can't be a condition of purchase. So SMS
consent is collected after purchase instead: the day 7 onboarding email offers
a Monday text check-in with a "tap here" trigger link, and tapping it lands on
a confirmation page at join.theadaptlab.com/texts that states what was agreed
to, message frequency, that consent is not a condition of purchase, and how to
stop. Consent is optional by design — some members will never opt in, and the
email path serves them instead.

## Group 4 — Applied by hand each Sunday from the CSV export

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

### Sunday procedure (stock GHL features — both halves tested 2026-08-04 with throwaway contacts)

1. **Remove last week's `at-risk`:** filter contacts by the `at-risk` tag →
   select all → More → Remove tags → name `at-risk`.
   ⚠️ **Caution:** bulk tag removal runs against whatever list is currently
   filtered, in an account holding 547 mostly real patient records. Confirm
   the contact count before acting, and never use the "Remove all tags"
   option in that modal.
2. **Import the week's CSV** and tick "Add tags to imported contacts" on the
   final **Verify** screen. Two easy-to-miss details: the tagging option
   appears only on Verify (not on Upload or Map), and Start import is gated
   behind a consent checkbox that has to be ticked by hand every time.

The full weekly routine has three hand-run steps (see checklist 6.4): this
Sunday tagging pass, the Monday bulk text to the `sms-ok` segment, and a check
of Stripe cancellations.
