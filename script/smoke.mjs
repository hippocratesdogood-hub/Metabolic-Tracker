/**
 * End-to-end smoke test — exercises the critical patient flow against a running
 * app and reports a pass/fail per step. Re-run after deploys to confirm the
 * food-analysis pipeline, P2 review UI, timestamp seeding, and metric editing
 * still work together (things the unit suite does NOT cover).
 *
 * Usage:
 *   npm run smoke                      # local dev on :5000
 *   SMOKE_BASE_URL=http://localhost:5000 SMOKE_EMAIL=... SMOKE_PASSWORD=... npm run smoke
 *
 * Prerequisites:
 *   - The app is running and reachable at SMOKE_BASE_URL (start with `npm run dev`).
 *   - Google Chrome is installed (the runner drives system Chrome via playwright-core).
 *   - SMOKE_EMAIL is a participant with AI consent already granted.
 *
 * Notes:
 *   - To faithfully mirror PRODUCTION, run the server with ANTHROPIC_API_KEY unset
 *     (`ANTHROPIC_API_KEY= npm run dev`) so the Nutritionix-primary path is exercised.
 *   - This MUTATES data on whatever environment it points at: it saves a meal and
 *     edits one metric. Point it at a dev/staging DB, never production.
 *   - Exits non-zero if any step fails.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:5000';
const EMAIL = process.env.SMOKE_EMAIL || 'larson817@gmail.com';
const PASSWORD = process.env.SMOKE_PASSWORD || 'LocalDev2026!';
const SHOT = process.env.SMOKE_SHOT_DIR || '/tmp/mt-smoke';
mkdirSync(SHOT, { recursive: true });

const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name} — ${detail}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newContext({ viewport: { width: 1280, height: 1200 } }).then(c => c.newPage());
let analyzeBody = null;
page.on('response', async r => {
  if (r.url().includes('/api/food/analyze') && r.request().method() === 'POST' && r.status() === 200) {
    try { analyzeBody = await r.json(); } catch {}
  }
});
page.on('pageerror', e => console.log('[pageerror]', e.message));

const cardOf = (nameLoc) => nameLoc.locator('xpath=ancestor::div[contains(@class,"shadow-sm")][1]');

try {
  // 1. Login
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 10000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  const [loginResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login')),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1200);
  rec('1. Login (participant)', loginResp.status() === 200, `auth/login → ${loginResp.status()}`);

  // 2. P1: branded meal analysis (works without Anthropic when Nutritionix is configured)
  await page.goto(`${BASE}/food`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="input-food-description"]', { timeout: 10000 });
  await page.fill('[data-testid="input-food-description"]', 'a Big Mac and a medium fries');
  analyzeBody = null;
  await page.click('[data-testid="button-analyze"]');
  await page.waitForTimeout(1000);
  const accept = page.locator('button:has-text("Accept"), button:has-text("Agree")').first();
  if (await accept.count()) await accept.click().catch(() => {});
  await page.waitForSelector('input.flex-1.min-w-0', { timeout: 20000 });
  await page.waitForTimeout(600);
  const items = analyzeBody?.foods_detected || [];
  rec('2. Food analysis returns items', items.length > 0,
      `${items.length} item(s): ${items.map(i => `${i.name}=${i.calories}cal/${i.netCarbs}gNC[${i.sourceName || i.source}]`).join(', ')}`);

  // 3. P2: provenance badge visible
  const nameInputs = page.locator('input.flex-1.min-w-0');
  const cardText = await cardOf(nameInputs.first()).innerText();
  const badge = cardText.split('\n').find(l => /Nutritionix|USDA|Open Food Facts|AI estimate/i.test(l));
  rec('3. Per-item provenance badge', !!badge, `badge shows "${badge || '(none)'}"`);

  // 4. P2: re-check swaps an item's macros
  const names = [];
  for (let i = 0; i < await nameInputs.count(); i++) names.push(await nameInputs.nth(i).inputValue());
  const fi = names.findIndex(v => /fries/i.test(v));
  const tcard = cardOf(nameInputs.nth(fi >= 0 ? fi : 0));
  const ncBefore = await tcard.locator('input[type="number"]').nth(3).inputValue();
  await tcard.locator('button:has-text("Re-check")').click();
  await page.waitForTimeout(300);
  await tcard.locator('input[placeholder*="specifically"]').fill('grilled chicken breast');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/food/analyze') && r.request().method() === 'POST'),
    tcard.locator('button:has-text("Search")').click(),
  ]);
  await page.waitForTimeout(1000);
  const names2 = [];
  for (let i = 0; i < await nameInputs.count(); i++) names2.push(await nameInputs.nth(i).inputValue());
  const si = names2.findIndex(v => /chicken/i.test(v));
  const ncAfter = si >= 0 ? await cardOf(nameInputs.nth(si)).locator('input[type="number"]').nth(3).inputValue() : 'n/a';
  rec('4. Re-check swaps item macros', si >= 0 && parseFloat(ncAfter) <= 2,
      `"${names[fi] || names[0]}" (${ncBefore}gNC) → "${names2[si]}" (${ncAfter}gNC)`);

  // 5. Save the meal
  const [saveResp] = await Promise.all([
    page.waitForResponse(r => /\/api\/food(\/meal)?$/.test(r.url()) && r.request().method() === 'POST'),
    page.click('[data-testid="button-confirm"]'),
  ]);
  await page.waitForTimeout(1000);
  rec('5. Save meal', saveResp.status() >= 200 && saveResp.status() < 300,
      `POST ${new URL(saveResp.url()).pathname} → ${saveResp.status()}`);

  // 6. Timestamp seeding: Day View deep-link for a past Breakfast must not default to midnight
  const yest = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  await page.goto(`${BASE}/food?date=${yest}&mealType=Breakfast`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="button-date-picker"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  const dateBtn = (await page.locator('[data-testid="button-date-picker"]').innerText()).trim();
  const notMidnight = !/12:00 AM/.test(dateBtn) && /\d{1,2}:\d{2}\s?(AM|PM)/i.test(dateBtn);
  rec('6. Deep-link timestamp not midnight', notMidnight, `picker shows "${dateBtn}" (expect ~8:00 AM)`);

  // 7. Device-metric edit
  await page.goto(`${BASE}/trends`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button[role="combobox"]', { timeout: 10000 });
  await page.locator('button[role="combobox"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]:has-text("Glucose")').first().click();
  await page.waitForTimeout(600);
  const tab90 = page.locator('button:has-text("90 Days")').first();
  if (await tab90.count()) { await tab90.click(); await page.waitForTimeout(600); }
  const editBtns = page.locator('[data-testid^="button-edit-metric-"]');
  const editCount = await editBtns.count();
  let editOk = false, editDetail = `${editCount} editable entries (none to edit)`;
  if (editCount > 0) {
    await editBtns.first().click();
    await page.waitForSelector('#value', { timeout: 8000 });
    const before = await page.locator('#value').inputValue();
    const next = String((parseFloat(before) || 95) + 1);
    await page.locator('#value').fill(next);
    const [updResp] = await Promise.all([
      page.waitForResponse(r => /\/api\/metrics\//.test(r.url()) && r.request().method() === 'PUT'),
      page.locator('[role="dialog"] button:has-text("Save Changes")').click(),
    ]);
    editOk = updResp.status() === 200;
    editDetail = `edited glucose ${before}→${next}, PUT → ${updResp.status()}`;
  }
  rec('7. Device-metric edit', editOk, editDetail);

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== SMOKE SUMMARY: ${passed}/${results.length} passed =====`);
  results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.name}`));
  if (passed !== results.length) process.exitCode = 1;
} catch (err) {
  console.log('[smoke-error]', err.message);
  await page.screenshot({ path: `${SHOT}/smoke-error.png` }).catch(() => {});
  process.exitCode = 2;
} finally {
  await browser.close();
}
