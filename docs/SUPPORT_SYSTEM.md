# Support System Guide

Overview of the support and feedback systems for the Metabolic-Tracker pilot.

---

## Support Ticketing System

### Overview

The built-in ticketing system allows users to report issues and track their resolution.

### User Access

**Participants:**
- Create tickets at `/api/support/tickets`
- View their own tickets
- Add responses to their tickets

**Coaches:**
- View all tickets (read-only by default)
- Respond to participant tickets

**Admins:**
- Full ticket management
- Assign tickets
- View statistics

### Ticket Categories

| Category | Description | Default Priority |
|----------|-------------|------------------|
| `bug` | Something isn't working | Medium |
| `question` | How-to or clarification | Low |
| `feature_request` | Suggestion for improvement | Low |
| `access_issue` | Login or permission problems | High |
| `data_issue` | Missing or incorrect data | High |
| `other` | General inquiry | Low |

### Priority Levels and SLAs

| Priority | First Response | Resolution | Use For |
|----------|----------------|------------|---------|
| Urgent | 2 hours | 4 hours | Cannot use app, data loss |
| High | 4 hours | 24 hours | Major feature broken |
| Medium | 24 hours | 72 hours | Bug, partial issue |
| Low | 72 hours | 7 days | Questions, suggestions |

### API Endpoints

**User Endpoints:**
```
POST /api/support/tickets       - Create ticket
GET  /api/support/tickets       - Get own tickets
POST /api/support/tickets/:id/responses - Add response
```

**Admin Endpoints:**
```
GET   /api/admin/support/tickets     - Get all tickets
GET   /api/admin/support/stats       - Get statistics
GET   /api/admin/support/sla-breaches - Get SLA breaches
PATCH /api/admin/support/tickets/:id - Update ticket
POST  /api/admin/support/tickets/:id/notes - Add internal note
```

### Creating a Ticket (Example)

```javascript
// User creates a ticket
fetch('/api/support/tickets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    category: 'bug',
    subject: 'Chart not loading',
    description: 'When I click on Trends, the glucose chart shows "Loading..." forever.',
    metadata: {
      browser: 'Chrome 120',
      url: '/trends'
    }
  })
});
```

### Ticket Workflow

```
[Open] → [In Progress] → [Waiting on User] → [Resolved] → [Closed]
                ↑              ↓
                └──────────────┘
```

---

## Feedback Collection System

### Overview

Collects user feedback for product improvement, including:
- Bug reports
- Feature requests
- General suggestions
- Satisfaction ratings
- NPS scores

### Feedback Types

| Type | Description | When to Use |
|------|-------------|-------------|
| `bug` | Report an issue | Something broken |
| `feature_request` | Suggest new feature | "I wish I could..." |
| `suggestion` | Improvement idea | "It would be better if..." |
| `praise` | Positive feedback | "I love this feature!" |
| `complaint` | Negative feedback | General dissatisfaction |
| `general` | Other feedback | Anything else |

### API Endpoints

**User Endpoints:**
```
POST /api/feedback      - Submit feedback
GET  /api/feedback      - Get own feedback
```

**Admin Endpoints:**
```
GET   /api/admin/feedback              - Get all feedback
GET   /api/admin/feedback/summary      - Get summary stats
GET   /api/admin/feedback/feature-requests - Feature request summary
PATCH /api/admin/feedback/:id          - Update status
GET   /api/admin/feedback/export       - Export data
```

### Submitting Feedback (Example)

```javascript
// User submits feedback
fetch('/api/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'feature_request',
    content: 'I would love to be able to export my data to a spreadsheet.',
    rating: 4,
    npsScore: 8,
    context: {
      page: '/settings'
    }
  })
});
```

### NPS (Net Promoter Score)

Users can provide an NPS score (0-10):
- **Promoters (9-10)**: Enthusiastic users
- **Passives (7-8)**: Satisfied but not enthusiastic
- **Detractors (0-6)**: Unhappy users

**NPS Score Formula:**
```
NPS = (% Promoters) - (% Detractors)
```

Score ranges from -100 to +100.

### Automatic Tagging

Feedback is automatically tagged based on content:
- `login`, `charts`, `food-logging`, `glucose`, `messaging`
- `mobile`, `performance`, `usability`
- `positive`, `negative` (sentiment)

---

## Communication Protocols

### User Communication Channels

| Channel | Purpose | Response Time |
|---------|---------|---------------|
| In-app messaging | Coach communication | 24 hours |
| Support tickets | Technical issues | Per SLA |
| Email | Announcements | As needed |

### Status Updates

**During Incidents:**
1. Post status update within 15 minutes
2. Update every 30 minutes until resolved
3. Send resolution notification

**For Maintenance:**
1. Notify 24 hours in advance
2. Reminder 1 hour before
3. Confirmation when complete

### Email Templates

Located in: `docs/INCIDENT_RESPONSE.md`
- Outage notification
- Resolution notification
- Maintenance notice

---

## Support Workflow

### Daily Tasks

1. **Morning Review (9 AM)**
   - Check for urgent tickets
   - Review SLA breaches
   - Assign unassigned tickets

2. **Midday Check (1 PM)**
   - Follow up on in-progress tickets
   - Check for user responses

3. **End of Day (5 PM)**
   - Update ticket status
   - Escalate unresolved urgent items
   - Prepare for next day

### Ticket Handling

```
1. Ticket Received
   ↓
2. Auto-Priority Assignment
   ↓
3. Manual Review & Assignment
   ↓
4. Investigation
   ↓
5. Solution/Workaround
   ↓
6. Communicate to User
   ↓
7. Verify Resolution
   ↓
8. Close Ticket
```

### Escalation Path

| Level | Who | When |
|-------|-----|------|
| L1 | Support Team | Initial response |
| L2 | Engineering | Technical issues |
| L3 | Clinical Lead | Health-related concerns |
| L4 | Executive | Major incidents |

---

## Feedback Analysis

### Weekly Review Process

1. **Export Feedback**
   ```bash
   curl /api/admin/feedback/export > feedback_week.json
   ```

2. **Review Summary**
   - Total feedback count
   - NPS trend
   - Top feature requests
   - Common issues

3. **Categorize Insights**
   - Bugs to fix
   - Features to consider
   - UX improvements

4. **Update Roadmap**
   - Prioritize based on frequency and impact
   - Add to sprint planning

### Metrics to Track

| Metric | Target | Current |
|--------|--------|---------|
| Avg Response Time | <4 hours | TBD |
| Resolution Rate | >90% | TBD |
| NPS Score | >30 | TBD |
| Satisfaction Rating | >4.0 | TBD |

---

## Integration Options

### External Ticketing (Future)

If needed, tickets can be exported for external systems:
```bash
curl /api/admin/support/tickets/export > tickets.csv
```

Compatible with:
- Zendesk
- Freshdesk
- Intercom
- Custom systems

### Slack Integration

Configure `SLACK_WEBHOOK_URL` to receive:
- New urgent tickets
- SLA breach warnings
- Critical feedback alerts

---

## Best Practices

### For Support Staff

1. **Acknowledge quickly** - Even if you can't solve immediately
2. **Be specific** - Ask clear follow-up questions
3. **Document everything** - Use internal notes
4. **Follow up** - Check in after resolution

### For Product Improvement

1. **Tag consistently** - Use standard tags
2. **Look for patterns** - Multiple users = priority
3. **Close the loop** - Tell users when you ship their request
4. **Measure impact** - Track NPS before/after changes

### For Users

Encourage users to:
1. Be specific about the issue
2. Include steps to reproduce
3. Mention browser/device
4. Respond promptly to questions

---

## Quick Reference

### Support Ticket Statuses

| Status | Meaning |
|--------|---------|
| `open` | New, awaiting assignment |
| `in_progress` | Being worked on |
| `waiting_on_user` | Need user response |
| `resolved` | Solution provided |
| `closed` | Completed |

### Feedback Statuses

| Status | Meaning |
|--------|---------|
| `new` | Just submitted |
| `reviewed` | Seen by team |
| `actioned` | Changes made |
| `declined` | Not pursuing |

### Key URLs

```
Support Dashboard:  /api/admin/support/stats
Feedback Summary:   /api/admin/feedback/summary
SLA Breaches:       /api/admin/support/sla-breaches
Feature Requests:   /api/admin/feedback/feature-requests
```

---

*A responsive support system builds trust and helps improve the product. Every piece of feedback is valuable.*
