'use strict';

const { test, expect } = require('@playwright/test');

async function waitForBootstrap(page) {
  await page.waitForFunction(() => typeof window.PametAuth?.register === 'function' && typeof window.PametAuth?.login === 'function');
}

async function logoutThroughSettings(page) {
  await page.locator('.tab[data-tab="settings"]').click();
  await expect(page.locator('#logoutBtn')).toBeVisible();
  const logoutResponse = page.waitForResponse((response) => response.url().includes('/api/auth/logout') && response.request().method() === 'POST');
  await page.locator('#logoutBtn').click();
  const response = await logoutResponse;
  expect(response.ok()).toBeTruthy();
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.PametAuth?.isAuthed?.())).toBe(false);
}

test('new account, returning login, and duplicate registration states are explicit', async ({ page }, testInfo) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  const email = `auth-flow-${unique}@example.com`;
  const password = `Pamet-Auth-${unique}-Password!`;

  await page.goto('/', { waitUntil: 'commit' });
  await waitForBootstrap(page);

  // A browser with no saved Pamet account must clearly offer account creation.
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#registerForm')).toBeHidden();
  await expect(page.locator('#showRegister')).toBeVisible();
  await expect(page.locator('#showRegister')).toHaveText('Create an account');

  await page.locator('#showRegister').click();
  await expect(page.locator('#registerForm')).toBeVisible();
  await expect(page.locator('#loginForm')).toBeHidden();
  await page.locator('#regFirstName').fill('Auth');
  await page.locator('#regLastName').fill('Flow');
  await page.locator('#regEmail').fill(email);
  await page.locator('#regPassword').fill(password);

  const registerResponse = page.waitForResponse((response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST');
  await page.locator('#registerForm button[type="submit"]').click();
  const registered = await registerResponse;
  expect(registered.status()).toBe(201);

  // Registration is server-confirmed, the session is active, and the user sees a clear confirmation.
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window.PametAuth?.isAuthed?.())).toBe(true);
  await expect(page.locator('#pametAuthSuccess')).toBeVisible();
  await expect(page.locator('#pametAuthSuccess')).toContainText('Account created');
  await expect(page.locator('#pametAuthSuccess')).toContainText('you’re signed in');

  // A returning user on the same browser should get the login path, not another create-account prompt.
  await logoutThroughSettings(page);
  await expect(page.locator('#showRegister')).toBeHidden();
  await expect(page.locator('#switchLocalAccount')).toBeVisible();
  await expect(page.locator('#loginEmail')).toHaveValue(email);

  await page.locator('#loginPassword').fill(password);
  const loginResponse = page.waitForResponse((response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST');
  await page.locator('#loginForm button[type="submit"]').click();
  const loggedIn = await loginResponse;
  expect(loggedIn.ok()).toBeTruthy();
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect.poll(() => page.evaluate(() => window.PametAuth?.isAuthed?.())).toBe(true);

  // If local identity is intentionally removed, account creation is offered again. A server-side
  // duplicate must be explained in the visible registration form instead of disappearing in login.
  await logoutThroughSettings(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#switchLocalAccount').click();
  await expect(page.locator('#showRegister')).toBeVisible();
  await page.locator('#showRegister').click();
  await page.locator('#regFirstName').fill('Auth');
  await page.locator('#regLastName').fill('Flow');
  await page.locator('#regEmail').fill(email);
  await page.locator('#regPassword').fill(password);

  const duplicateResponse = page.waitForResponse((response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST');
  await page.locator('#registerForm button[type="submit"]').click();
  const duplicate = await duplicateResponse;
  expect(duplicate.status()).toBe(409);
  await expect(page.locator('#registerForm')).toBeVisible();
  await expect(page.locator('#loginForm')).toBeHidden();
  await expect(page.locator('#registerForm .form-error')).toBeVisible();
  await expect(page.locator('#registerForm .form-error')).toContainText('An account already exists for this email.');
  await expect(page.locator('#registerForm .form-error')).toContainText('Log in');
  await expect(page.locator('#registerForm button[type="submit"]')).toBeEnabled();

  // Switching to login preserves the entered email so an existing user can recover immediately.
  await page.locator('#showLogin').click();
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#registerForm')).toBeHidden();
  await expect(page.locator('#loginEmail')).toHaveValue(email);
});
