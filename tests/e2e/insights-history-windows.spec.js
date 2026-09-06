'use strict';

const { test, expect } = require('@playwright/test');

const CAPABILITIES = {
  free: {
    correlations:false,
    unlimitedHistory:false,
    sharing:false,
    appointmentWorkspace:false,
    multipleProfiles:false,
    advancedVisitBrief:false,
    encryptedSync:false
  },
  pro: {
    correlations:true,
    unlimitedHistory:true,
    sharing:true,
    appointmentWorkspace:false,
    multipleProfiles:false,
    advancedVisitBrief:false,
    encryptedSync:false
  }
};

async function installSession(page, testInfo) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.addInitScript(({ id: sessionId }) => {
    localStorage.setItem('pamet_user_v1', JSON.stringify({
      id:`insights-history-${sessionId}`,
      firstName:'History',
      lastName:'Window',
      email:`insights-history-${sessionId}@pamet.test`,
      plan:'pro',
      createdAt:new Date().toISOString()
    }));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token:`insights-history-session-${sessionId}`, at:Date.now() }));
  }, { id });
}

async function seedHistory365(page) {
  await page.evaluate(() => {
    const store = window.PametStore;
    store._entries = [];
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    for (let offset = 364; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const sequence = 365 - offset;
      const symptomFree = sequence % 11 === 0;
      const headache = !symptomFree && sequence % 3 === 0;
      const fatigue = !symptomFree && sequence % 2 === 0;
      const jointPain = !symptomFree && sequence % 7 === 0;
      const symptoms = [];
      if (headache) symptoms.push('Headache');
      if (fatigue) symptoms.push('Fatigue');
      if (jointPain) symptoms.push('Joint pain');
      if (!symptomFree && !symptoms.length) symptoms.push('Fatigue');
      store._entries.unshift({
        id:`history-${sequence}`,
        date:date.toISOString(),
        symptoms,
        severity:symptomFree ? 0 : Math.min(10, 3 + symptoms.length + (headache ? 2 : 0)),
        sleepHours:headache ? 5 : 7,
        stressLevel:headache ? 8 : 4,
        waterGlasses:fatigue ? 4 : 7,
        energyLevel:fatigue ? 4 : 7,
        mood:headache ? 'Tired 😴' : 'Okay 😐',
        activity:jointPain ? 'Cycling' : 'Walk',
        medications:headache ? ['Ibuprofen'] : [],
        notes:`365-day Insights fixture day ${sequence}`
      });
    }
    store.persistEntries();
  });
}

test('@production Pro Insights supports every 7–365 day history window with exact daily chart points and normalizes safely after downgrade', async ({ page }, testInfo) => {
  await installSession(page, testInfo);
  let verifiedPlan = 'pro';

  await page.route('**/api/entitlements', async (route) => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ plan:verifiedPlan, capabilities:CAPABILITIES[verifiedPlan] })
    });
  });

  await page.goto('/', { waitUntil:'commit' });
  await page.waitForFunction(() => window.PametEntitlements?.snapshot?.().verified === true);
  await expect.poll(async () => page.evaluate(() => window.PametEntitlements.snapshot().plan)).toBe('pro');
  await seedHistory365(page);
  await page.locator('[data-tab="patterns"]').click();

  await expect.poll(async () => page.evaluate(() => window.PametInsightsController?.windows?.())).toEqual([7,14,30,60,90,180,365]);
  await expect(page.locator('#screen-patterns [data-insights-days]')).toHaveCount(7);
  await expect(page.locator('#screen-patterns .history-locked')).toHaveCount(0);

  for (const days of [7,14,30,60,90,180,365]) {
    await page.locator(`[data-insights-days="${days}"]`).click();
    await expect(page.locator(`[data-insights-days="${days}"]`)).toHaveClass(/active/);
    await expect(page.locator('#screen-patterns .insights-window-summary')).toContainText(`last ${days} days`);
    await expect(page.locator('#screen-patterns .insights-findings-card .pamet-eyebrow')).toContainText(`${days}-day window`);
    await expect(page.locator('#screen-patterns .tracking-quality-head .pamet-eyebrow')).toContainText(`last ${days} days`);
    const loggedDays = page.locator('#screen-patterns .insights-kpi', { hasText:'Logged days' });
    await expect(loggedDays.locator('strong')).toContainText(`${days} / ${days}`);
    await expect(loggedDays).toContainText('100% of calendar days');
    await expect(page.locator('#screen-patterns [data-quality-metric="consistency"] strong')).toHaveText('100%');
    const chart = page.locator('#screen-patterns .insights-chart-card');
    await expect(chart).toHaveAttribute('data-chart-window', String(days));
    await expect(chart).toHaveAttribute('data-chart-bucket-days', '1');
    await expect(chart).toHaveAttribute('data-chart-point-count', String(days));
    await expect(chart.locator('.coverage-day')).toHaveCount(days);
    await expect(chart).toHaveAttribute('data-chart-mode-current', 'basic');
    await expect(chart.locator('.basic-metric-card')).toHaveCount(5);
    await expect(chart.locator('.basic-sparkline')).toHaveCount(5);
    await expect(chart.locator('.insights-chart-svg')).toHaveCount(0);
  }

  const windowLayout = await page.locator('#screen-patterns .insights-window').evaluate((element) => ({
    clientWidth:element.clientWidth,
    scrollWidth:element.scrollWidth,
    buttons:Array.from(element.querySelectorAll('button')).map((button) => button.getBoundingClientRect().width)
  }));
  expect(windowLayout.scrollWidth).toBeLessThanOrEqual(windowLayout.clientWidth + 2);
  expect(windowLayout.buttons.every((width) => width > 0)).toBe(true);

  verifiedPlan = 'free';
  await page.evaluate(() => window.PametEntitlements.refresh());
  await expect.poll(async () => page.evaluate(() => window.PametEntitlements.snapshot().plan)).toBe('free');
  await expect(page.locator('[data-insights-days="90"]')).toHaveClass(/active/);
  await expect(page.locator('[data-insights-days="180"]')).toHaveClass(/history-locked/);
  await expect(page.locator('[data-insights-days="365"]')).toHaveClass(/history-locked/);
  await expect(page.locator('#screen-patterns .insights-window-summary')).toContainText('last 90 days');
  await expect(page.locator('#screen-patterns .tracking-quality-head .pamet-eyebrow')).toContainText('last 90 days');
  await expect(page.locator('#screen-patterns .insights-chart-card')).toHaveAttribute('data-chart-mode-current', 'basic');
});
