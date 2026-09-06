/* Pamet care-sharing and appointment workspace refinements. */
(() => {
  'use strict';
  const S = window.PametStore;
  const A = window.PametAuth;
  if (!S || !A) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function closeRoot(root) { root?.remove(); }
  function modal(content, className = '') {
    document.querySelector('#careSharingEnhancedRoot')?.remove();
    const root = document.createElement('div');
    root.id = 'careSharingEnhancedRoot';
    root.innerHTML = `<div class="pamet-modal-backdrop care-ux-backdrop"><section class="pamet-modal phase2-modal ${className}" role="dialog" aria-modal="true">${content}</section></div>`;
    document.body.appendChild(root);
    root.querySelectorAll('[data-enhanced-close]').forEach(btn => btn.addEventListener('click', () => closeRoot(root)));
    root.firstElementChild?.addEventListener('click', event => { if (event.target === event.currentTarget) closeRoot(root); });
    return root;
  }

  function status(root, message, kind = 'info') {
    const el = $('[data-enhanced-status]', root);
    if (!el) return;
    el.hidden = !message;
    el.className = `care-ux-status ${kind}`;
    el.textContent = message || '';
  }

  async function api(path, options = {}) {
    const credential = A.getBackendCredential?.();
    const headers = {'Content-Type':'application/json', ...(options.headers || {})};
    if (credential?.deviceKey) headers.Authorization = `Bearer ${credential.deviceKey}`;
    const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options, headers});
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {error:text}; }
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function reportData() {
    const report = S.report();
    const entries = (S.entriesForProfile ? S.entriesForProfile(S.activeProfile.id) : S.entries || []).slice(0, 60);
    const patterns = (S.patterns?.() || []).filter(item => !item.isEmerging).slice(0, 10);
    const average = key => {
      const values = entries.map(entry => Number(entry[key])).filter(Number.isFinite);
      return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '—';
    };
    return {report, entries, patterns, average};
  }

  function caregiverSnapshot(includeNotes) {
    const {report} = reportData();
    return {
      generatedAt: new Date().toISOString(),
      profileName: S.activeProfile.name,
      rangeLabel: report.rangeLabel,
      overview: (report.overview || []).filter(row => ['Days logged','Symptom days','Average severity','Most frequent symptom'].includes(row[0])),
      symptoms: (report.breakdown || []).slice(0, 10),
      medications: (report.medications || []).slice(0, 10),
      notes: includeNotes ? (report.notes || []).slice(0, 5) : [],
      disclaimer: 'A limited summary shared by the Pamet user for caregiver context. This is not emergency monitoring, medical advice, diagnosis, or a clinical assessment.'
    };
  }

  function providerSnapshot(includeNotes) {
    const {report, entries, patterns, average} = reportData();
    return {
      generatedAt: new Date().toISOString(),
      profileName: S.activeProfile.name,
      rangeLabel: report.rangeLabel,
      overview: report.overview || [],
      symptoms: report.breakdown || [],
      medications: report.medications || [],
      patterns: patterns.map(pattern => ({title:pattern.title, detail:pattern.detail, occurrences:pattern.occurrences, confidence:pattern.confidence})),
      recentContext: {
        averageSleepHours: average('sleepHours'),
        averageStress: average('stressLevel'),
        averageHydrationGlasses: average('waterGlasses'),
        averageSeverity: average('severity'),
        recentLoggedEntries: entries.length
      },
      notes: includeNotes ? (report.notes || []).slice(0, 12) : [],
      discussionPrompts: [
        'Which recorded symptom changes are most important to review?',
        'Do the recorded medication, sleep, stress, hydration, or activity changes add useful context?',
        'Which Pamet observations are worth discussing further?',
        'What should the patient keep tracking before the next visit?'
      ],
      disclaimer: 'Patient-generated Visit Brief from user-recorded information. Pamet observations describe recorded associations and do not establish diagnosis, cause, or treatment effect.'
    };
  }

  function rows(items) {
    return (items || []).map(row => `<tr><th>${esc(row[0])}</th><td>${esc(row[1])}</td></tr>`).join('');
  }

  function createPdf(kind, includeNotes) {
    const provider = kind === 'provider';
    const snapshot = provider ? providerSnapshot(includeNotes) : caregiverSnapshot(includeNotes);
    const popup = window.open('', '_blank', 'width=860,height=1050');
    if (!popup) return false;
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>Pamet ${provider ? 'Primary care visit brief' : 'Caregiver summary'}</title><style>body{font-family:Arial,sans-serif;color:#243638;max-width:780px;margin:36px auto;padding:0 24px}header{border-bottom:4px solid #4CAF7A;padding-bottom:14px}h1{color:#0F3D3E}h2{margin-top:26px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #dde4df;text-align:left;vertical-align:top}th{width:42%}.box{padding:14px;border:1px solid #dce5df;border-radius:10px;margin:12px 0}.note{font-size:12px;color:#647276;margin-top:28px;border-top:1px solid #dde4df;padding-top:14px}</style></head><body><header><h1>${provider ? 'Primary care visit brief' : 'Caregiver summary'}</h1><p>${esc(snapshot.profileName)} · ${esc(snapshot.rangeLabel || 'Recorded health history')}</p></header><h2>Tracking overview</h2><table>${rows(snapshot.overview)}</table>${snapshot.symptoms.length ? `<h2>Symptoms recorded</h2><table>${rows(snapshot.symptoms)}</table>` : ''}${snapshot.medications.length ? `<h2>Medications recorded</h2><table>${rows(snapshot.medications)}</table>` : ''}${provider ? `<h2>Recent context</h2><div class="box">Average severity: ${esc(snapshot.recentContext.averageSeverity)} / 10<br>Average sleep: ${esc(snapshot.recentContext.averageSleepHours)} hours<br>Average stress: ${esc(snapshot.recentContext.averageStress)} / 10<br>Average hydration: ${esc(snapshot.recentContext.averageHydrationGlasses)} glasses<br>Recent logged entries reviewed: ${esc(snapshot.recentContext.recentLoggedEntries)}</div>${snapshot.patterns.length ? `<h2>Pamet observations</h2><ul>${snapshot.patterns.map(item => `<li><strong>${esc(item.title)}</strong> — ${esc(item.detail || '')}</li>`).join('')}</ul>` : ''}<h2>Discussion prompts</h2><ul>${snapshot.discussionPrompts.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${snapshot.notes.length ? `<h2>Recent notes</h2>${snapshot.notes.map(note => `<p><strong>${esc(note.date || 'Recent')}</strong><br>${esc(note.notes || note.text || '')}</p>`).join('')}` : ''}<p class="note">${esc(snapshot.disclaimer)} Created locally from information recorded in Pamet. Use the browser print dialog and choose Save as PDF.</p></body></html>`);
    popup.document.close();
    setTimeout(() => { popup.focus(); popup.print(); }, 250);
    return true;
  }

  function inclusionList(provider) {
    const items = provider ? [
      ['Tracking overview','Days logged, symptom days, average severity, most frequent symptom, and other summary measures.'],
      ['Full symptom history','Recorded symptom frequency and severity information available in the selected history range.'],
      ['Medication history','Medications and supplements recorded in Pamet.'],
      ['Pamet observations','Supported recorded associations and patterns, with clear non-diagnostic wording.'],
      ['Recent context','Sleep, stress, hydration, severity, and recent logging context when available.'],
      ['Discussion prompts','Questions designed to help structure the appointment conversation.']
    ] : [
      ['Tracking overview','Days logged, symptom days, average severity, and most frequent symptom.'],
      ['Symptom summary','A limited view of recorded symptom frequency.'],
      ['Medication list','Medications and supplements recorded in Pamet.'],
      ['Recent notes','Optional. Off by default so personal notes are not shared unless you choose them.']
    ];
    return items.map(([title,detail]) => `<li><span class="share-inclusion-check" aria-hidden="true">✓</span><div><strong>${title}</strong><span>${detail}</span></div></li>`).join('');
  }

  async function openEnhancedShare(kind) {
    const provider = kind === 'provider';
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">${provider ? 'Primary care access' : 'Caregiver access'}</h2><p class="pamet-modal-sub">${provider ? 'Create the most detailed Pamet summary for a clinician or practice.' : 'Share a limited, read-only summary with someone helping support your care.'}</p></div><button class="pamet-close" data-enhanced-close aria-label="Close">×</button></div><div class="enhanced-share-explainer"><div><strong>${provider ? 'Primary care receives the detailed Visit Brief' : 'Your caregiver receives a limited summary'}</strong><span>${provider ? 'This is intentionally more detailed than caregiver access and is designed to support a clinical conversation.' : 'Pamet does not send your full journal, pattern analysis, or clinician-oriented context by default.'}</span></div></div><section class="enhanced-share-includes" aria-labelledby="shareIncludesTitle"><h3 id="shareIncludesTitle">What will be included</h3><ul>${inclusionList(provider)}</ul></section><div data-enhanced-status class="care-ux-status info" role="status" aria-live="polite">Checking secure email delivery…</div><form id="enhancedShareForm" class="pamet-form"><div class="enhanced-share-grid"><label>${provider ? 'Clinician or practice name' : 'Caregiver name'}<input id="enhancedShareName" required maxlength="100" autocomplete="name"></label><label>Email<input id="enhancedShareEmail" type="email" required maxlength="254" autocomplete="email"></label><label>Link expires<select id="enhancedShareExpiry"><option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></label><label>Access<select id="enhancedSharePermission"><option value="view">View secure summary</option><option value="download">View and download</option></select></label></div><label class="enhanced-share-check"><input id="enhancedShareNotes" type="checkbox" ${provider ? 'checked' : ''}><span><strong>Include recent notes</strong><small>${provider ? 'Recommended for a fuller clinician Visit Brief. Review your notes before sharing.' : 'Optional. Leave off if you only want to share the limited summary.'}</small></span></label><div class="enhanced-share-actions"><button type="button" class="btn btn-ghost" id="enhancedSharePdf">Create PDF instead</button><div class="enhanced-share-actions-right"><button type="button" class="btn btn-ghost" data-enhanced-close>Cancel</button><button class="btn btn-primary" id="enhancedShareSubmit">Send secure invitation</button></div></div><p class="phase2-form-help">The PDF fallback is created locally from the same selected information. Secure links are expiring and revocable.</p></form>`,'care-share-modal enhanced-share-modal');

    let emailReady = true;
    try {
      const cfg = await api('/api/billing/config');
      emailReady = cfg.emailEnabled === true;
      status(root, emailReady ? 'Secure email delivery is ready. You can also create a local PDF at any time.' : 'Email delivery is not configured right now. Nothing is blocked: use Create PDF instead to save or share the selected summary.', emailReady ? 'success' : 'warning');
    } catch {
      status(root, 'Pamet could not confirm email delivery. You can try the secure invitation or create a local PDF instead.', 'warning');
    }

    const submit = $('#enhancedShareSubmit', root);
    if (!emailReady) submit.disabled = true;
    $('#enhancedSharePdf', root)?.addEventListener('click', () => {
      const created = createPdf(kind, $('#enhancedShareNotes', root)?.checked === true);
      status(root, created ? 'PDF view opened. In the print dialog choose Save as PDF.' : 'Your browser blocked the PDF window. Allow pop-ups for Pamet and try again.', created ? 'success' : 'warning');
    });

    $('#enhancedShareForm', root)?.addEventListener('submit', async event => {
      event.preventDefault();
      const name = $('#enhancedShareName', root).value.trim();
      const email = $('#enhancedShareEmail', root).value.trim();
      const expiresInDays = +$('#enhancedShareExpiry', root).value;
      const permission = $('#enhancedSharePermission', root).value;
      const includeNotes = $('#enhancedShareNotes', root)?.checked === true;
      submit.disabled = true;
      status(root, `Sending secure invitation to ${email}…`, 'info');
      try {
        const snapshot = provider ? providerSnapshot(includeNotes) : caregiverSnapshot(includeNotes);
        await api('/api/sharing/invites', {method:'POST', body:JSON.stringify({kind:provider ? 'provider' : 'caregiver', name, email, permission, expiresInDays, profileName:S.activeProfile.name, snapshot})});
        status(root, 'Secure invitation sent. The recipient will only receive the information described above.', 'success');
        setTimeout(() => closeRoot(root), 2200);
      } catch (error) {
        status(root, `${error.message || 'The invitation could not be sent.'} You can still create a PDF using the button below.`, 'error');
        submit.disabled = !emailReady;
      }
    });
  }

  function installButtons() {
    $('#standardVisitBriefSetting .care-access-action')?.classList.add('btn','btn-ghost');
    const pairs = [
      ['#setCaregiver','caregiver','Share securely'],
      ['#setPrimaryCare','provider','Create visit brief']
    ];
    pairs.forEach(([selector, kind, label]) => {
      const original = $(selector);
      const row = original?.closest('.setting-row') || document.querySelector(`.care-access-action[data-care-share="${kind}"]`)?.closest('.setting-row');
      if (!row || row.dataset.enhancedShare === 'true') return;
      row.dataset.enhancedShare = 'true';
      const old = row.querySelector('.care-access-action') || original;
      if (!old) return;
      const button = old.cloneNode(true);
      button.removeAttribute('id');
      button.removeAttribute('data-care-share');
      button.dataset.enhancedCareShare = kind;
      button.textContent = label;
      old.replaceWith(button);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openEnhancedShare(kind);
      });
    });
  }

  const refresh = () => requestAnimationFrame(installButtons);
  document.addEventListener('DOMContentLoaded', refresh, {once:true});
  document.addEventListener('pamet:settings-rendered', refresh);
  const observer = new MutationObserver(() => {
    if ($('#setCaregiver') || $('#setPrimaryCare') || document.querySelector('.care-access-action[data-care-share]')) refresh();
  });
  observer.observe(document.documentElement, {childList:true, subtree:true});
  refresh();
  window.PametCareSharingEnhancements = {open:openEnhancedShare, refresh:installButtons};
})();