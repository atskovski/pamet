'use strict';

const { test, expect } = require('@playwright/test');

const PRIMARY_TABS = ['home', 'calendar', 'patterns', 'settings'];
const SAME_ORIGIN_IGNORED = [
  /\/api\/auth\/session(?:\?|$)/,
  /\/api\/billing\/status(?:\?|$)/,
  /\/api\/notifications\//,
  /\/api\/entitlements(?:\?|$)/
];

function installRuntimeGuards(page) {
  const problems = [];
  const base = process.env.PAMET_UI_BASE_URL || 'http://127.0.0.1:8080';
  const origin = new URL(base).origin;
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    try {
      if (new URL(request.url()).origin !== origin) return;
    } catch { return; }
    problems.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
  });
  page.on('response', (response) => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (url.origin !== origin || response.status() < 500) return;
    if (SAME_ORIGIN_IGNORED.some((pattern) => pattern.test(url.pathname))) return;
    problems.push(`HTTP ${response.status()}: ${response.request().method()} ${url.pathname}`);
  });
  return problems;
}

async function assertNoRuntimeProblems(problems) {
  await expect.poll(() => problems, { timeout: 250 }).toEqual([]);
}

async function waitForBootstrap(page) {
  await page.waitForFunction(() => typeof window.PametLoadAuthenticatedFeatures === 'function');
}

async function registerDisposableAccount(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  const email = `ui-integrity-${unique}@example.com`;
  const password = `Pamet-UI-${unique}-Password!`;
  await page.goto('/', { waitUntil: 'commit' });
  await waitForBootstrap(page);
  await expect(page.locator('#loginForm')).toBeVisible();
  await page.locator('#showRegister').click();
  await expect(page.locator('#registerForm')).toBeVisible();
  await expect(page.locator('#loginForm')).toBeHidden();
  await page.locator('#regFirstName').fill('UI');
  await page.locator('#regLastName').fill('Integrity');
  await page.locator('#regEmail').fill(email);
  await page.locator('#regPassword').fill(password);
  await page.locator('#registerForm button[type="submit"]').click();
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
  return { email, password };
}

async function installSyntheticSession(page, plan = 'free') {
  await page.addInitScript(({ plan }) => {
    const user = {
      id: 'ui-integrity-synthetic',
      firstName: 'UI',
      lastName: 'Integrity',
      email: 'ui-integrity@pamet.test',
      plan,
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('pamet_user_v1', JSON.stringify(user));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token: 'ui-integrity-session', at: Date.now() }));
  }, { plan });
}

async function assertPrimaryNavigation(page) {
  for (const tab of PRIMARY_TABS) {
    const button = page.locator(`.tab[data-tab="${tab}"]`);
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveClass(/active/);
    await expect(page.locator(`#screen-${tab}`)).toHaveClass(/active/);
    const activeCount = await page.locator('.screen.active').count();
    expect(activeCount, `exactly one screen should be active after navigating to ${tab}`).toBe(1);
  }
}

async function assertVisitBriefNavigation(page) {
  await page.locator('.tab[data-tab="home"]').click();
  const trigger = page.locator('[data-nav="report"]').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator('#screen-report')).toHaveClass(/active/);
  await expect(page.locator('#emailReport')).toBeVisible();
  await expect(page.locator('#downloadPdf')).toBeVisible();
  await page.locator('.tab[data-tab="home"]').click();
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
}

async function visibleInteractiveInventory(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const nameOf = (el) => {
      const labelledBy = el.getAttribute('aria-labelledby');
      const labelled = labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ') : '';
      const associatedLabels = el.labels ? [...el.labels].map((node) => node.textContent || '').join(' ') : '';
      const wrappingLabel = el.closest('label')?.textContent || '';
      return [el.getAttribute('aria-label'), labelled, associatedLabels, wrappingLabel, el.textContent, el.getAttribute('title'), el.getAttribute('placeholder')]
        .map(text).find(Boolean) || '';
    };
    return [...document.querySelectorAll('button,a[href],[role="button"],input,select,textarea')]
      .filter(visible)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        name: nameOf(el),
        type: el.getAttribute('type') || '',
        href: el.getAttribute('href') || '',
        tab: el.getAttribute('data-tab') || '',
        nav: el.getAttribute('data-nav') || '',
        disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true')
      }));
  });
}

function fingerprint(control) {
  return control.id ? `#${control.id}` : `${control.tag}:${control.name}:${control.tab || control.nav || control.href}`;
}

async function assertInteractiveSemantics(page) {
  const inventory = await visibleInteractiveInventory(page);
  expect(inventory.length).toBeGreaterThan(0);
  const unnamed = inventory.filter((item) => !item.name && item.type !== 'hidden');
  expect(unnamed, `visible controls without an accessible name: ${unnamed.map(fingerprint).join(', ')}`).toEqual([]);
  const badAnchors = inventory.filter((item) => item.tag === 'a' && item.href === '#' && !['showRegister', 'showLogin'].includes(item.id));
  expect(badAnchors, `unclassified placeholder links: ${badAnchors.map(fingerprint).join(', ')}`).toEqual([]);
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  });
  expect(duplicateIds, `duplicate runtime ids: ${duplicateIds.join(', ')}`).toEqual([]);
  return inventory;
}

async function interactionState(page) {
  return page.evaluate(() => ({
    url: location.href,
    activeScreen: document.querySelector('.screen.active')?.id || '',
    dialogs: [...document.querySelectorAll('[role="dialog"],dialog,.modal,.sheet,.pamet-modal-backdrop')].filter((el) => !el.hidden && getComputedStyle(el).display !== 'none').length,
    dark: document.body.classList.contains('dark'),
    expanded: [...document.querySelectorAll('[aria-expanded]')].map((el) => `${el.id}:${el.getAttribute('aria-expanded')}`).join('|'),
    hidden: [...document.querySelectorAll('[id][hidden]')].map((el) => el.id).sort().join('|'),
    open: [...document.querySelectorAll('.open,[open]')].map((el) => el.id || el.className || el.tagName).sort().join('|'),
    calendarMonth: document.querySelector('#calMonth')?.textContent || ''
  }));
}

async function clickAndRequireEffect(page, locator, label) {
  const before = await interactionState(page);
  let requested = 0;
  const onRequest = () => { requested += 1; };
  page.on('request', onRequest);
  await locator.click();
  await page.waitForTimeout(200);
  page.off('request', onRequest);
  const after = await interactionState(page);
  expect(JSON.stringify(after) !== JSON.stringify(before) || requested > 0,
    `${label} should navigate, change visible state, or make a request`).toBeTruthy();
}

async function openPlanMatrix(page) {
  await page.locator('.tab[data-tab="settings"]').click();
  const opener = page.getByRole('button', { name: /compare all plans|compare all plan features|see full.*feature|full feature comparison|compare pamet plans/i }).first();
  await expect(opener).toBeVisible();
  await opener.click();
  const matrix = page.locator('[role="dialog"]:visible, dialog:visible, .pamet-plan-matrix:visible, .plan-matrix:visible').filter({ hasText: /Free/i }).first();
  await expect(matrix).toBeVisible();
  await expect(matrix).toContainText(/Pro/i);
  await expect(matrix).toContainText(/Ultra/i);
}

test.describe('Pamet UI integrity', () => {
  test('auth entry points are reversible and never dead-end', async ({ page }) => {
    const problems = installRuntimeGuards(page);
    await page.goto('/', { waitUntil: 'commit' });
    await waitForBootstrap(page);
    await expect(page.locator('#loginForm')).toBeVisible();
    await clickAndRequireEffect(page, page.locator('#showRegister'), 'Create account link');
    await expect(page.locator('#registerForm')).toBeVisible();
    await clickAndRequireEffect(page, page.locator('#showLogin'), 'Log in link');
    await expect(page.locator('#loginForm')).toBeVisible();
    await assertInteractiveSemantics(page);
    await assertNoRuntimeProblems(problems);
  });

  test('fresh-account navigation, menus and settings have reachable exits', async ({ page }, testInfo) => {
    const problems = installRuntimeGuards(page);
    await registerDisposableAccount(page, testInfo);
    await assertPrimaryNavigation(page);
    await assertVisitBriefNavigation(page);

    await page.locator('.tab[data-tab="home"]').click();
    const openLog = page.locator('#emptyLogEntry');
    if (await openLog.isVisible()) {
      await clickAndRequireEffect(page, openLog, 'Log your first entry');
      await expect(page.locator('#logBackdrop')).toHaveClass(/open/);
      await clickAndRequireEffect(page, page.locator('#closeLog'), 'Close log');
      await expect(page.locator('#logBackdrop')).not.toHaveClass(/open/);
    }

    await page.locator('.tab[data-tab="calendar"]').click();
    await clickAndRequireEffect(page, page.locator('#calPrev'), 'Previous month');
    await clickAndRequireEffect(page, page.locator('#calNext'), 'Next month');

    await page.locator('.tab[data-tab="settings"]').click();
    await clickAndRequireEffect(page, page.locator('#themeToggle'), 'Dark mode');
    await clickAndRequireEffect(page, page.locator('#themeToggle'), 'Light mode');
    await assertInteractiveSemantics(page);

    const checkAgain = page.getByRole('button', { name: /check again/i }).first();
    if (await checkAgain.isVisible().catch(() => false)) {
      await checkAgain.click();
      await expect(checkAgain).toBeEnabled();
      await expect(page.locator('#pametNotificationHealthText')).not.toHaveText('Checking notification permission and device subscription…');
      await expect(page.locator('#pametNotificationHealthText')).not.toHaveText('Checking notification status…');
    }

    await openPlanMatrix(page);
    await assertNoRuntimeProblems(problems);
  });

  test('visible controls across every primary screen have usable semantics', async ({ page }, testInfo) => {
    await registerDisposableAccount(page, testInfo);
    const seen = new Set();
    for (const tab of PRIMARY_TABS) {
      await page.locator(`.tab[data-tab="${tab}"]`).click();
      const inventory = await assertInteractiveSemantics(page);
      inventory.forEach((item) => seen.add(fingerprint(item)));
    }
    await page.locator('.tab[data-tab="home"]').click();
    await page.locator('[data-nav="report"]').first().click();
    (await assertInteractiveSemantics(page)).forEach((item) => seen.add(fingerprint(item)));
    expect(seen.size, 'the audit should inventory a meaningful set of controls').toBeGreaterThan(15);
  });

  test('logout returns a saved account to login without offering duplicate account creation', async ({ page }, testInfo) => {
    await registerDisposableAccount(page, testInfo);
    await page.locator('.tab[data-tab="settings"]').click();
    const logout = page.locator('#logoutBtn');
    await expect(logout).toBeVisible();
    await logout.click();
    await expect(page.locator('#loginForm')).toBeVisible();
    await expect(page.locator('#showRegister')).toBeHidden();
    await expect(page.locator('#switchLocalAccount')).toBeVisible();
  });

  test('@production public shell and synthetic-session primary navigation smoke', async ({ page }) => {
    const problems = installRuntimeGuards(page);
    await page.goto('/', { waitUntil: 'commit' });
    await waitForBootstrap(page);
    await expect(page.locator('#loginForm')).toBeVisible();
    await page.locator('#showRegister').click();
    await expect(page.locator('#registerForm')).toBeVisible();
    await page.locator('#showLogin').click();
    await expect(page.locator('#loginForm')).toBeVisible();
    await assertNoRuntimeProblems(problems);

    await page.context().clearCookies();
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await installSyntheticSession(page, 'ultra');
    await page.goto('/', { waitUntil: 'commit' });
    await waitForBootstrap(page);
    await expect(page.locator('#welcome')).toHaveClass(/hidden/);
    await assertPrimaryNavigation(page);
    await assertVisitBriefNavigation(page);
    await assertInteractiveSemantics(page);
    await openPlanMatrix(page);
  });
});