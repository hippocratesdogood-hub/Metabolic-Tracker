# UX Improvement Backlog

Prioritized list of user experience improvements for the Metabolic-Tracker.

**Last Updated:** 2024-01-15
**Pilot Start:** Week 0

---

## Priority Legend

| Priority | Definition | Timeline |
|----------|------------|----------|
| P0 | Critical - Blocks pilot launch | Before pilot |
| P1 | High - Significant user impact | Weeks 1-2 |
| P2 | Medium - Improves experience | Weeks 3-6 |
| P3 | Low - Nice to have | Post-pilot |

---

## Pre-Pilot (P0) - Must Fix

### UX-001: Simplify Food Logging to Single Action

**Current State:**
- User enters food description
- Clicks "Analyze" button
- Waits for AI analysis
- Clicks "Save Entry" button
- 5-7 interactions total

**Target State:**
- User enters food description
- Clicks "Log Meal" button
- System analyzes and saves automatically
- 2-3 interactions total

**Acceptance Criteria:**
- [ ] Single button triggers analyze + save
- [ ] Loading state shows during analysis
- [ ] Success toast confirms save
- [ ] Entry appears in food log immediately

**Effort:** Small (4 hours)
**Owner:** TBD
**Files:** `client/src/pages/FoodLog.tsx`

---

### UX-002: Consolidate Admin User Creation

**Current State:**
- Modal 1: Create user (name, email, phone, coach)
- Modal 2: View/copy temporary password
- Modal 3: Set macro targets
- 15+ interactions across 3 modals

**Target State:**
- Single wizard with 2-3 steps
- Password auto-copied to clipboard
- Macro targets optional in same flow
- 8-10 interactions in one flow

**Acceptance Criteria:**
- [ ] Single modal/drawer with step indicator
- [ ] Step 1: Basic info + coach
- [ ] Step 2: Macro targets (skip option)
- [ ] Step 3: Success + password with copy
- [ ] Auto-copy password on generation

**Effort:** Medium (8-12 hours)
**Owner:** TBD
**Files:** `client/src/pages/Participants.tsx`

---

### UX-003: Voice Input Error Recovery

**Current State:**
- Voice recognition fails with generic error
- User unsure what to do next
- No fallback guidance

**Target State:**
- Clear error message with action
- Automatic switch to text input
- Suggestion based on partial recognition

**Acceptance Criteria:**
- [ ] Permission denied → Show text input + explanation
- [ ] Recognition failed → Show "Try typing instead"
- [ ] Partial recognition → Pre-fill text field
- [ ] Browser unsupported → Hide voice button + tooltip

**Effort:** Small (2-3 hours)
**Owner:** TBD
**Files:** `client/src/pages/FoodLog.tsx`

---

### UX-004: Inline Date Selection for Metrics

**Current State:**
- Click date field → Modal opens
- Select date in calendar modal
- Close modal → Return to form
- Extra modal interaction

**Target State:**
- Click date → Dropdown/popover opens
- Select date → Popover closes
- No modal required

**Acceptance Criteria:**
- [ ] Date picker opens as popover, not modal
- [ ] Calendar displays below input field
- [ ] Select date closes popover automatically
- [ ] Works on mobile (bottom sheet acceptable)

**Effort:** Small (2-4 hours)
**Owner:** TBD
**Files:** `client/src/components/MetricEntryModal.tsx`

---

## Week 1-2 (P1) - High Priority

### UX-005: Onboarding Progress Indicator

**Current State:**
- Terms consent is long scrollable text
- No indication of progress or length
- Users may abandon

**Target State:**
- Progress dots/steps visible
- Estimated time shown
- Scroll progress indicator

**Acceptance Criteria:**
- [ ] Step indicator (1 of 3, 2 of 3, etc.)
- [ ] "Takes about 2 minutes" text
- [ ] Scroll progress bar for consent
- [ ] "Almost done!" encouragement

**Effort:** Small (2-3 hours)
**Owner:** TBD
**Files:** `client/src/pages/Onboarding.tsx`

---

### UX-006: Mark Coach Selection as Optional

**Current State:**
- Coach dropdown appears mandatory
- No "skip" or "none" option visible
- Users may think they must select

**Target State:**
- Clear "Optional" label
- "No coach assigned" default option
- Skip explanation text

**Acceptance Criteria:**
- [ ] Label shows "(Optional)"
- [ ] Default option: "No coach needed"
- [ ] Helper text explains when to select

**Effort:** Tiny (30 minutes)
**Owner:** TBD
**Files:** `client/src/pages/Onboarding.tsx`

---

### UX-007: Quick-Log from Metric Cards

**Current State:**
- Click card → Opens full metric modal
- Must select type even though card is type-specific

**Target State:**
- Card has quick-add button
- Pre-selects metric type
- Minimal input required

**Acceptance Criteria:**
- [ ] "+" button on each metric card
- [ ] Modal opens with type pre-selected
- [ ] Focus on value input immediately
- [ ] One-click for common entries (e.g., "Same as yesterday")

**Effort:** Medium (4-6 hours)
**Owner:** TBD
**Files:** `client/src/pages/Dashboard.tsx`, `client/src/components/MetricCard.tsx`

---

### UX-008: Photo Preview Before Analysis

**Current State:**
- Select photo → Immediately analyze
- No chance to retake if blurry
- Can't review before submitting

**Target State:**
- Select photo → Show preview
- Options: Retake / Analyze
- Clear loading during analysis

**Acceptance Criteria:**
- [ ] Photo thumbnail shown after selection
- [ ] "Retake" button to select new photo
- [ ] "Analyze" button to proceed
- [ ] Loading overlay during AI processing

**Effort:** Small (2-3 hours)
**Owner:** TBD
**Files:** `client/src/pages/FoodLog.tsx`

---

### UX-009: Message Templates for Coaches

**Current State:**
- Coaches type every message from scratch
- Common phrases repeated
- Time-consuming for similar situations

**Target State:**
- Template selector in message composer
- Pre-filled messages for common scenarios
- Customizable templates

**Acceptance Criteria:**
- [ ] "Use Template" dropdown
- [ ] Templates: Welcome, Encouragement, Check-in, Concern
- [ ] Insert template text, cursor at edit point
- [ ] Can edit before sending

**Effort:** Medium (4-6 hours)
**Owner:** TBD
**Files:** `client/src/pages/Messages.tsx` (new templates component)

---

### UX-010: Auto-Copy Password on Generation

**Current State:**
- Password shown in modal
- User must click Copy button
- Extra interaction step

**Target State:**
- Password auto-copied on generation
- Toast confirms copy
- Still show Copy button as backup

**Acceptance Criteria:**
- [ ] Password copied to clipboard automatically
- [ ] Toast: "Password copied to clipboard"
- [ ] Copy button available if auto-copy fails
- [ ] Visible confirmation of copy action

**Effort:** Tiny (1 hour)
**Owner:** TBD
**Files:** `client/src/pages/Participants.tsx`

---

## Weeks 3-6 (P2) - Medium Priority

### UX-011: Personalized Default Metric in Trends

**Problem:** Default metric may not be user's most tracked.

**Solution:**
- Default to most frequently logged metric
- Remember last viewed metric

**Effort:** Small (2 hours)
**Files:** `client/src/pages/Trends.tsx`

---

### UX-012: Message Read Receipts

**Problem:** Users unsure if coach saw message.

**Solution:**
- Show sent/delivered/read status
- Timestamp for read status

**Effort:** Medium (6-8 hours)
**Files:** `client/src/pages/Messages.tsx`, `server/routes.ts`

---

### UX-013: Full-Page Participant View for Coaches

**Problem:** Modal limits information display.

**Solution:**
- Option to open full-page participant dashboard
- More room for charts and history

**Effort:** Medium (8-12 hours)
**Files:** New page component

---

### UX-014: Bulk Admin Actions

**Problem:** Cannot select multiple participants for actions.

**Solution:**
- Checkbox selection on list
- Bulk assign coach, export, deactivate

**Effort:** Large (1-2 days)
**Files:** `client/src/pages/Participants.tsx`

---

### UX-015: Auto-Detect Units Preference

**Problem:** User must manually select units.

**Solution:**
- Detect locale from browser
- Default Imperial for US, Metric elsewhere
- Still allow manual override

**Effort:** Tiny (1 hour)
**Files:** `client/src/pages/Onboarding.tsx`

---

## Post-Pilot (P3) - Nice to Have

### UX-016: Dark Mode Persistence

**Problem:** Theme resets on page refresh.

**Solution:** Save preference to localStorage or user profile.

**Effort:** Small (2 hours)

---

### UX-017: Keyboard Shortcuts

**Problem:** Power users want faster navigation.

**Solution:**
- `n` for new entry
- `g + d` for dashboard
- `?` for shortcut help

**Effort:** Medium (6 hours)

---

### UX-018: Chart Export

**Problem:** Cannot save charts as images.

**Solution:** Download as PNG/PDF button on charts.

**Effort:** Medium (4-6 hours)

---

### UX-019: Undo for Deleted Entries

**Problem:** No recovery for accidental deletion.

**Solution:**
- Soft delete with "Undo" toast
- 10-second undo window

**Effort:** Medium (6-8 hours)

---

### UX-020: Offline Support

**Problem:** App unusable without internet.

**Solution:**
- Service worker for offline
- Queue entries for sync
- Read-only data access offline

**Effort:** Large (2-3 days)

---

## Completed

| ID | Description | Completed | Version |
|----|-------------|-----------|---------|
| - | - | - | - |

---

## Tracking

### Sprint Progress

| Sprint | Planned | Completed | Carried Over |
|--------|---------|-----------|--------------|
| Pre-pilot | UX-001 to UX-004 | - | - |
| Week 1-2 | UX-005 to UX-010 | - | - |
| Week 3-4 | UX-011, UX-012 | - | - |

### Metrics

| Metric | Baseline | Current | Target |
|--------|----------|---------|--------|
| Avg clicks per food entry | 6 | - | 3 |
| Avg time for metric entry | 15s | - | 8s |
| Admin user creation time | 55s | - | 30s |
| SUS Score | - | - | >70 |

---

## How to Use This Backlog

1. **Add new issues:** Use next available UX-XXX ID
2. **Prioritize:** Assign P0-P3 based on impact
3. **Track progress:** Move to Completed when done
4. **Update metrics:** Measure before/after fixes

---

*This backlog should be reviewed weekly during the pilot to reprioritize based on user feedback.*
