'use strict';

const { test, expect } = require('@playwright/test');

const PRO_CAPABILITIES = {
  correlations:true,
  unlimitedHistory:true,
  sharing:true,
  appointmentWorkspace:false,
  multipleProfiles:false,
  advancedVisitBrief:false,
  encryptedSync:false
};

async function installProSession(page, testInfo) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.addInitScript(({ sessionId }) => {
    localStorage.setItem('pamet_user_v1', JSON.stringify({
      id:`chart-${sessionId}`,
      firstName:'Chart',
      lastName:'Tester',
      email:`chart-${sessionId}@pamet.test`,
      plan:'pro',
      createdAt:new Date().toISOString()
    }));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token:`chart-session-${sessionId}`, at:Date.now() }));
  }, { sessionId:id });
  await page.route('**/api/entitlements', async (route) => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ plan:'pro', capabilities:PRO_CAPABILITIES }) });
  });
  await page.goto('/', { waitUntil:'commit' });
  await page.waitForFunction(() => window.PametEntitlements?.snapshot?.().verified === true);
}

async function seedChartHistory(page) {
  await page.evaluate(() => {
    const store = window.PametStore;
    store._entries = [];
    const now = new Date();
    now.setHours(12,0,0,0);
    for (let offset = 369; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const sequence = 370 - offset;
      const clear = sequence % 5 === 0;
      const headache = !clear && sequence % 2 === 0;
      const fatigue = !clear && sequence % 3 === 0;
      const symptoms = [];
      if (headache) symptoms.push('Headache');
      if (fatigue) symptoms.push('Fatigue');
      if (!clear && !symptoms.length) symptoms.push('Headache');
      store._entries.unshift({
        id:`chart-history-${sequence}`,
        date:date.toISOString(),
        symptoms,
        severity:clear ? 0 : (headache ? 6 : 4),
        sleepHours:headache ? 5.5 : 7.2,
        stressLevel:headache ? 7 : 3,
        waterGlasses:fatigue ? 4 : 7,
        energyLevel:fatigue ? 4 : 7,
        mood:headache ? 'Tired 😴' : 'Okay 😐',
        activity:sequence % 4 === 0 ? 'Cycling' : 'Walk',
        medications:headache ? ['Ibuprofen'] : [],
        notes:`Chart fixture ${sequence}`
      });
    }
    store.persistEntries();
  });
}

async function expectActiveControlVisible(locator) {
  await expect(locator).toHaveClass(/active/);
  const presentation = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color:style.color, backgroundColor:style.backgroundColor };
  });
  expect(presentation.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(presentation.backgroundColor).not.toBe('transparent');
  expect(presentation.color).not.toBe(presentation.backgroundColor);
}

async function expectPrimarySeriesVisible(chart) {
  const primary = chart.locator('.chart-series-primary');
  await expect(primary).toHaveAttribute('d', /^M/);
  const stroke = await primary.evaluate((element) => getComputedStyle(element).stroke);
  expect(stroke).not.toBe('none');
  expect(stroke).not.toBe('transparent');
  expect(stroke).not.toBe('rgba(0, 0, 0, 0)');
}

async function expectBasicSummaryVisible(chart) {
  await expect(chart.locator('.chart-summary-sparklines')).toBeVisible();
  await expect(chart.locator('.basic-metric-card')).toHaveCount(5);
  for (const metric of ['frequency','severity','sleep','stress','hydration']) {
    await expect(chart.locator(`[data-basic-metric="${metric}"]`)).toBeVisible();
  }
  await expect(chart.locator('.basic-sparkline')).toHaveCount(5);
  await expect(chart.locator('.insights-chart-svg')).toHaveCount(0);
}

test('@production Pro Patterns charting uses glanceable Basic summaries and contextual Advanced analysis across every daily window', async ({ page }, testInfo) => {
  await installProSession(page, testInfo);
  await seedChartHistory(page);
  await page.locator('[data-tab="patterns"]').click();

  const chart = page.locator('#screen-patterns .insights-chart-card');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('data-chart-mode-current','basic');
  await expect(chart).toHaveAttribute('data-chart-window','7');
  await expect(chart).toHaveAttribute('data-chart-bucket-days','1');
  await expect(chart).toHaveAttribute('data-chart-point-count','7');
  await expect(chart).toHaveAttribute('data-chart-type-current','line');
  await expect(chart.locator('#insightsChartTitle')).toContainText('at a glance');
  await expectBasicSummaryVisible(chart);
  await expect(chart.locator('.chart-method-note')).toContainText('Missing days remain missing');
  await expect(chart.locator('.chart-method-note')).toContainText('rolling average never changes the Y-axis scale');
  await expectActiveControlVisible(chart.locator('[data-chart-mode="basic"]'));
  await expectActiveControlVisible(chart.locator('[data-chart-type="line"]'));

  const symptomSelect = chart.locator('[data-chart-symptom]');
  await expect(symptomSelect.locator('option', { hasText:'Any symptom' })).toHaveCount(1);
  await expect(symptomSelect.locator('option', { hasText:'Headache' })).toHaveCount(1);
  await expect(symptomSelect.locator('option', { hasText:'Fatigue' })).toHaveCount(1);

  for (const days of [7,14,30,60,90,180,365]) {
    if (days !== 7) await page.locator(`[data-insights-days="${days}"]`).click();
    await expect(chart).toHaveAttribute('data-chart-window',String(days));
    await expect(chart).toHaveAttribute('data-chart-bucket-days','1');
    await expect(chart).toHaveAttribute('data-chart-point-count',String(days));
    await expect(chart.locator('.chart-window-explain')).toContainText(`${days} calendar days · daily resolution`);
    await expect(chart.locator('.chart-window-explain')).not.toContainText('grouped view');
    await expect(chart.locator('.coverage-day')).toHaveCount(days);
    await expectBasicSummaryVisible(chart);
  }

  await page.locator('[data-insights-days="30"]').click();
  await chart.locator('[data-chart-type="bar"]').click();
  await expect(chart).toHaveAttribute('data-chart-type-current','bar');
  await expectActiveControlVisible(chart.locator('[data-chart-type="bar"]'));
  expect(await chart.locator('.basic-sparkline rect').count()).toBeGreaterThan(0);

  await chart.locator('[data-chart-type="line"]').click();
  await expect(chart).toHaveAttribute('data-chart-type-current','line');
  await expectActiveControlVisible(chart.locator('[data-chart-type="line"]'));
  expect(await chart.locator('.basic-sparkline path').count()).toBeGreaterThan(0);

  await chart.locator('[data-chart-mode="advanced"]').click();
  await expect(chart).toHaveAttribute('data-chart-mode-current','advanced');
  await expect(chart.locator('.advanced-chart-controls')).toBeVisible();
  await expect(chart.locator('.advanced-comparison-grid .advanced-comparison-card')).toHaveCount(3);
  await expect(chart.locator('.comparison-delta-track')).toHaveCount(3);
  await expect(chart.locator('.comparison-delta-svg')).toHaveCount(3);
  await expect(chart.locator('.chart-metric-btn')).toHaveCount(5);
  await expect(chart.locator('.insights-chart-svg')).toBeVisible();
  await expect(chart.locator('.chart-reference-band')).toBeVisible();
  await expectActiveControlVisible(chart.locator('[data-chart-mode="advanced"]'));
  await expectActiveControlVisible(chart.locator('[data-chart-type="line"]'));
  await expectPrimarySeriesVisible(chart);

  await chart.locator('[data-chart-metric="severity"]').click();
  await expect(chart.locator('#insightsChartTitle')).toHaveText('Recorded symptom severity');
  await expectActiveControlVisible(chart.locator('[data-chart-metric="severity"]'));
  await expectPrimarySeriesVisible(chart);
  await expect(chart.locator('.chart-axis-title-y')).toHaveText('Severity (0–10)');
  await expect(chart.locator('.insights-chart-svg-wrap')).toHaveAttribute('data-y-axis-zoomed','true');
  await expect(chart.locator('.chart-reference-band')).toBeVisible();

  await chart.locator('[data-chart-type="bar"]').click();
  await expectActiveControlVisible(chart.locator('[data-chart-type="bar"]'));
  await expect(chart.locator('.insights-chart-svg-wrap')).toHaveAttribute('data-y-axis-zoomed','false');
  expect(await chart.locator('.chart-bar').count()).toBeGreaterThan(0);
  await chart.locator('[data-chart-type="line"]').click();
  await expectActiveControlVisible(chart.locator('[data-chart-type="line"]'));

  await chart.locator('[data-chart-metric="sleep"]').click();
  await expect(chart.locator('#insightsChartTitle')).toHaveText('Recorded sleep');
  await expectActiveControlVisible(chart.locator('[data-chart-metric="sleep"]'));
  await expect(chart.locator('.legend-secondary')).toContainText('Any symptom days');
  await expect(chart.locator('.chart-series-secondary')).toHaveAttribute('d', /^M/);
  await expect(chart.locator('.chart-series-trend')).toHaveAttribute('d', /^M/);
  await expect(chart.locator('.chart-axis-title-y')).toHaveText('Sleep (hours)');

  await chart.locator('[data-chart-symptom]').selectOption('Headache');
  await expect(chart.locator('#insightsChartTitle')).toHaveText('Recorded sleep');
  await expect(chart.locator('.legend-secondary')).toContainText('Headache days');
  await expect(chart.locator('.advanced-comparison-head h4')).toContainText('Headache days compared with other logged days');
  await expect(chart.locator('.chart-series-secondary')).toHaveAttribute('d', /^M/);

  for (const metric of ['stress','hydration','frequency','severity']) {
    await chart.locator(`[data-chart-metric="${metric}"]`).click();
    await expectActiveControlVisible(chart.locator(`[data-chart-metric="${metric}"]`));
    await expectPrimarySeriesVisible(chart);
  }

  await page.locator('[data-insights-days="90"]').click();
  await expect(chart).toHaveAttribute('data-chart-window','90');
  await expect(chart).toHaveAttribute('data-chart-bucket-days','1');
  await expect(chart).toHaveAttribute('data-chart-point-count','90');
  await expect(chart.locator('.advanced-chart-context')).toContainText('Daily resolution');
  await expect(chart.locator('.advanced-chart-context')).toContainText('14-day rolling average');
  await expect(chart.locator('.advanced-chart-context')).toContainText('Trend does not change Y-axis scale');
  await expectPrimarySeriesVisible(chart);

  await page.locator('[data-insights-days="365"]').click();
  await expect(chart).toHaveAttribute('data-chart-window','365');
  await expect(chart).toHaveAttribute('data-chart-bucket-days','1');
  await expect(chart).toHaveAttribute('data-chart-point-count','365');
  await expect(chart.locator('.advanced-chart-context')).toContainText('30-day rolling average');
  await expect(chart.locator('.coverage-day')).toHaveCount(365);
  await expect(chart.locator('.insights-chart-svg-wrap')).toHaveAttribute('data-chart-scrollable','true');
  await expectPrimarySeriesVisible(chart);

  const layout = await chart.locator('.insights-chart-svg-wrap').evaluate((element) => ({
    clientWidth:element.clientWidth,
    scrollWidth:element.scrollWidth
  }));
  expect(layout.scrollWidth).toBeGreaterThanOrEqual(layout.clientWidth);
});