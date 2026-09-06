/* Pamet Free-plan access — keep catalog promises reachable from Settings. */
(() => {
  'use strict';

  if (window.PametFreePlanAccess) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const STANDARD_BRIEF_HELP = 'Create a concise Standard Visit Brief from the health information you have recorded in Pamet. It is included with Free, Pro, and Ultra and can be viewed or downloaded as a PDF. Appointment Workspace and the Advanced Visit Brief are separate Ultra features.';

  function patternsPrivacyCard() {
    return Array.from(document.querySelectorAll('#screen-settings .settings-card')).find((card) => {
      return card.querySelector('.settings-section')?.textContent?.trim().toLowerCase() === 'patterns & privacy';
    }) || null;
  }

  function wireHelp(help) {
    if (!help || help.querySelector('.tip')) return;
    const tip = document.createElement('span');
    tip.className = 'tip';
    tip.textContent = help.dataset.help || '';
    help.appendChild(tip);
    help.setAttribute('tabindex', '0');
    help.setAttribute('role', 'button');
    help.setAttribute('aria-label', 'About Standard Visit Brief');
    help.setAttribute('aria-expanded', 'false');

    const toggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = help.classList.contains('show');
      document.querySelectorAll('.help.show').forEach((item) => {
        item.classList.remove('show');
        item.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        help.classList.add('show');
        help.setAttribute('aria-expanded', 'true');
      }
    };

    help.addEventListener('click', toggle);
    help.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      toggle(event);
    });
  }

  function openStandardVisitBrief(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (window.PametEntitlements?.has?.('visitBrief') === false) return;

    const existingTrigger = $('#screen-home [data-nav="report"]');
    if (existingTrigger) {
      existingTrigger.click();
      requestAnimationFrame(() => window.PametVisitWorkflow?.refresh?.());
    }
  }

  function installStandardVisitBrief() {
    const existing = $('#standardVisitBriefSetting');
    if (existing) {
      wireHelp($('.help', existing));
      return existing;
    }

    const card = patternsPrivacyCard();
    if (!card) return null;

    const row = document.createElement('div');
    row.id = 'standardVisitBriefSetting';
    row.className = 'setting-row care-access-row standard-visit-brief-setting';
    row.innerHTML = `
      <span class="setting-label">
        <svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM14 3v5h4M9 12h6M9 16h6"/></svg>
        Standard Visit Brief
        <span class="help" data-help="${STANDARD_BRIEF_HELP}">?</span>
      </span>
      <button class="care-access-action" id="createStandardVisitBrief" type="button" data-pamet-entitlement="visitBrief" data-pamet-entitlement-label="Standard Visit Brief">Create visit brief</button>`;

    const feedback = card.querySelector('.feedback-setting');
    if (feedback) card.insertBefore(row, feedback);
    else card.appendChild(row);

    wireHelp($('.help', row));
    $('#createStandardVisitBrief', row)?.addEventListener('click', openStandardVisitBrief);
    window.PametIcons?.hydrate?.();
    return row;
  }

  function clarifyProviderAction() {
    const provider = document.querySelector('[data-enhanced-care-share="provider"], [data-care-share="provider"]');
    if (provider && provider.textContent.trim().toLowerCase() === 'create visit brief') provider.textContent = 'Share securely';
  }

  function refresh() {
    installStandardVisitBrief();
    requestAnimationFrame(clarifyProviderAction);
  }

  document.addEventListener('DOMContentLoaded', refresh, { once:true });
  document.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:entitlements', refresh);
  refresh();

  window.PametFreePlanAccess = Object.freeze({
    refresh,
    openStandardVisitBrief: () => openStandardVisitBrief()
  });
})();
