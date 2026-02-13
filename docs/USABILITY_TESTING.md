# Usability Testing Report

Comprehensive usability analysis and testing protocol for the Metabolic-Tracker pilot.

---

## Executive Summary

### Key Findings

| Area | Friction Level | Impact | Recommendation |
|------|----------------|--------|----------------|
| Food Logging | High | Critical | Simplify to 1-step save |
| Admin User Setup | High | Medium | Consolidate modals |
| Metric Entry | Medium | High | Inline date selection |
| Onboarding | Medium | Medium | Add skip options |
| Dashboard | Low | N/A | Good baseline |

### Overall Assessment

The application is functional but several workflows require more interactions than necessary. The highest-impact improvements would be:

1. **Reduce food logging from 5-7 clicks to 2-3 clicks**
2. **Consolidate admin participant setup to single form**
3. **Add inline editing for common operations**

---

## Critical User Flows

### Flow 1: Participant - First-Time Onboarding

**Goal:** New user completes setup and sees dashboard

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Login | Enter email/password | 10s | Low |
| 2 | Reset Password | Create new password | 30s | Medium |
| 3 | Onboarding Step 1 | Read & accept consent | 60s | High |
| 4 | Onboarding Step 2 | Enter name, select units | 20s | Low |
| 5 | Onboarding Step 3 | View success | 5s | Low |
| 6 | Dashboard | First view | - | - |

**Total:** 6 screens, ~2 minutes, 8+ interactions

**Friction Points:**
- Long consent text with no progress indicator
- Cannot skip password reset even if already strong
- Units preference could be defaulted
- Coach selection appears mandatory but is optional

**Recommendations:**
- Add estimated read time for consent
- Auto-skip password reset if password meets requirements
- Pre-select default units (Imperial for US)
- Clearly mark coach selection as "Optional"

---

### Flow 2: Participant - Daily Glucose Logging

**Goal:** Log morning fasting glucose reading

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Dashboard | Click glucose card "+" | 2s | Low |
| 2 | Modal | Select metric type (pre-selected) | 0s | Low |
| 3 | Modal | Enter glucose value | 5s | Low |
| 4 | Modal | Select context (Fasting) | 3s | Medium |
| 5 | Modal | Click Save | 2s | Low |

**Total:** 1 modal, ~12 seconds, 4 interactions

**Friction Points:**
- Context selector adds step (could default to most likely)
- No quick-entry from dashboard card

**Recommendations:**
- Default context to "Fasting" for morning entries
- Add quick-log mode: click card → enter value → auto-save

---

### Flow 3: Participant - Daily Food Logging

**Goal:** Log lunch meal

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Food Log | Click "Log Food" | 2s | Low |
| 2 | Modal | Enter meal description | 15s | Low |
| 3 | Modal | Select meal type | 3s | Low |
| 4 | Modal | Click "Analyze" | 2s | Medium |
| 5 | Modal | Wait for AI analysis | 3-5s | High |
| 6 | Modal | Review nutrition | 5s | Low |
| 7 | Modal | Click "Save Entry" | 2s | Low |

**Total:** 1 modal, ~30 seconds, 6 interactions

**Friction Points:**
- Two-step save (Analyze → Save) is confusing
- AI loading time creates uncertainty
- No "save without analysis" option
- Photo analysis requires additional steps

**Recommendations:**
- Combine Analyze + Save into single action
- Show skeleton loading during analysis
- Add "Save as-is" option to skip AI
- Preview photo before analysis

---

### Flow 4: Participant - View Progress

**Goal:** Check weekly glucose trends

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Any Page | Click "Trends" nav | 2s | Low |
| 2 | Trends | View default chart | 0s | Low |
| 3 | Trends | Select metric type (if different) | 3s | Low |
| 4 | Trends | Select time range | 3s | Low |

**Total:** 1 page, ~8 seconds, 3 interactions

**Friction Points:**
- Default metric may not be user's most-tracked
- No personalized default based on logging history

**Recommendations:**
- Default to user's most frequently logged metric
- Remember last-viewed metric

---

### Flow 5: Participant - Message Coach

**Goal:** Ask coach a question

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Any Page | Click "Messages" nav | 2s | Low |
| 2 | Messages | Type message | 20s | Low |
| 3 | Messages | Click Send | 2s | Low |

**Total:** 1 page, ~25 seconds, 3 interactions

**Friction Points:**
- No indication of coach response time expectations
- No read receipts

**Recommendations:**
- Show "Typically responds within X hours"
- Add message status (sent/delivered/read)

---

### Flow 6: Coach - Review Patient Dashboard

**Goal:** Check on participant's progress

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Admin | Click "Participants" nav | 2s | Low |
| 2 | List | Find participant (scroll/search) | 5s | Low |
| 3 | List | Click participant row | 2s | Low |
| 4 | Modal | View details | - | - |

**Total:** 1 list + 1 modal, ~10 seconds, 3 interactions

**Friction Points:**
- Modal view limits screen real estate
- Cannot compare multiple participants easily
- No quick actions from list view

**Recommendations:**
- Full-page participant view option
- Add quick-view hover cards
- Inline status indicators on list

---

### Flow 7: Coach - Respond to Alert

**Goal:** Address patient with flagged reading

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Admin Dashboard | View flagged list | 0s | Low |
| 2 | Dashboard | Click flagged participant | 2s | Low |
| 3 | Modal | Review data | 10s | Low |
| 4 | Modal | Click "Message" | 2s | Low |
| 5 | Messages | Type message | 30s | Low |
| 6 | Messages | Send | 2s | Low |

**Total:** 2 pages + 1 modal, ~45 seconds, 5 interactions

**Friction Points:**
- Navigation from alert to message requires page change
- No pre-filled message templates

**Recommendations:**
- Add "Quick Message" from participant modal
- Provide message templates for common alerts

---

### Flow 8: Admin - Add New Participant

**Goal:** Enroll new participant in pilot

**Current Steps:**

| Step | Screen | Action | Time Est. | Friction |
|------|--------|--------|-----------|----------|
| 1 | Participants | Click "Add Participant" | 2s | Low |
| 2 | Modal 1 | Enter name | 5s | Low |
| 3 | Modal 1 | Enter email | 5s | Low |
| 4 | Modal 1 | Enter phone (optional) | 5s | Low |
| 5 | Modal 1 | Select coach | 3s | Low |
| 6 | Modal 1 | Click Create | 2s | Low |
| 7 | Modal 2 | View temp password | 5s | Medium |
| 8 | Modal 2 | Copy password | 3s | Medium |
| 9 | Modal 2 | Close modal | 2s | Low |
| 10 | List | Find new participant | 5s | Low |
| 11 | List | Click "Macro Targets" | 2s | Low |
| 12 | Modal 3 | Enter protein target | 3s | Low |
| 13 | Modal 3 | Enter carbs target | 3s | Low |
| 14 | Modal 3 | Enter fat target | 3s | Low |
| 15 | Modal 3 | Enter calorie target | 3s | Low |
| 16 | Modal 3 | Click Save | 2s | Low |

**Total:** 3 modals, ~55 seconds, 15+ interactions

**Friction Points:**
- Three separate modal interactions
- Must find participant again after creation
- Password copy is extra step
- Macro targets require separate flow

**Recommendations:**
- Single-page wizard for complete setup
- Auto-copy password to clipboard
- Include macro targets in creation form
- Success message with "Set Targets" shortcut

---

## Usability Testing Protocol

### Test Participants

| Role | Count | Selection Criteria |
|------|-------|---------------------|
| Participant | 3 | Varied tech comfort levels |
| Coach | 2 | Different caseload sizes |
| Admin | 1 | Primary administrator |

### Testing Sessions

**Duration:** 30-45 minutes per participant

**Environment:**
- Quiet room with screen recording
- Participant's own device (preferred) or test device
- Moderator present but non-intervening

### Tasks by Role

#### Participant Tasks

| # | Task | Success Criteria | Expected Time |
|---|------|------------------|---------------|
| P1 | "Log your breakfast" | Entry saved with nutrition | <60s |
| P2 | "Log a blood glucose reading of 105" | Metric saved correctly | <30s |
| P3 | "View your glucose trend for the past week" | Chart displayed | <20s |
| P4 | "Send a message to your coach" | Message sent | <30s |
| P5 | "Find your average glucose for last month" | Value located | <30s |

#### Coach Tasks

| # | Task | Success Criteria | Expected Time |
|---|------|------------------|---------------|
| C1 | "View John Smith's recent entries" | Dashboard visible | <30s |
| C2 | "Check if any participants need attention" | Flagged list reviewed | <20s |
| C3 | "Send encouragement to a participant" | Message sent | <45s |
| C4 | "Review a participant's nutrition targets" | Targets visible | <30s |

#### Admin Tasks

| # | Task | Success Criteria | Expected Time |
|---|------|------------------|---------------|
| A1 | "Add a new participant named Jane Doe" | User created | <60s |
| A2 | "Reset a user's password" | New password generated | <30s |
| A3 | "Set nutrition targets for a participant" | Targets saved | <45s |
| A4 | "Generate a program report" | Report displayed | <30s |

### Observation Guidelines

**Record:**
- Time to complete each task
- Number of clicks/taps
- Hesitation points (>3 seconds pause)
- Errors made
- Questions asked
- Verbal frustration cues
- Success/failure of task

**Do Not:**
- Help unless participant is completely stuck
- Answer questions about how to do something
- React to frustration
- Lead the participant

### Think-Aloud Prompts

Use these prompts to encourage verbalization:
- "What are you looking for?"
- "What do you expect to happen?"
- "Why did you click that?"
- "Is this what you expected?"

### Post-Task Questions

1. "How easy was that task?" (1-5 scale)
2. "What would make it easier?"
3. "Was anything confusing?"
4. "Did anything surprise you?"

### Post-Session Questions

1. "What was your overall impression?"
2. "What did you like most?"
3. "What was most frustrating?"
4. "Would you use this daily?"
5. "How does this compare to other health apps?"

---

## Identified Friction Points

### Critical (Fix Before Pilot)

| ID | Issue | Affected Flow | Impact |
|----|-------|---------------|--------|
| FP-001 | Food logging requires 2-step Analyze+Save | Food Log | Task abandonment |
| FP-002 | Admin user creation spans 3 modals | User Setup | Admin frustration |
| FP-003 | No error recovery for voice input failure | Food Log | User confusion |
| FP-004 | Date picker adds modal for backfill | Metric Entry | Extra clicks |

### High (Fix During Pilot)

| ID | Issue | Affected Flow | Impact |
|----|-------|---------------|--------|
| FP-005 | Consent text has no progress indicator | Onboarding | User fatigue |
| FP-006 | Coach assignment unclear if optional | Onboarding | Confusion |
| FP-007 | No quick-log from metric cards | Dashboard | Missed convenience |
| FP-008 | Photo preview only after analysis | Food Log | Uncertainty |
| FP-009 | No message templates for coaches | Coach Messaging | Time waste |
| FP-010 | Password requires manual copy | User Setup | Extra step |

### Medium (Post-Pilot)

| ID | Issue | Affected Flow | Impact |
|----|-------|---------------|--------|
| FP-011 | Default metric not personalized | Trends | Minor confusion |
| FP-012 | No read receipts for messages | Messaging | Uncertainty |
| FP-013 | Participant modal limits view | Coach Review | Cramped display |
| FP-014 | No bulk admin actions | User Management | Scalability |
| FP-015 | Units preference could auto-detect | Onboarding | Minor friction |

### Low (Nice to Have)

| ID | Issue | Affected Flow | Impact |
|----|-------|---------------|--------|
| FP-016 | No dark mode persistence | All | Cosmetic |
| FP-017 | No keyboard shortcuts | Power users | Efficiency |
| FP-018 | Charts not exportable | Trends | Data access |
| FP-019 | No undo for deleted entries | Data Entry | Safety net |

---

## Mobile Experience Assessment

### Testing Checklist

| Area | Test | Pass Criteria |
|------|------|---------------|
| Touch Targets | All buttons ≥44px | Easily tappable |
| Text Size | Body text ≥16px | Readable without zoom |
| Form Fields | Inputs properly sized | Easy to tap and type |
| Navigation | Bottom nav accessible | One-thumb reach |
| Modals | Full-screen on mobile | No cramped forms |
| Charts | Readable on phone | Clear data points |
| Tables | Horizontal scroll works | All columns accessible |
| Keyboard | Forms don't obscure | Input visible while typing |

### Device Testing Matrix

| Device | Screen Size | OS Version | Priority |
|--------|-------------|------------|----------|
| iPhone 14 | 6.1" | iOS 17 | High |
| iPhone SE | 4.7" | iOS 16 | High |
| Samsung Galaxy S23 | 6.1" | Android 14 | High |
| iPad | 10.9" | iPadOS 17 | Medium |
| Older Android | 5.5" | Android 11 | Low |

### Known Mobile Issues

| Issue | Device | Severity | Workaround |
|-------|--------|----------|------------|
| Date picker behavior | iOS Safari | Medium | Use native picker |
| Voice input reliability | Android | High | Suggest text input |
| Modal sizing | Small screens | Low | Scroll enabled |

---

## Recommended Fixes

### Pre-Pilot (Must Fix)

#### Fix FP-001: Combine Food Analyze + Save

**Current:** User clicks "Analyze" → Wait → Click "Save Entry"

**Proposed:** User clicks "Log Meal" → Auto-analyze → Auto-save

**Implementation:**
```typescript
// Change from two-step to single mutation
const handleLogFood = async () => {
  // Show loading state
  const analyzed = await analyzeFood(description);
  await saveEntry(analyzed);
  // Toast: "Meal logged!"
};
```

**Effort:** Small (2-4 hours)

---

#### Fix FP-002: Consolidate Admin User Creation

**Current:** Create modal → Password modal → Macro targets modal

**Proposed:** Single wizard with all steps

**Implementation:**
- Step 1: Basic info (name, email, phone)
- Step 2: Coach assignment + macro targets
- Step 3: Success with password + copy button

**Effort:** Medium (1-2 days)

---

#### Fix FP-003: Voice Input Error Recovery

**Current:** "Voice recognition failed" with no guidance

**Proposed:** Clear fallback with pre-filled suggestion

**Implementation:**
```typescript
// On voice recognition error
if (error.name === 'NotAllowedError') {
  toast.error('Microphone access denied. Please type your meal description.');
  setShowTextInput(true);
}
```

**Effort:** Small (1-2 hours)

---

#### Fix FP-004: Inline Date Selection

**Current:** Click date → Modal opens → Select date → Close modal

**Proposed:** Dropdown or inline calendar

**Implementation:** Replace modal with Popover component

**Effort:** Small (2-4 hours)

---

### During Pilot

| Fix ID | Description | Effort | Sprint |
|--------|-------------|--------|--------|
| FP-005 | Add consent progress bar | Small | Week 1 |
| FP-006 | Mark coach as "Optional" | Tiny | Week 1 |
| FP-007 | Quick-log button on cards | Medium | Week 2 |
| FP-008 | Photo preview before analyze | Small | Week 2 |
| FP-009 | Message templates | Medium | Week 3 |
| FP-010 | Auto-copy password | Tiny | Week 1 |

---

## Usability Metrics

### Baseline Measurements

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Task Completion Rate | >90% | Success/Attempts |
| Average Task Time | <30s | Stopwatch |
| Error Rate | <10% | Errors/Tasks |
| User Satisfaction | >4/5 | Post-task rating |
| System Usability Scale | >70 | SUS questionnaire |

### Weekly Tracking

Track during pilot:
- Support tickets about UX issues
- Task abandonment (started but not completed)
- Feature usage frequency
- Time-on-task trends

---

## Testing Schedule

| Week | Activity | Participants |
|------|----------|--------------|
| Pre-pilot | Initial usability test | 3 team members |
| Week 1 | Participant testing | 2 participants |
| Week 2 | Coach testing | 1 coach |
| Week 4 | Follow-up testing | Same participants |
| Week 8 | Mid-pilot assessment | All roles |

---

## Appendix: System Usability Scale (SUS)

Use this standardized questionnaire after testing:

1. I think I would like to use this system frequently
2. I found the system unnecessarily complex
3. I thought the system was easy to use
4. I think I would need tech support to use this
5. I found the various functions well integrated
6. I thought there was too much inconsistency
7. I imagine most people would learn quickly
8. I found the system very cumbersome
9. I felt very confident using the system
10. I needed to learn a lot before I could get going

**Scoring:** Each item 1-5 (Strongly Disagree to Strongly Agree)
**Score Calculation:** ((Sum of odd items - 5) + (25 - Sum of even items)) × 2.5
**Benchmark:** >68 is above average

---

*This document should be updated after each round of usability testing with new findings and fixes implemented.*
