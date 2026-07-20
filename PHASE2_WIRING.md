# PHASE2_WIRING.md — Money & Plumbing (operator guide)

Step-by-step wiring for **Phase 2** of the GLP-1 Founding Member pilot, written to
be followed **entirely in the browser** (Stripe + GoHighLevel dashboards). No code
changes are required — the provisioning endpoint is already live in production.

> **Companion docs:** `LAUNCH_CHECKLIST.md` (the gate — items 2.1–2.5), `SPRINT_REPORT.md`
> (webhook spec source of truth), `PILOT_RUNBOOK.md` (§4 manual webhook smoke test,
> §3.3 account cleanup), `SPRINT_NOTES.md` (#6 no in-app email transport, #7 temp-password
> hygiene). Funnel copy lives in `glp1-sales-page.md`, `glp1-ghl-sequences.md`.

## What "done" looks like (checklist 2.1–2.5)

| # | Item | This doc |
|---|---|---|
| 2.1 | Stripe products: $49/mo + $129 3-mo upfront, clear statement descriptor | §1 |
| 2.2 | Stripe → GHL: purchase applies `pilot-member`; $129 also `founding-3mo` | §2 |
| 2.3 | GHL → App provisioning webhook wired | §3 |
| 2.4 | Welcome email: login link + "reply if trouble" + device-kit link | §4 |
| 2.5 | Cancellation notification → Chad's inbox | §5 |
| — | Test-purchase → tagged contact → provisioned account → welcome email | §6 |

## Prerequisites (already true after Phase 1)

- Production is live and running the sprint code at **app.theadaptlab.com** (the
  primary domain). The old `app.doctorchadlarson.com` is still attached and serving
  for existing patients — all new wiring (webhooks, login links) uses the new domain.
- Railway env: `GHL_WEBHOOK_SECRET` **set** (confirmed), `APP_BASE_URL` set,
  `ENABLE_PUBLIC_SIGNUP` unset. You'll need the **value** of `GHL_WEBHOOK_SECRET`
  in §3 — copy it from Railway → the app service → Variables (reveal value).
- A Stripe account and a GoHighLevel sub-account (location) for the pilot.

---

## Architecture decision — how Stripe talks to GHL (read first)

There are three mechanisms to get a Stripe purchase into GHL. **Pick the preferred
one; the fallbacks exist only if you hit a wall.**

- **✅ Preferred — GHL as the checkout, Stripe as the connected processor.**
  Connect Stripe inside GHL (**Payments → Integrations → Stripe → Connect**), then
  sell through a **GHL order form / funnel step** that charges the Stripe product.
  Because GHL *is* the checkout, it fires a native **"Order Form Submission" /
  "Payment Received"** workflow trigger with the product identity in-hand — tagging
  and the provisioning webhook (§2, §3) hang directly off that trigger. No polling,
  no third party, no missed events. This is the path the rest of this doc assumes.

- **◐ Fallback A — GHL native Stripe sync.** If you must sell on a Stripe-hosted
  Payment Link/Checkout instead of a GHL form, GHL's native Stripe connection can
  still surface subscription events, but product→tag mapping is coarser and
  first-purchase timing is less reliable. Use only if you can't move checkout into GHL.

- **◐ Fallback B — Zapier/Make bridge.** Stripe webhook
  (`checkout.session.completed`, `customer.subscription.created`) → Zapier → GHL
  "create/update contact + add tag." Most flexible, but adds a third-party
  dependency and a few seconds of latency. Last resort.

Everything below is written for the **preferred** path, with fallback notes inline
where the mechanism differs.

---

## §1 — Stripe products (checklist 2.1)

Do this in the **Stripe Dashboard**. Decide test vs live deliberately (see the
toggle note at the end).

### 1.1 Set the statement descriptor first

**Settings → Business → Public details** (and **Settings → Payments → Statement
descriptor**):

- **Statement descriptor:** something a stranger recognizes on their card statement
  to avoid chargebacks — e.g. `DRCHADLARSON` or `METABOLIC OS`. Max 22 chars,
  letters/numbers/spaces, must contain at least 5 letters.
- **Shortened descriptor / prefix** (for subscriptions): set it too, so recurring
  charges read the same.
- Confirm a **support email** and business name are set — they appear on receipts.

### 1.2 Create the two products

**Product catalog → + Add product.**

**Product A — Founding Member (monthly)**
- Name: `Founding Member — Monthly`
- Price: **$49.00 USD**, **Recurring**, **Monthly**.
- Save. Note the **Price ID** (`price_…`) — you'll select this in the GHL order form.

**Product B — Founding Member (3-month upfront)**
- Name: `Founding Member — 3-Month`
- Price: **$129.00 USD**. Choose the billing model you intend:
  - If it's a **one-time** upfront covering 3 months → **One-time** price.
  - If it should **auto-renew every 3 months** → **Recurring, every 3 months**.
  - *(Pick one and keep it consistent with the sales-page copy. The pilot copy
    treats $129 as the 3-month founding rate; one-time is simplest for a pilot.)*
- Save. Note the **Price ID**.

### 1.3 Test vs live mode

- Build and test **everything** in Stripe **Test mode** first (toggle top-right of
  the dashboard). Test-mode products/prices are separate objects from live — you'll
  recreate or "copy to live" when you flip.
- Only switch to **Live mode** after §6's full test chain passes. When you do,
  re-copy the products to live (Stripe offers "copy to live mode" on a product) and
  **update the GHL order form to the live Price IDs**.

✅ **2.1 done when:** both products exist with a clear statement descriptor, and a
test-mode checkout completes with a 4242 card.

---

## §2 — Stripe → GHL connection + tag rules (checklist 2.2)

### 2.1 Connect Stripe in GHL

GHL → **Payments → Integrations → Stripe → Connect**. Authorize the same Stripe
account. This lets GHL order forms charge your Stripe products.

### 2.2 Build the order form(s)

GHL → **Sites → Funnels** (or **Payments → Order Forms**). Create a checkout step
that sells **Product A ($49)** and, as the secondary option, **Product B ($129)** —
matching the sales page ($49 primary / $129 secondary). Point each to the Stripe
**Price ID** from §1.2.

- *Fallback A/B:* if checkout stays on Stripe, skip the order form; you'll drive
  tags from the Stripe-sync/Zapier event instead of an order-form trigger.

### 2.3 Tag rules (this is 2.2's real content)

Create one **Workflow** (GHL → **Automation → Workflows**), trigger **"Order Form
Submission"** (preferred) — or **"Payment Received"** / the Stripe-sync trigger for
fallbacks. Branch on which product was purchased:

| Purchase | Tags to apply |
|---|---|
| **Either product** ($49 or $129) | `pilot-member` |
| **$129 (3-month)** additionally | `founding-3mo` |

Implementation: add an **If/Else** on the product/price. In the "$129" branch apply
**both** `pilot-member` + `founding-3mo`; in the "$49" branch apply `pilot-member`
only. (Tag names come from the checklist 4.1 tag architecture — keep them exact.)

✅ **2.2 done when:** a test purchase of each product produces a GHL contact tagged
correctly ($49 → `pilot-member`; $129 → `pilot-member` + `founding-3mo`).

---

## §3 — GHL → App provisioning webhook (checklist 2.3)

This is the heart of Phase 2: after tagging, GHL calls our endpoint to create the
member's account. Add these steps **to the same workflow**, after the tag step.

### 3.1 The exact contract (source of truth: `server/routes.ts`, `SPRINT_REPORT.md`)

| | |
|---|---|
| **URL** | `https://app.theadaptlab.com/api/webhooks/ghl/provision` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Auth header** | `x-ghl-secret: <GHL_WEBHOOK_SECRET value>`  *(or `Authorization: Bearer <value>`)* |

**Request body → GHL merge-field mapping:**

| JSON field | Required | Map to (GHL) |
|---|---|---|
| `email` | ✅ | `{{contact.email}}` |
| `name` | ✅ | `{{contact.name}}` (or `{{contact.first_name}} {{contact.last_name}}`) |
| `phone` | optional | `{{contact.phone}}` |
| `timezone` | optional | `{{contact.timezone}}` — must be an **IANA** zone (e.g. `America/New_York`); server validates and 400s on bad values, so leave it unmapped if unsure |
| `planTag` | optional (audit only) | a static string per branch: `founding-49` or `founding-129` |

**Responses:**
- `201 Created` (new account) → body has `status:"created"`, `userId`, `loginUrl`,
  **`tempPassword`**, `forcePasswordReset:true`.
- `200 OK` `status:"exists"` → idempotent retry, account already existed, **no
  password reset** (safe — GHL retries won't clobber a member).
- `401` bad/missing secret · `400` invalid payload/timezone · `503`
  `GHL_WEBHOOK_SECRET` not set on the server · `500` server error.

### 3.2 Add the webhook action in GHL

Workflow → **+ Add action → Webhook** (a.k.a. "Custom Webhook" / "POST request";
this is a premium action — enable it if prompted).

1. **Method:** POST. **URL:** the endpoint above.
2. **Headers:** add `x-ghl-secret` = *(paste the GHL_WEBHOOK_SECRET value from
   Railway)*, and `Content-Type` = `application/json`.
3. **Body:** raw JSON, using the mapping table (use GHL's field-picker to insert
   `{{contact.*}}` merge fields). Minimum viable body:
   ```json
   { "email": "{{contact.email}}", "name": "{{contact.name}}", "planTag": "founding-49" }
   ```
4. **Capture the response.** In the webhook action, enable "map/store response" and
   capture:
   - `tempPassword` → a contact **custom field** (create one: **Temp Password**)
   - `loginUrl` → custom field **Login URL** (or just hardcode the login URL in the
     email — it's always `https://app.theadaptlab.com/login`)
   - `userId` → optional custom field for support lookups
   *(GHL exposes captured response values as merge fields in later steps. Exact UI
   labels vary by GHL version — look for "Response Mapping" / "Custom Values from
   response.")*

> **Fallback (no response mapping available):** some older GHL webhook actions can't
> capture a response. If so, use **Fallback B (Zapier/Make)** for this one step:
> Zap calls the endpoint, parses the 201 JSON, and writes `tempPassword`/`loginUrl`
> back to the GHL contact fields. The endpoint contract is identical.

### 3.3 Ordering & idempotency

- Put the webhook **after** the tag step, and add a tiny **Wait (5–15s)** before it
  if the order-form contact needs a beat to settle.
- The endpoint is **idempotent** (200 `exists` on repeat), so GHL retries are safe —
  they will **not** reset an existing member's password.

✅ **2.3 done when:** a test purchase results in a real account (verify: log in as
admin at `/login`, **Participants** list shows the new email) and the workflow's
webhook step shows a **201**.

---

## §4 — Welcome email automation (checklist 2.4)

Add an **Email** action to the workflow, **after** the webhook step (so the captured
`tempPassword` is available).

**Why email carries the password:** the app has **no email/SMS transport of its
own** (SPRINT_NOTES #6) — GHL is the delivery mechanism. There is **no magic-link
login**; the member signs in with their **email + temp password**, then is forced to
reset it and lands in the onboarding wizard.

**Email must contain:**
1. **Sign-in link:** `https://app.theadaptlab.com/login` (the `loginUrl` from
   the response, or just hardcode it — it's stable).
2. **Their temp password:** merge `{{contact.temp_password}}` (the custom field from
   §3.2). Tell them they'll set their own on first sign-in.
3. **"Reply here if you have any trouble"** — send from a monitored inbox.
4. **Device-kit link** (the single kit URL from checklist 3.1).

**Temp-password hygiene (SPRINT_NOTES #7):** the temp password is a one-time
credential. Deliver over TLS (GHL email is fine), don't paste it into logs/notes,
and consider **clearing the Temp Password custom field** with a later workflow step
once the email has sent.

✅ **2.4 done when:** the test purchase's welcome email arrives with a working login
link + temp password, and you can sign in with them.

---

## §5 — Cancellation notification → Chad's inbox (checklist 2.5)

There is **no app-side plumbing** for this (by design) — it's a GHL/Stripe
automation.

- **✅ Preferred (GHL):** new Workflow, trigger **"Subscription Cancelled"** (GHL's
  Stripe-connected trigger) → action **"Send Internal Notification" → Email** to
  Chad's inbox, with `{{contact.name}}` / `{{contact.email}}` in the body. Optionally
  also apply a `cancelled` / `refunded` tag so other sequences stop firing.
- **◐ Fallback:** Stripe webhook `customer.subscription.deleted` → Zapier → email
  Chad; **or** Stripe Dashboard → **Settings → Team & notifications** → enable email
  alerts for cancellations/failed payments (coarser, but zero-build).

✅ **2.5 done when:** cancelling a test subscription pings Chad's inbox within minutes.

---

## §6 — Test matrix (Stripe **Test mode**)

Run top-to-bottom in test mode. Card `4242 4242 4242 4242`, any future expiry, any
CVC/ZIP. Use a **throwaway email you can open** (e.g. a `+tag` on your own address).

> ⚠️ **Test purchases still hit the PRODUCTION provisioning webhook**, so they create
> **real accounts in the prod database.** Track the emails you use and **delete each
> after** (PILOT_RUNBOOK §3.3 hard delete). If you'd rather isolate the webhook step,
> dry-run it locally first per PILOT_RUNBOOK §4 (swap the URL to `localhost:5000`).

| # | Action | Confirms | Success = |
|---|---|---|---|
| T1 | In Stripe test mode, complete an order-form purchase of **$49** | Stripe + checkout | Payment shows in Stripe test payments; statement descriptor correct |
| T2 | Check the GHL contact | Tagging 2.2 | Contact exists, tagged **`pilot-member`** (only) |
| T3 | Check the workflow's webhook step | Provisioning 2.3 | Step returned **201**; admin **Participants** list shows the new email |
| T4 | Open the welcome email | Email 2.4 | Arrives with login link + temp password + device-kit link |
| T5 | Sign in with email + temp password at `/login` | End-to-end | Forced password reset → onboarding wizard opens |
| T6 | Repeat T1 with **$129** | Dual-tag 2.2 | Contact tagged **`pilot-member` + `founding-3mo`** |
| T7 | Send a bad `x-ghl-secret` (edit header, re-run) | Auth | Endpoint returns **401** (no account created) |
| T8 | Re-run the same email through the workflow | Idempotency | Endpoint returns **200 `exists`**, password unchanged |
| T9 | Cancel the test subscription in Stripe | Cancellation 2.5 | Notification email lands in Chad's inbox |
| T10 | **Cleanup** | Hygiene | Delete every test-provisioned account (PILOT_RUNBOOK §3.3); remove/`refunded`-tag the test GHL contacts |

**The one chain that must pass end-to-end (checklist 2.x acceptance):**

> test purchase → GHL contact tagged → provisioning webhook 201 → account created →
> welcome email with working login link → sign in → forced reset → onboarding wizard.

When T1–T10 pass in test mode, flip Stripe to **Live**, repoint the GHL order form to
the **live Price IDs** (§1.3), and do **one** real live-mode dry run — that's
**checklist 5.2 (dress rehearsal)**, gated behind Phase 0 (the Partner key).

---

## Appendix — manual webhook check (copy-paste)

Verify the endpoint independently of GHL (from PILOT_RUNBOOK §4). Non-destructive
bad-secret probe (safe against prod — creates nothing):

```bash
curl -s -o /dev/null -w "bad secret (expect 401): %{http_code}\n" \
  -X POST https://app.theadaptlab.com/api/webhooks/ghl/provision \
  -H 'Content-Type: application/json' -H 'x-ghl-secret: wrong' \
  -d '{"email":"x@x.com","name":"x"}'
```

A **real** provision (creates a prod account — use a throwaway email, then delete it
per §3.3):

```bash
SECRET='<GHL_WEBHOOK_SECRET value>'
curl -s -X POST https://app.theadaptlab.com/api/webhooks/ghl/provision \
  -H 'Content-Type: application/json' -H "x-ghl-secret: $SECRET" \
  -d '{"email":"provision-smoke+TEST@your-domain.com","name":"Provision Smoke","planTag":"smoke-test"}'
# expect 201 with status:"created", loginUrl, tempPassword
```
