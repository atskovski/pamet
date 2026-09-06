'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/entitlement-guard.js'), 'utf8');
const matrices = {
  free: { correlations:false, unlimitedHistory:false, sharing:false, appointmentWorkspace:false, multipleProfiles:false, advancedVisitBrief:false, encryptedSync:false },
  pro: { correlations:true, unlimitedHistory:true, sharing:true, appointmentWorkspace:false, multipleProfiles:false, advancedVisitBrief:false, encryptedSync:false },
  ultra: { correlations:true, unlimitedHistory:true, sharing:true, appointmentWorkspace:true, multipleProfiles:true, advancedVisitBrief:true, encryptedSync:true }
};
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness({ plan = 'free', capabilities = matrices[plan], authed = true, status = 200 } = {}) {
  const listeners = new Map();
  const store = {
    _settings: { plan: 'ultra' }, // simulate a stale/tampered local paid plan before the guard loads
    _profiles: [
      { id:'primary', name:'Primary' },
      { id:'family', name:'Family' }
    ],
    _activeProfileId: 'family',
    persistProfiles() {},
    setPlan(value) { this._settings.plan = value; return true; },
    isPro() { return ['pro','ultra'].includes(this._settings.plan); },
    isUltra() { return this._settings.plan === 'ultra'; },
    patterns() { return [{ id:'paid-correlation' }]; },
    switchProfile(id) {
      if (!this._profiles.some((profile) => profile.id === id)) return false;
      this._activeProfileId = id;
      return true;
    },
    removeProfile(id) {
      if (id === 'primary' || this._settings.plan !== 'ultra') return false;
      this._profiles = this._profiles.filter((profile) => profile.id !== id);
      return true;
    },
    get profiles() { return this._profiles.slice(); }
  };
  const auth = { isAuthed: () => authed };
  const nativeFetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return { plan, capabilities:{ ...capabilities } }; }
  });
  const localStorage = { removeItem() {} };
  const document = {
    addEventListener(type, handler) { listeners.set(`document:${type}`, handler); },
    querySelector() { return null; }
  };
  class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const window = {
    PametStore: store,
    PametAuth: auth,
    fetch: nativeFetch,
    location: { origin:'https://pamet.test', href:'https://pamet.test/' },
    addEventListener(type, handler) { listeners.set(`window:${type}`, handler); },
    dispatchEvent() {},
    CustomEvent: FakeCustomEvent
  };
  const context = {
    window, document, localStorage,
    location: window.location,
    CustomEvent: FakeCustomEvent,
    URL,
    queueMicrotask,
    console,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context, { filename:'entitlement-guard.js' });
  return { window, store, listeners };
}

async function settle(window) {
  await window.PametEntitlements.refresh();
  await new Promise((resolve) => setImmediate(resolve));
}

test('Free fails closed even when local plan storage claims Ultra', async () => {
  const { window, store } = harness({ plan:'free' });
  await settle(window);
  assert.equal(window.PametEntitlements.snapshot().plan, 'free');
  assert.equal(window.PametEntitlements.snapshot().verified, true);
  assert.equal(store._settings.plan, 'free');
  assert.equal(store.isPro(), false);
  assert.equal(store.isUltra(), false);
  assert.deepEqual(plain(store.patterns()), []);
  assert.deepEqual(plain(store.profiles.map((profile) => profile.id)), ['primary']);
  assert.equal(store.switchProfile('family'), false);

  store._settings.plan = 'ultra';
  store.setPlan('ultra');
  assert.equal(store._settings.plan, 'free', 'client writes must never elevate the verified server plan');
  assert.equal(store.isUltra(), false);
});

test('Pro receives Pro capabilities but cannot use Ultra profile features', async () => {
  const { window, store } = harness({ plan:'pro' });
  await settle(window);
  const entitlements = window.PametEntitlements.snapshot();
  assert.equal(entitlements.plan, 'pro');
  assert.equal(entitlements.capabilities.correlations, true);
  assert.equal(entitlements.capabilities.sharing, true);
  assert.equal(entitlements.capabilities.multipleProfiles, false);
  assert.equal(entitlements.capabilities.appointmentWorkspace, false);
  assert.equal(store.isPro(), true);
  assert.equal(store.isUltra(), false);
  assert.equal(store.patterns().length, 1);
  assert.deepEqual(plain(store.profiles.map((profile) => profile.id)), ['primary']);
  assert.equal(store.switchProfile('family'), false);
});

test('Ultra receives the cumulative paid capabilities including Ultra-only features', async () => {
  const { window, store } = harness({ plan:'ultra' });
  await settle(window);
  const entitlements = window.PametEntitlements.snapshot();
  assert.equal(entitlements.plan, 'ultra');
  assert.equal(entitlements.capabilities.correlations, true);
  assert.equal(entitlements.capabilities.sharing, true);
  assert.equal(entitlements.capabilities.multipleProfiles, true);
  assert.equal(entitlements.capabilities.appointmentWorkspace, true);
  assert.equal(entitlements.capabilities.advancedVisitBrief, true);
  assert.equal(entitlements.capabilities.encryptedSync, true);
  assert.equal(store.isUltra(), true);
  assert.deepEqual(plain(store.profiles.map((profile) => profile.id)), ['primary','family']);
  assert.equal(store.switchProfile('family'), true);
});

test('contradictory server capability payload fails closed instead of granting access', async () => {
  const bad = { ...matrices.free, correlations:true };
  const { window, store } = harness({ plan:'free', capabilities:bad });
  await settle(window);
  const entitlements = window.PametEntitlements.snapshot();
  assert.equal(entitlements.plan, 'free');
  assert.equal(entitlements.verified, false);
  assert.equal(store.isPro(), false);
  assert.deepEqual(plain(store.patterns()), []);
});

test('entitlement endpoint failure fails closed to Free', async () => {
  const { window, store } = harness({ plan:'ultra', status:503 });
  await settle(window);
  const entitlements = window.PametEntitlements.snapshot();
  assert.equal(entitlements.plan, 'free');
  assert.equal(entitlements.verified, false);
  assert.equal(store.isUltra(), false);
  assert.deepEqual(plain(store.profiles.map((profile) => profile.id)), ['primary']);
});

test('every catalog feature marked Free stays available through the runtime entitlement guard', async () => {
  const contract = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../contracts/plan-features.json'), 'utf8'));
  const freeFeatures = contract.features.filter((feature) => feature.free === true).map((feature) => feature.id);
  assert.ok(freeFeatures.includes('visitBrief'), 'Standard Visit Brief must remain in the canonical Free feature set');

  const verified = harness({ plan:'free' });
  await settle(verified.window);
  assert.deepEqual(freeFeatures.filter((feature) => !verified.window.PametEntitlements.has(feature)), []);
  assert.equal(verified.store.hasEntitlement('visitBrief'), true);

  const unavailableServer = harness({ plan:'free', status:503 });
  await settle(unavailableServer.window);
  assert.equal(unavailableServer.window.PametEntitlements.snapshot().verified, false);
  assert.deepEqual(freeFeatures.filter((feature) => !unavailableServer.window.PametEntitlements.has(feature)), [], 'Free features must not depend on paid-plan verification');
});
