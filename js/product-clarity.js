/* Pamet 1.4.0 — cross-screen profile access, pattern readiness, and calendar clarity. */
(() => {
  'use strict';
  const S = window.PametStore;
  if (!S) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function closeProfileMenu() { $('#quickProfileRoot')?.remove(); }
  function switchProfile(profileId) {
    const target = S.profiles.find((profile) => profile.id === profileId);
    const current = S.activeProfile;
    if (!target || target.id === current.id) return closeProfileMenu();
    const root = $('#quickProfileRoot');
    const panel = root?.querySelector('.quick-profile-panel');
    if (!panel) return;
    panel.innerHTML = `<div class="quick-profile-confirm"><span class="quick-profile-eyebrow">Switch profile</span><h2>${esc(target.name)}</h2><p>Pamet will change the active health journal from <strong>${esc(current.name)}</strong> to <strong>${esc(target.name)}</strong>. Your account stays signed in and no profile data is deleted.</p><div class="quick-profile-actions"><button type="button" class="btn btn-ghost" data-quick-cancel>Cancel</button><button type="button" class="btn btn-primary" data-quick-confirm>Switch</button></div></div>`;
    panel.querySelector('[data-quick-cancel]').addEventListener('click', closeProfileMenu);
    panel.querySelector('[data-quick-confirm]').addEventListener('click', () => { if (S.switchProfile(target.id)) location.reload(); });
  }

  function openProfileMenu() {
    closeProfileMenu();
    const current = S.activeProfile;
    const root = document.createElement('div');
    root.id = 'quickProfileRoot';
    root.className = 'quick-profile-backdrop';
    root.innerHTML = `<section class="quick-profile-panel" role="dialog" aria-modal="true" aria-label="Switch Pamet profile"><header><div><span class="quick-profile-eyebrow">Active profile</span><h2>${esc(current.name)}</h2><p>${esc(current.relationship)} · ${S.entriesForProfile(current.id).length} ${S.entriesForProfile(current.id).length === 1 ? 'entry' : 'entries'}</p></div><button type="button" class="pamet-close" data-quick-close aria-label="Close">×</button></header><div class="quick-profile-list">${S.profiles.map((profile) => `<button type="button" class="quick-profile-option${profile.id === current.id ? ' active' : ''}" data-quick-profile="${esc(profile.id)}"><span class="quick-profile-avatar">${esc((profile.name || '?').slice(0,1).toUpperCase())}</span><span><strong>${esc(profile.name)}</strong><small>${esc(profile.relationship)}${profile.id === current.id ? ' · Current' : ''}</small></span><span aria-hidden="true">${profile.id === current.id ? '✓' : '›'}</span></button>`).join('')}</div><button type="button" class="quick-profile-manage" data-quick-manage>Manage profiles in Settings</button></section>`;
    document.body.appendChild(root);
    root.querySelector('[data-quick-close]').addEventListener('click', closeProfileMenu);
    root.addEventListener('click', (event) => { if (event.target === root) closeProfileMenu(); });
    root.querySelectorAll('[data-quick-profile]').forEach((button) => button.addEventListener('click', () => switchProfile(button.dataset.quickProfile)));
    root.querySelector('[data-quick-manage]').addEventListener('click', () => {
      closeProfileMenu();
      document.querySelector('[data-tab="settings"]')?.click();
      setTimeout(() => document.querySelector('[data-phase2="profiles"]')?.click(), 80);
    });
  }

  function installProfileButton() {
    const topbar = $('.topbar');
    if (!topbar || $('#quickProfileButton')) return;
    const theme = $('#themeToggle');
    const wrap = document.createElement('div');
    wrap.className = 'topbar-actions';
    const button = document.createElement('button');
    button.id = 'quickProfileButton';
    button.type = 'button';
    button.className = 'icon-btn profile-icon-btn';
    button.title = 'Switch profile';
    button.setAttribute('aria-label', `Switch profile. Currently ${S.activeProfile.name}`);
    button.innerHTML = window.PametIcons.svg('profiles') + `<span class="profile-icon-dot">${S.profiles.length}</span>`;
    button.hidden = S.profiles.length < 2;
    button.addEventListener('click', openProfileMenu);
    if (theme) {
      topbar.insertBefore(wrap, theme);
      wrap.append(button, theme);
    } else { topbar.appendChild(button); }
  }

  function patternReadiness() {
    const screen = $('#screen-patterns');
    const banner = screen?.querySelector('.patterns-banner');
    if (!screen || !banner) return;
    const days = [...new Set(S.entries.map((entry) => String(entry.date).slice(0, 10)))].length;
    const patterns = S.patterns();
    const confirmed = patterns.filter((pattern) => !pattern.isEmerging);
    const emerging = patterns.filter((pattern) => pattern.isEmerging);
    const signature = [days, confirmed.length, emerging.length, confirmed[0]?.title || ''].join('|');
    if (banner.dataset.readinessSignature === signature) return;
    let stage = 'Start your baseline';
    let summary = 'Log your first day to begin building an observational baseline.';
    let next = 'Start with one complete entry. Logging both symptom and symptom-free days makes later comparisons more useful.';
    let strength = 0;
    if (days > 0 && days < 3) {
      stage = 'Baseline started'; strength = Math.round(days / 7 * 100);
      summary = `${days} logged day${days === 1 ? '' : 's'} gives Pamet a starting point, but it is too early to call a repeat pattern.`;
      next = `Log ${3 - days} more day${3 - days === 1 ? '' : 's'} to unlock the first basic comparisons. Try to include sleep, stress, activity, medications, and notes when they are relevant.`;
    } else if (days >= 3 && days < 7) {
      stage = 'Early comparison stage'; strength = Math.round(days / 7 * 100);
      summary = `${days} logged days can support early comparisons, but repeat observations are still developing.`;
      next = `Log ${7 - days} more day${7 - days === 1 ? '' : 's'} for a stronger baseline. Include ordinary days too, not only difficult symptom days.`;
    } else if (days >= 7 && !confirmed.length) {
      stage = emerging.length ? 'Patterns are developing' : 'Baseline ready'; strength = 100;
      summary = emerging.length ? `${emerging.length} early observation${emerging.length === 1 ? ' is' : 's are'} developing. Pamet will keep checking whether they repeat.` : 'Pamet has enough logged days for early comparisons, but no repeat observation is strong enough to highlight yet.';
      next = 'Keep tracking consistently. A quiet pattern screen can be meaningful too—it means Pamet is not forcing a conclusion from limited data.';
    } else if (confirmed.length) {
      stage = `${confirmed.length} supported observation${confirmed.length === 1 ? '' : 's'}`; strength = 100;
      summary = `Pamet found ${confirmed.length} repeat observation${confirmed.length === 1 ? '' : 's'} in your recorded history. These describe what was logged; they do not establish cause.`;
      next = `Strongest current observation: ${confirmed[0].title}. Keep logging so Pamet can strengthen, weaken, or retire observations as your history changes.`;
    }
    banner.dataset.readinessSignature = signature;
    banner.classList.add('pattern-readiness-banner');
    banner.innerHTML = `<div class="pattern-readiness-head"><div><span class="pattern-readiness-label">Pattern readiness</span><h3>${esc(stage)}</h3></div><strong>${days} day${days === 1 ? '' : 's'}</strong></div><p>${esc(summary)}</p><div class="pattern-readiness-meter" aria-label="Pattern baseline strength"><span style="width:${Math.min(100, strength)}%"></span></div><p class="pattern-readiness-next">${esc(next)}</p>`;
  }

  function calendarClarity() {
    const screen = $('#screen-calendar');
    if (!screen) return;
    const legend = screen.querySelector('.legend');
    if (legend && !legend.dataset.clarity) {
      legend.dataset.clarity = 'true';
      legend.innerHTML = '<span class="legend-item"><i class="legend-dot logged-clear"></i>No symptoms recorded</span><span class="legend-item"><i class="legend-dot logged-mild"></i>Mild symptoms</span><span class="legend-item"><i class="legend-dot logged-significant"></i>Significant symptoms</span><span class="legend-item"><i class="legend-dot today-outline"></i>Today</span>';
    }
    const detail = $('#calDetail');
    const empty = detail?.querySelector('.no-symptom');
    if (empty && /No symptoms logged for this day/i.test(empty.textContent)) empty.lastChild.textContent = ' No entry recorded for this day.';
    const month = $('#calMonth')?.textContent || '';
    screen.querySelectorAll('.cal-cell:not(.empty)').forEach((cell) => {
      const day = cell.querySelector('.num')?.textContent || '';
      const status = cell.classList.contains('healthy') ? 'no symptoms recorded' : cell.classList.contains('significant') ? 'significant symptoms recorded' : cell.classList.contains('mild') ? 'mild symptoms recorded' : 'no entry recorded';
      cell.setAttribute('aria-label', `${month} ${day}: ${status}${cell.classList.contains('today') ? ', today' : ''}`);
    });
  }

  function refresh() { installProfileButton(); patternReadiness(); calendarClarity(); }
  document.addEventListener('click', (event) => { if (event.target.closest('[data-tab], [data-nav], #calPrev, #calNext, .cal-cell')) setTimeout(refresh, 0); });
  document.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:login', () => setTimeout(refresh, 30));
  window.addEventListener('pamet:registered', () => setTimeout(refresh, 30));
  const observer = new MutationObserver(() => requestAnimationFrame(refresh));
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
})();
