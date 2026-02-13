# Known Issues & Workarounds

This document tracks known issues in the current release, their workarounds, and planned fixes.

**Last Updated:** 2024-01-15
**Current Version:** 1.0.0-pilot

---

## Critical Issues

*No critical issues at this time.*

---

## High Priority Issues

### KI-001: Food Photo Analysis Occasionally Misidentifies Items

**Status:** Investigating
**Affected:** All users with photo food entry
**First Reported:** 2024-01-10

**Description:**
The AI food analysis sometimes misidentifies food items, particularly:
- Mixed dishes (e.g., casseroles)
- Ethnic foods
- Items with similar appearance

**Workaround:**
1. After photo analysis completes, review detected items
2. Edit any incorrect items manually
3. For complex meals, consider text entry instead

**Planned Fix:** Improve AI prompts for ambiguous foods (v1.0.1)

---

### KI-002: Charts May Not Update Immediately After Entry

**Status:** Known
**Affected:** All users
**First Reported:** 2024-01-08

**Description:**
After entering a new metric or food entry, charts may not show the new data immediately due to caching.

**Workaround:**
1. Wait 60 seconds for cache to refresh
2. Or manually refresh the page
3. Or navigate away and back to the trends page

**Planned Fix:** Implement cache invalidation on new entries (v1.0.1)

---

## Medium Priority Issues

### KI-003: Date Picker Behavior Inconsistent on Safari iOS

**Status:** Known
**Affected:** iOS Safari users
**First Reported:** 2024-01-05

**Description:**
The date picker component displays differently on iOS Safari compared to other browsers. Some users report difficulty selecting dates.

**Workaround:**
1. Tap the date field to open native date picker
2. Scroll wheels to select date
3. Tap outside picker to confirm
4. Alternative: Use Chrome on iOS

**Planned Fix:** Implement consistent date picker component (v1.0.2)

---

### KI-004: PDF Export May Timeout for Large Date Ranges

**Status:** Known
**Affected:** Coaches/Admins generating reports
**First Reported:** 2024-01-12

**Description:**
Generating PDF reports for date ranges longer than 3 months may timeout or fail with "Export failed" error.

**Workaround:**
1. Limit report date range to 3 months or less
2. Generate multiple reports for longer periods
3. Use CSV export for large datasets

**Planned Fix:** Implement background report generation (v1.1.0)

---

### KI-005: Messages May Show as Unread After Reading

**Status:** Investigating
**Affected:** Intermittent, all users
**First Reported:** 2024-01-14

**Description:**
Occasionally, messages marked as read revert to unread status, causing incorrect notification badges.

**Workaround:**
1. Click on the conversation again to re-mark as read
2. If persists, refresh the page
3. This does not affect message content

**Planned Fix:** Fix read status race condition (v1.0.1)

---

## Low Priority Issues

### KI-006: Keyboard Navigation Limited in Some Modals

**Status:** Known
**Affected:** Users relying on keyboard navigation
**First Reported:** 2024-01-03

**Description:**
Tab navigation does not work correctly in some modal dialogs, making keyboard-only navigation difficult.

**Workaround:**
1. Use mouse/touch to interact with modals
2. Or use Tab key to focus on Close/Cancel button

**Planned Fix:** Accessibility improvements (v1.1.0)

---

### KI-007: Waist Measurement Units Not Converting

**Status:** Known
**Affected:** Users with cm preference viewing inches data
**First Reported:** 2024-01-06

**Description:**
Waist measurements entered in one unit system do not convert when viewing with different unit preference.

**Workaround:**
1. Enter measurements in your preferred unit
2. Previous entries will show in original unit
3. Manual conversion: 1 inch = 2.54 cm

**Planned Fix:** Add unit conversion display (v1.0.2)

---

### KI-008: Long Names Truncated in Coach Dashboard

**Status:** Known
**Affected:** Coaches viewing participants with long names
**First Reported:** 2024-01-09

**Description:**
Participant names longer than 25 characters are truncated without ellipsis in the dashboard card view.

**Workaround:**
1. Hover over name to see tooltip with full name
2. Click into participant profile for full name

**Planned Fix:** UI improvement (v1.0.2)

---

## Browser-Specific Issues

### KI-009: Safari Private Mode Session Issues

**Status:** Known
**Affected:** Safari users in Private Browsing mode
**First Reported:** 2024-01-04

**Description:**
Users in Safari Private Browsing mode may be logged out unexpectedly or unable to maintain session.

**Workaround:**
1. Use Safari in normal (non-private) mode
2. Or use a different browser

**Planned Fix:** Adjust session storage for private mode (v1.0.2)

---

### KI-010: Firefox PDF Export Requires Popup Permission

**Status:** Known
**Affected:** Firefox users
**First Reported:** 2024-01-07

**Description:**
PDF exports open in a new window which may be blocked by Firefox's popup blocker.

**Workaround:**
1. Click "Allow popups" when prompted
2. Or disable popup blocker for this site:
   - Click shield icon in address bar
   - Allow popups

**Planned Fix:** Download PDF directly without popup (v1.0.1)

---

## Cosmetic Issues

### KI-011: Loading Spinner Sometimes Persists

**Status:** Known
**Affected:** Intermittent, all users
**First Reported:** 2024-01-11

**Description:**
Occasionally the loading spinner continues to display even after content has loaded.

**Workaround:**
1. Wait a moment - spinner usually clears
2. If persists, refresh the page

**Planned Fix:** Fix loading state management (v1.0.1)

---

### KI-012: Dark Mode Toggle Not Remembered

**Status:** Known
**Affected:** Users who prefer dark mode
**First Reported:** 2024-01-13

**Description:**
Dark mode preference resets to light mode on page refresh.

**Workaround:**
1. Toggle dark mode each session
2. Browser may remember if cookies enabled

**Planned Fix:** Persist theme preference (v1.0.1)

---

## Resolved Issues (Recent)

### KI-R001: Duplicate Entries on Double-Click (RESOLVED)

**Resolved in:** v1.0.0
**Resolution:** Added debounce to save button

### KI-R002: Timezone Display Incorrect (RESOLVED)

**Resolved in:** v1.0.0
**Resolution:** Fixed timezone handling on server

---

## Reporting New Issues

### How to Report

1. Check this document for existing issues
2. Gather information:
   - What you were doing
   - What you expected
   - What actually happened
   - Browser and device
   - Screenshots if possible
3. Report via:
   - In-app feedback button
   - Email: bugs@metabolic-tracker.app
   - Ask your coach to relay to admin

### What Happens Next

1. Issue triaged within 24 hours
2. Added to this document if confirmed
3. Prioritized based on impact
4. Fixed in upcoming release
5. You may be contacted for more info

---

## Planned Releases

### v1.0.1 (Target: Week 2)
- KI-001: Improved food analysis
- KI-002: Cache invalidation
- KI-005: Message read status fix
- KI-010: Firefox PDF fix
- KI-011: Loading spinner fix
- KI-012: Theme persistence

### v1.0.2 (Target: Week 4)
- KI-003: Consistent date picker
- KI-007: Unit conversion
- KI-008: Name truncation UI
- KI-009: Safari private mode

### v1.1.0 (Target: Week 8)
- KI-004: Background reports
- KI-006: Accessibility improvements
- New features TBD based on feedback

---

*This document is updated as issues are discovered and resolved. Check back regularly for the latest information.*
