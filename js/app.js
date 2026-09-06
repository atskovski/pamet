/* ============================================================
   Pamet — app logic
   Renders every screen from the store, handles navigation,
   logging, settings, and export. No frameworks required.
   ============================================================ */

(function () {
  "use strict";
  const S = window.PametStore;
  const A = window.PametAuth;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---- HTML escape for any user-generated text ----
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- Color helpers (map to CSS vars) ----
  const PAT_COLORS = { rose: "var(--rose-pink)", amber: "var(--warm-amber)", sage: "var(--sage-green)", neutral: "var(--ink-tertiary)" };
  function sevColor(sev) { return sev < 3 ? "var(--sage-green)" : sev < 6 ? "var(--warm-amber)" : "var(--rose-pink)"; }
  function sevClass(sev) { return sev < 3 ? "sage" : sev < 6 ? "mild" : "significant"; }

  // ---- State ----
  let currentTab = "home";
  let calCursor = new Date();           // month being shown in calendar
  let selectedDate = new Date();        // day selected in calendar
  let displayName = "";                 // first name shown on home (from auth)

  // ---- Honor-system badge (medical cross in a medal) ----
  const TIER_ICON = '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="M12 6.5v5M9.5 9h5"/><path d="M8.5 14.5 7 21l5-3 5 3-1.5-6.5"/></svg>';
  function tierBadgeEl(tier) {
    if (!tier) return null;
    const el = document.createElement("span");
    el.className = "tier-badge";
    el.style.setProperty("--tier-color", tier.color);
    el.title = `${tier.name} — ${tier.minDays}+ days logged`;
    el.innerHTML = TIER_ICON + "<span>" + esc(tier.name) + "</span>";
    return el;
  }
  function setTierBadge(container, tier) {
    if (!container) return;
    container.innerHTML = "";
    if (tier) { const b = tierBadgeEl(tier); if (b) container.appendChild(b); }
  }

  // Small "X days to next tier" nudge under the greeting.
  function renderTierNudge() {
    const el = $("#tierNudge");
    if (!el) return;
    const days = S.totalDaysLogged();
    if (!days) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const next = S.nextTier();
    if (!next) {
      el.hidden = false;
      el.textContent = "🏆 Beast status — you're at the top tier. Keep it up!";
      return;
    }
    const remaining = next.minDays - days;
    el.hidden = false;
    el.textContent = `${remaining} day${remaining > 1 ? "s" : ""} to ${next.name}`;
  }

  // ---- Settings help tooltips (inject from data-help, tap-friendly) ----
  function wireHelp() {
    $$(".help").forEach((h) => {
      if (h.querySelector(".tip")) return;
      const tip = document.createElement("span");
      tip.className = "tip";
      tip.textContent = h.dataset.help || "";
      h.appendChild(tip);
      h.setAttribute("tabindex", "0");
      h.setAttribute("role", "button");
      h.setAttribute("aria-label", "About this setting");
      h.setAttribute("aria-expanded", "false");
      h.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = h.classList.contains("show");
        $$(".help.show").forEach((x) => { x.classList.remove("show"); x.setAttribute("aria-expanded", "false"); });
        if (!open) { h.classList.add("show"); h.setAttribute("aria-expanded", "true"); }
      });
      h.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); h.click(); } });
    });
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  function setTab(name) {
    currentTab = name;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
    $$(".tab[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    if (name === "calendar") renderCalendar();
    if (name === "patterns") renderPatterns();
    if (name === "report") renderReport();
    if (name === "settings") renderSettings();
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function greetingText() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 17) return "Good afternoon";
    return "Good evening";
  }

  function renderDashboard() {
    const m = S.metrics();
    const pats = S.patterns();
    const hasEntries = S.entries.length > 0;

    // Greeting uses the account's first name only (per v1.0.1 spec).
    $("#greeting").textContent = `${greetingText()}, ${displayName || S.settings.userName || "friend"} 👋`;
    $("#todayDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    setTierBadge($("#greetTier"), S.tier());
    renderTierNudge();

    // Streak (honors the "Show day streak" toggle)
    const showStreak = hasEntries && !!S.settings.showStreak;
    $("#streakCard").style.display = showStreak ? "flex" : "none";
    if (showStreak) {
      $("#streakDays").textContent = m.streakDays;
      const dots = $("#streakDots");
      dots.innerHTML = "";
      for (let i = 0; i < 7; i++) {
        const d = document.createElement("span");
        if (i >= 6) d.className = "off";
        dots.appendChild(d);
      }
    }

    // Observation banner (top confirmed pattern) — honors the Home setting.
    const top = pats.find((p) => !p.isEmerging);
    if (hasEntries && top && !!S.settings.showInsight) {
      $("#insightText").textContent = top.detail;
      $("#insightBanner").hidden = false;
    } else {
      $("#insightBanner").hidden = true;
    }

    // A first-time user sees guidance, never fabricated or zeroed health metrics.
    $("#homeEmptyState").hidden = hasEntries;
    $("#metricsGrid").hidden = !hasEntries;
    $("#recentSection").hidden = !hasEntries;

    // Metric cards
    const metricValues = {
      symptomDays: String(m.symptomDaysThisWeek),
      avgSeverity: m.avgSeverity,
      topSymptom: m.topSymptom,
      patterns: String(pats.filter((p) => !p.isEmerging).length)
    };
    $$(".metric-card").forEach((card) => {
      const key = card.dataset.metric;
      const valEl = card.querySelector("[data-value]");
      if (valEl) valEl.textContent = metricValues[key] ?? "--";
      const badgeEl = card.querySelector("[data-badge]");
      if (badgeEl) {
        if (key === "symptomDays") {
          const diff = m.symptomDaysThisWeek - (m.symptomDaysLastWeek || 0);
          badgeEl.textContent = diff >= 0 ? `+${diff} vs last` : `${diff} vs last`;
        } else {
          badgeEl.textContent = badgeEl.dataset.badge;
        }
      }
    });

    // Recent entries
    renderEntryList($("#recentEntries"), S.entries.slice(0, 5));
  }

  function renderEntryList(container, entries) {
    container.innerHTML = "";
    if (!entries.length) {
      container.innerHTML = `<div class="home-empty-state compact"><div><h2>Your entries will appear here</h2><p>Track your first day to begin building your health history.</p></div></div>`;
      return;
    }
    entries.forEach((e) => container.appendChild(entryRowEl(e)));
  }

  function entryRowEl(e) {
    const d = new Date(e.date);
    const row = document.createElement("div");
    row.className = "entry-row";

    let tags;
    if (!e.symptoms.length) {
      tags = `<span class="pill sage">No symptoms</span>`;
    } else {
      tags = e.symptoms.map((s) => `<span class="pill rose">${esc(s)}</span>`).join("");
    }
    tags += `<span class="pill neutral">Sleep ${e.sleepHours}h</span><span class="pill neutral">Stress ${Math.round(e.stressLevel)}/10</span>`;
    let dots = "";
    const filled = Math.round(e.severity / 2);
    for (let i = 0; i < 5; i++) dots += `<span class="${i < filled ? "on" : ""}"></span>`;

    row.innerHTML = `
      <div class="entry-date"><div class="d">${d.getDate()}</div><div class="m">${d.toLocaleDateString("en-US", { month: "short" })}</div></div>
      <div class="entry-main">
        <div class="entry-tags">${tags}</div>
        ${e.notes ? `<p class="entry-notes">${esc(e.notes)}</p>` : ""}
      </div>
      <div class="severity-dots">${dots}</div>`;
    return row;
  }

  // ============================================================
  // CALENDAR
  // ============================================================
  function renderCalendar() {
    const y = calCursor.getFullYear();
    const mo = calCursor.getMonth();
    $("#calMonth").textContent = calCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // weekday header
    const wd = $("#calWeekdays");
    wd.innerHTML = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<span>${d}</span>`).join("");

    // build grid
    const first = new Date(y, mo, 1);
    const startWeekday = first.getDay(); // 0=Sun
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const today = new Date();

    const grid = $("#calGrid");
    grid.innerHTML = "";
    for (let i = 0; i < startWeekday; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-cell empty";
      grid.appendChild(empty);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(y, mo, day);
      const entry = S.entryForDate(date);
      const cell = document.createElement("button");
      cell.className = "cal-cell";
      if (entry) {
        if (!entry.symptoms.length) cell.classList.add("healthy");
        else cell.classList.add(entry.severity >= 6 ? "significant" : "mild");
      }
      if (sameDay(date, today)) cell.classList.add("today");
      if (sameDay(date, selectedDate)) cell.classList.add("selected");
      cell.innerHTML = `<span class="num">${day}</span><span class="dot ${entry ? "has" : ""}"></span>`;
      cell.addEventListener("click", () => { selectedDate = date; renderCalendar(); });
      grid.appendChild(cell);
    }

    renderCalDetail();
  }

  function renderCalDetail() {
    const box = $("#calDetail");
    const d = selectedDate;
    const entry = S.entryForDate(d);
    let html = `<p class="detail-date">${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>`;
    if (entry) {
      box.innerHTML = html + entryRowEl(entry).outerHTML;
    } else {
      html += `<div class="no-symptom"><svg class="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg> No symptoms logged for this day.</div>`;
      box.innerHTML = html;
    }
  }

  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  // ============================================================
  // PATTERNS
  // ============================================================
  function renderPatterns() {
    const pats = S.patterns();
    const confirmed = pats.filter((p) => !p.isEmerging).length;
    const daysCount = new Set(S.entries.map((e) => e.date.slice(0, 10))).size;
    $("#patternDaysCount").textContent = daysCount;
    $("#patternSummary").textContent = confirmed > 0
      ? `${confirmed} confirmed pattern${confirmed > 1 ? "s" : ""} detected. Patterns update as you log more.`
      : daysCount
        ? "Keep tracking and Pamet will show patterns when there is enough information."
        : "Your observations will appear after you start tracking your details.";

    // Free plan shows at most FREE_LIMITS.patterns; Pro is unlimited.
    const limit = S.patternLimit();
    const hiddenCount = pats.length - Math.min(pats.length, limit);
    const upgrade = $("#patternsUpgrade");
    if (hiddenCount > 0) {
      upgrade.hidden = false;
      upgrade.innerHTML = `
        <span class="uc-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg></span>
        <div class="uc-body"><p class="uc-title">${hiddenCount} more pattern${hiddenCount > 1 ? "s" : ""} available</p><p class="uc-sub">Upgrade to Pro for unlimited Pamet patterns.</p></div>
        <button class="uc-btn" id="patternsUpgradeBtn">Upgrade</button>`;
    } else {
      upgrade.hidden = true;
      upgrade.innerHTML = "";
    }

    const list = $("#patternList");
    list.innerHTML = "";
    if (!pats.length) {
      list.innerHTML = `<div class="home-empty-state compact"><div><h2>No observations yet</h2><p>Pamet needs a few entries before it can show meaningful patterns.</p></div></div>`;
    }
    pats.slice(0, limit).forEach((p) => {
      const c = PAT_COLORS[p.colorName] || PAT_COLORS.neutral;
      const card = document.createElement("div");
      card.className = "pattern-card" + (p.isEmerging ? " emerging" : "");
      const icon = p.isEmerging
        ? `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
        : `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>`;
      card.innerHTML = `
        <div class="pattern-head">
          <span class="pattern-icon" style="background:color-mix(in srgb, ${c} 16%, transparent);color:${c}">${icon}</span>
          <div><p class="pattern-title">${esc(p.title)}</p><p class="pattern-occ">${esc(p.occurrences)}</p></div>
        </div>
        <p class="pattern-detail">${esc(p.detail)}</p>
        <div class="conf-row"><span class="lbl">Confidence</span><span style="color:${c};font-weight:800">${Math.round(p.confidence * 100)}%</span></div>
        <div class="conf-bar"><span style="width:${Math.round(p.confidence * 100)}%;background:${c}"></span></div>`;
      list.appendChild(card);
    });
  }

  // ============================================================
  // REPORT
  // ============================================================
  function renderReport() {
    const r = S.report();
    const doc = $("#reportDoc");
    doc.innerHTML = `
      <div class="report-hero">
        <h1>Symptom report</h1>
        <p>${esc(r.rangeLabel)} · Generated by Pamet · For discussion with your care team</p>
      </div>
      <div class="report-body">
        ${reportSection("Overview", r.overview.map(rowHtml).join(""))}
        ${r.breakdown.length ? reportSection("Symptom breakdown", r.breakdown.map(rowHtml).join("")) : ""}
        ${r.patterns.length ? reportSection("Pamet observations (for physician review)", r.patterns.map((p) => {
          const c = PAT_COLORS[p.colorName] || PAT_COLORS.neutral;
          return `<div class="report-bullet"><span class="bullet" style="color:${c}">•</span><span>${esc(p.title)} (${Math.round(p.confidence*100)}% confidence): ${esc(p.detail)}</span></div>`;
        }).join("")) : ""}
        ${r.medications.length ? reportSection("Medications noted", r.medications.map(rowHtml).join("")) : ""}
      </div>`;
  }

  function rowHtml([k, v]) { return `<div class="report-row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`; }
  function reportSection(title, inner) { return `<div class="report-section"><h3>${esc(title)}</h3>${inner}</div>`; }

  // ---- Export: PDF via print, email via mailto, CSV/JSON download ----
  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const headers = ["profile","date","symptoms","severity","sleep_hours","stress","water_glasses","energy","mood","activity","medications","notes"];
    const lines = [headers.join(",")];
    S.exportAllData().profiles.forEach((profile) => {
      profile.entries.forEach((e) => {
        const row = [
          csv(profile.name), e.date.slice(0, 10), csv(e.symptoms.join("; ")),
          e.severity, e.sleepHours, e.stressLevel, e.waterGlasses, e.energyLevel,
          csv(e.mood), csv(e.activity), csv(e.medications.join("; ")), csv(e.notes)
        ];
        lines.push(row.join(","));
      });
    });
    download("pamet-export.csv", lines.join("\n"), "text/csv");
    toast("CSV exported");
  }

  function csv(v) {
    v = String(v ?? "");
    if (/^[=+\-@]/.test(v)) v = "'" + v;
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportJson() {
    download("pamet-export.json", JSON.stringify(S.exportAllData(), null, 2), "application/json");
    toast("JSON exported");
  }

  function emailReport() {
    const r = S.report();
    let body = `Pamet Symptom Report\n${r.rangeLabel}\n\n`;
    body += "OVERVIEW\n" + r.overview.map(([k, v]) => `• ${k}: ${v}`).join("\n") + "\n\n";
    if (r.breakdown.length) body += "SYMPTOM BREAKDOWN\n" + r.breakdown.map(([k, v]) => `• ${k}: ${v}`).join("\n") + "\n\n";
    if (r.patterns.length) body += "PAMET OBSERVATIONS\n" + r.patterns.map((p) => `• ${p.title} (${Math.round(p.confidence*100)}%): ${p.detail}`).join("\n") + "\n";
    body += "\nGenerated from information recorded by the user. This is not a medical diagnosis or clinical assessment.\n";
    const subject = encodeURIComponent(`Pamet symptom report — ${r.rangeLabel}`);
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  function downloadPdf() {
    const r = S.report();
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) { toast("Allow pop-ups to export PDF"); return; }
    w.opener = null;
    const rows = (arr) => arr.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right;font-weight:600">${esc(v)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>Pamet Report</title>
      <style>
        *{box-sizing:border-box} body{font-family:Georgia,serif;color:#2C2118;margin:0;padding:40px;max-width:760px}
        .hero{background:#C4673A;color:#fff;padding:24px;border-radius:10px;margin-bottom:24px}
        .hero h1{margin:0 0 6px;font-size:26px} .hero p{margin:0;opacity:.85;font-size:13px}
        h2{font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#8C7D6E;border-bottom:1px solid #EDE0D0;padding-bottom:6px;margin:24px 0 12px}
        table{width:100%;border-collapse:collapse;font-size:14px} td{padding:5px 0;vertical-align:top}
        .b{font-size:14px;margin:8px 0;line-height:1.5} .q{font-size:13px;color:#5C4F42;background:#FDF8F3;padding:10px;border-radius:8px;margin:8px 0}
      </style></head><body>
      <div class="hero"><h1>Symptom report</h1><p>${esc(r.rangeLabel)} · Generated by Pamet · For discussion with your care team</p></div>
      <h2>Overview</h2><table>${rows(r.overview)}</table>
      ${r.breakdown.length ? `<h2>Symptom breakdown</h2><table>${rows(r.breakdown)}</table>` : ""}
      ${r.patterns.length ? `<h2>Pamet observations</h2>` + r.patterns.map((p) => `<div class="b">• <strong>${esc(p.title)} (${Math.round(p.confidence*100)}%)</strong> — ${esc(p.detail)}</div>`).join("") : ""}
      ${r.medications.length ? `<h2>Medications noted</h2><table>${rows(r.medications)}</table>` : ""}
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
    toast("Print dialog opened — choose 'Save as PDF'");
  }

  // ============================================================
  // LOG SHEET
  // ============================================================
  const NO_SYMPTOMS = "__no_symptoms__";
  const logState = { symptoms: new Set(), severity: 4, sleepHours: 7, stressLevel: 5, waterGlasses: 6, energyLevel: 5, mood: "", activity: "", meds: new Set(), notes: "" };

  function openLog() {
    $("#logSuccess").hidden = true;
    $("#logFormError").hidden = true;
    $("#logBackdrop").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeLog() {
    $("#logBackdrop").classList.remove("open");
    document.body.style.overflow = "";
  }

  function buildLogForm() {
    // Symptoms (multi)
    const sg = $("#symptomGrid");
    sg.innerHTML = "";
    [[NO_SYMPTOMS, "No symptoms today"], ...S.allSymptoms().map((s) => [s, s])].forEach(([value, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sym-btn" + (logState.symptoms.has(value) ? " selected" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        if (value === NO_SYMPTOMS) {
          logState.symptoms.clear();
          logState.symptoms.add(NO_SYMPTOMS);
          $("#severityRange").value = 0;
          logState.severity = 0;
          $("#severityValue").textContent = "0/10";
        } else {
          logState.symptoms.delete(NO_SYMPTOMS);
          toggleSet(logState.symptoms, value);
        }
        buildLogForm();
        $("#logFormError").hidden = true;
      });
      sg.appendChild(b);
    });

    // Mood (single) — includes custom moods
    buildChipFlow($("#moodFlow"), S.allMoods(), (v, el) => { if (logState.mood === v) { logState.mood = ""; el.classList.remove("selected"); } else { $$("#moodFlow .chip").forEach((c) => c.classList.remove("selected")); logState.mood = v; el.classList.add("selected"); } });

    // Activity (single) — includes custom activities
    buildChipFlow($("#activityFlow"), S.allActivities(), (v, el) => { if (logState.activity === v) { logState.activity = ""; el.classList.remove("selected"); } else { $$("#activityFlow .chip").forEach((c) => c.classList.remove("selected")); logState.activity = v; el.classList.add("selected"); } });

    // Meds (multi) — includes custom meds
    buildChipFlow($("#medFlow"), S.allMeds(), (v, el) => { if (v === "None") { logState.meds.clear(); $$("#medFlow .chip").forEach((c) => c.classList.remove("selected")); el.classList.add("selected"); return; } toggleSet(logState.meds, v); el.classList.toggle("selected"); });

    // Sliders
    $("#severityRange").value = logState.severity;
    $("#severityValue").textContent = `${Math.round(logState.severity)}/10`;
    $$(".range[data-field]").forEach((r) => { r.value = logState[r.dataset.field]; updateSliderOut(r); });
    $("#notesInput").value = logState.notes;
  }

  function buildChipFlow(container, items, onPick) {
    container.innerHTML = "";
    items.forEach((v) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.textContent = v;
      c.addEventListener("click", () => onPick(v, c));
      container.appendChild(c);
    });
  }

  // Prompt for a new custom field in one of the four log categories.
  const CUSTOM_LABELS = { symptoms: "symptom", moods: "mood", activities: "activity", meds: "medication" };
  function addCustomField(category) {
    const label = CUSTOM_LABELS[category] || "field";
    const name = prompt(`Add a custom ${label}:`);
    if (!name) return;
    const v = name.trim();
    if (!v) return;
    const ok = S.addCustomField(category, v);
    if (ok) { buildLogForm(); toast(`Custom ${label} added`, "success"); }
    else if (!S.isPro() && S.customCount(category) >= S.FREE_LIMITS.customPerCategory) {
      toast(`Free plan allows ${S.FREE_LIMITS.customPerCategory} custom ${label}s — upgrade to Pro for unlimited`);
    } else {
      toast(`That ${label} already exists`);
    }
  }

  function removeCustomField(category) {
    const key = { symptoms: "customSymptoms", moods: "customMoods", activities: "customActivities", meds: "customMeds" }[category];
    const label = CUSTOM_LABELS[category] || "field";
    const items = (S.settings[key] || []).slice();
    if (!items.length) { toast(`No custom ${label}s to remove`); return; }
    let root = $("#removeFieldDialog");
    if (root) root.remove();
    root = document.createElement("div");
    root.id = "removeFieldDialog";
    root.className = "field-dialog-backdrop";
    root.innerHTML = `<section class="field-dialog" role="dialog" aria-modal="true" aria-labelledby="removeFieldTitle"><h3 id="removeFieldTitle">Remove a custom ${esc(label)}</h3><p>Choose the specific item you want to remove.</p><div class="field-remove-list">${items.map((item) => `<button type="button" data-remove-value="${esc(item)}">${esc(item)} <span aria-hidden="true">−</span></button>`).join("")}</div><button type="button" class="btn btn-ghost btn-block" data-cancel-remove>Cancel</button></section>`;
    document.body.appendChild(root);
    root.querySelector("[data-cancel-remove]").addEventListener("click", () => root.remove());
    root.addEventListener("click", (event) => { if (event.target === root) root.remove(); });
    root.querySelectorAll("[data-remove-value]").forEach((button) => button.addEventListener("click", () => {
      const value = button.dataset.removeValue;
      if (!confirm(`Remove “${value}” from your ${label} options?`)) return;
      S.removeCustomField(category, value); root.remove(); buildLogForm(); toast(`${value} removed`, "success");
    }));
    root.querySelector("[data-remove-value]").focus();
  }

  function toggleSet(set, v) { set.has(v) ? set.delete(v) : set.add(v); }

  function updateSliderOut(range) {
    const f = range.dataset.field;
    let out = range.value;
    if (f === "sleepHours") out += "h";
    else if (f === "waterGlasses") out += " glasses";
    else out += "/10";
    const label = range.closest(".slider-row").querySelector("[data-out]");
    if (label) label.textContent = out;
  }

  function resetLogForm() {
    logState.symptoms.clear();
    logState.severity = 4; logState.sleepHours = 7; logState.stressLevel = 5; logState.waterGlasses = 6; logState.energyLevel = 5;
    logState.mood = ""; logState.activity = ""; logState.meds.clear(); logState.notes = "";
    buildLogForm();
  }

  function saveEntry() {
    const error = $("#logFormError");
    const missing = [];
    if (!logState.symptoms.size) missing.push("how you feel");
    if (!logState.mood) missing.push("your mood");
    if (!logState.activity) missing.push("your activity");
    if (missing.length) {
      error.textContent = `Before saving, choose ${missing.join(", ")}.`;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const symptomFree = logState.symptoms.has(NO_SYMPTOMS);
    const entry = {
      date: new Date().toISOString(),
      symptoms: symptomFree ? [] : [...logState.symptoms],
      severity: symptomFree ? 0 : logState.severity,
      sleepHours: logState.sleepHours,
      stressLevel: logState.stressLevel,
      waterGlasses: logState.waterGlasses,
      energyLevel: logState.energyLevel,
      mood: logState.mood,
      activity: logState.activity,
      medications: [...logState.meds],
      notes: $("#notesInput").value.trim()
    };
    S.addEntry(entry);
    window.dispatchEvent(new CustomEvent("pamet:entry-saved", { detail: { entry } }));
    // success feedback
    const banner = $("#logSuccess");
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 3000);
    resetLogForm();
    refreshAll();
    setTimeout(closeLog, 900);
    toast("Entry saved — Pamet is updating your patterns.", "success");
  }

  // ============================================================
  // SETTINGS
  // ============================================================
  function renderSettings() {
    const s = S.settings;
    const u = A.getUser();

    // Profile (from the auth account)
    const first = displayName || (u && u.firstName) || s.userName || "";
    $("#userAvatar").textContent = (first || "A").trim().charAt(0).toUpperCase() || "A";
    $("#userNameInput").value = first;
    if (u) $("#settingsEmail").textContent = u.email || "";
    setTierBadge($("#settingsTier"), S.tier());

    // Toggles (incl. new v1.0.1 options)
    const map = { setDarkMode: "isDarkMode", setShowStreak: "showStreak", setShowInsight: "showInsight", setDailyReminder: "dailyReminder", setPatternAlerts: "patternAlerts", setStreakReminders: "streakReminders", setWeeklyDigest: "weeklyDigest", setAiPatterns: "aiPatterns", setCaregiver: "caregiverAccess", setPrimaryCare: "primaryCareAccess" };
    Object.entries(map).forEach(([id, key]) => { const el = $("#" + id); if (el) el.checked = !!s[key]; });

    // Custom symptoms
    const list = $("#customSymptomList");
    if (list) {
      list.innerHTML = "";
      (s.customSymptoms || []).forEach((sym) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${esc(sym)}</span>`;
        const rm = document.createElement("button");
        rm.className = "remove"; rm.textContent = "✕"; rm.title = "Remove";
        rm.addEventListener("click", () => { S.removeCustomField("symptoms", sym); renderSettings(); buildLogForm(); });
        li.appendChild(rm);
        list.appendChild(li);
      });
    }

    // Plan comparison + CTA
    renderPlan();
  }

  function renderPlan() {
    const box = $("#planCompare");
    if (!box) return;
    const current = S.plan().key;
    box.innerHTML = Object.values(S.PLANS).map((p) => `
      <div class="plan-card${p.key === current ? " active" : ""}">
        <div class="plan-card-head"><span class="plan-card-name">${esc(p.name)}</span><span class="plan-card-price">${esc(p.price)}${p.key === current ? " · Active" : ""}</span></div>
        <ul class="plan-features">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>`).join("");
    $("#planLineText").textContent = current === "pro" ? "Pro plan" : "Free plan";
    const cta = $("#upgradeBtn");
    if (cta) {
      if (current === "pro") { cta.textContent = "Pro active ✓"; cta.disabled = true; }
      else { cta.textContent = "Upgrade to Pro"; cta.disabled = false; }
    }
  }

  // ============================================================
  // THEME
  // ============================================================
  function applyTheme() {
    document.body.classList.toggle("dark", !!S.settings.isDarkMode);
  }

  // ============================================================
  // TOAST
  // ============================================================
  let toastTimer;
  function toast(msg, kind) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; $(".app-shell").appendChild(t); }
    t.textContent = msg;
    t.classList.toggle("success", kind === "success");
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ============================================================
  // REFRESH ALL
  // ============================================================
  function refreshAll() {
    renderDashboard();
    if (currentTab === "calendar") renderCalendar();
    if (currentTab === "patterns") renderPatterns();
    if (currentTab === "report") renderReport();
    if (currentTab === "settings") renderSettings();
  }

  // ============================================================
  // WIRE UP
  // ============================================================
  // ---- Auth gate: show welcome or the app ----
  function enterApp() {
    $("#welcome").classList.add("hidden");
    const u = A.getUser();
    displayName = (u && u.firstName) || "";
    if (displayName) S.setSetting("userName", displayName);
    applyTheme();
    renderDashboard();
  }
  function showWelcome() {
    $("#welcome").classList.remove("hidden");
    $("#registerForm").hidden = true;
    $("#loginForm").hidden = false;
    const create = $("#loginForm .welcome-switch"); if (create) create.hidden = false;
  }

  function init() {
    // Welcome / auth gate (v1.0.1)
    const secure = $("#welcomeSecure");
    if (secure) {
      if (A.isSecure) secure.textContent = "🔒 Your password is protected and stays on this device."
      else { secure.textContent = "⚠️ Pamet requires HTTPS and a browser with Web Crypto support."; secure.classList.add("warn"); }
    }

    // Toggle login / register forms
    $("#showRegister").addEventListener("click", (e) => { e.preventDefault(); $("#registerForm").reset(); $("#loginForm").hidden = true; $("#registerForm").hidden = false; });
    $("#showLogin").addEventListener("click", (e) => { e.preventDefault(); $("#registerForm").reset(); $("#registerForm").hidden = true; $("#loginForm").hidden = false; });

    const setFormError = (msg) => { let el = $(".form-error"); if (!el) { el = document.createElement("p"); el.className = "form-error"; el.setAttribute("role", "alert"); $("#loginForm").insertBefore(el, $("#loginForm button[type='submit']")); } el.textContent = msg === "No account found on this device." ? "We couldn’t find a Pamet account saved in this browser. Create an account to get started, or use the browser where you previously signed up." : (msg || ""); el.hidden = !el.textContent; };

    $("#registerForm").addEventListener("submit", async (e) => {
      e.preventDefault(); setFormError("");
      try {
        await A.register({ firstName: $("#regFirstName").value, lastName: $("#regLastName").value, email: $("#regEmail").value, password: $("#regPassword").value });
        enterApp(); toast("Account created ✓", "success");
      } catch (err) { setFormError(err.message); }
    });

    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault(); setFormError("");
      try {
        await A.login($("#loginEmail").value, $("#loginPassword").value);
        enterApp(); toast(`Welcome back ✓`);
      } catch (err) { setFormError(err.message); }
    });

    // Gate the app until authenticated.
    if (A.isAuthed()) enterApp(); else showWelcome();

    applyTheme();
    renderDashboard();
    $$(".tab[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === currentTab));

    // Tab bar
    $$(".tab[data-tab]").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
    $("#openLog").addEventListener("click", openLog);
    $("#emptyLogEntry").addEventListener("click", openLog);

    // in-content nav links (dashboard -> patterns/calendar)
    $$("[data-nav]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.nav)));

    // theme toggle
    $("#themeToggle").addEventListener("click", () => {
      S.setSetting("isDarkMode", !S.settings.isDarkMode);
      applyTheme();
    });

    // Log sheet
    $("#closeLog").addEventListener("click", closeLog);
    $("#logBackdrop").addEventListener("click", (e) => { if (e.target.id === "logBackdrop") closeLog(); });
    $("#saveEntry").addEventListener("click", saveEntry);
    $("#notesInput").addEventListener("input", (e) => { logState.notes = e.target.value; });

    // "+" custom-field buttons in the log sheet
    $("#addSymptomPlus").addEventListener("click", () => addCustomField("symptoms"));
    $("#addMoodPlus").addEventListener("click", () => addCustomField("moods"));
    $("#addActivityPlus").addEventListener("click", () => addCustomField("activities"));
    $("#addMedPlus").addEventListener("click", () => addCustomField("meds"));
    $("#removeSymptomMinus").addEventListener("click", () => removeCustomField("symptoms"));
    $("#removeMoodMinus").addEventListener("click", () => removeCustomField("moods"));
    $("#removeActivityMinus").addEventListener("click", () => removeCustomField("activities"));
    $("#removeMedMinus").addEventListener("click", () => removeCustomField("meds"));

    // Sliders
    $("#severityRange").addEventListener("input", (e) => { logState.severity = +e.target.value; $("#severityValue").textContent = `${Math.round(logState.severity)}/10`; });
    $$(".range[data-field]").forEach((r) => r.addEventListener("input", (e) => { logState[r.dataset.field] = +e.target.value; updateSliderOut(e.target); }));

    // Calendar nav
    $("#calPrev").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
    $("#calNext").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });

    // Report actions
    $("#emailReport").addEventListener("click", emailReport);
    $("#downloadPdf").addEventListener("click", downloadPdf);

    // Settings toggles (incl. new v1.0.1 options)
    const toggleMap = { setDarkMode: "isDarkMode", setShowStreak: "showStreak", setShowInsight: "showInsight", setDailyReminder: "dailyReminder", setPatternAlerts: "patternAlerts", setStreakReminders: "streakReminders", setWeeklyDigest: "weeklyDigest", setAiPatterns: "aiPatterns", setCaregiver: "caregiverAccess", setPrimaryCare: "primaryCareAccess" };
    Object.entries(toggleMap).forEach(([id, key]) => {
      const el = $("#" + id);
      if (el) el.addEventListener("change", (e) => {
        S.setSetting(key, e.target.checked);
        if (key === "isDarkMode") applyTheme();
        if (key === "showStreak" || key === "showInsight" || key === "aiPatterns") renderDashboard();
      });
    });

    // Name (syncs the account's first name)
    $("#userNameInput").addEventListener("input", (e) => {
      const v = e.target.value;
      displayName = v.trim();
      if (A.hasAccount()) A.updateProfile({ firstName: v });
      S.setSetting("userName", v);
      $("#userAvatar").textContent = (v || "A").trim().charAt(0).toUpperCase() || "A";
    });

    // Custom symptoms (settings)
    const addSymptomButton = $("#addSymptomBtn");
    const newSymptomInput = $("#newSymptomInput");
    if (addSymptomButton && newSymptomInput) {
      addSymptomButton.addEventListener("click", () => {
        const v = newSymptomInput.value.trim();
        if (v) {
          const ok = S.addCustomField("symptoms", v);
          newSymptomInput.value = "";
          renderSettings(); buildLogForm();
          toast(ok ? "Symptom added ✓" : `Free plan allows ${S.FREE_LIMITS.customPerCategory} custom symptoms`, ok ? "success" : undefined);
        }
      });
      newSymptomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addSymptomButton.click(); });
    }

    // Plan upgrade / downgrade
    // The billing layer owns this action. Client-side state must never grant an entitlement.
    $("#upgradeBtn").addEventListener("click", () => {});

    // Data + account actions
    $("#exportCsv").addEventListener("click", exportCsv);
    $("#exportJson").addEventListener("click", exportJson);
    $("#changePasswordBtn").addEventListener("click", async () => {
      const oldPw = prompt("Current password:"); if (oldPw === null) return;
      const newPw = prompt("New password (10+ characters): "); if (!newPw) return;
      if (newPw.length < 10) { toast("Password must be 10+ characters"); return; }
      try { await A.changePassword(oldPw, newPw); toast("Password changed ✓", "success"); } catch (err) { toast(err.message); }
    });
    $("#logoutBtn").addEventListener("click", () => { A.endSession(); showWelcome(); toast("Logged out"); });
    $("#deleteAccount").addEventListener("click", async () => {
      if (confirm("Delete your account and all Pamet data? This cannot be undone.")) {
        try {
          const credential = A.getBackendCredential && A.getBackendCredential();
          if (credential) {
            const response = await fetch("/api/account", { method: "DELETE", headers: credential.deviceKey ? { Authorization: `Bearer ${credential.deviceKey}` } : {} });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || "Account deletion could not be completed.");
          }
        } catch (e) {
          toast(e.message || "Account deletion could not be completed. Please try again.");
          return;
        }
        S.wipeAll(); A.deleteLocalAccount(); showWelcome(); toast("Account and local health data deleted");
      }
    });

    // Patterns-screen upgrade button (delegated)
    $("#patternList").parentElement && $("#patternsUpgrade").addEventListener("click", (e) => {
      if (e.target.id === "patternsUpgradeBtn") $("#upgradeBtn").click();
    });

    // Settings help tooltips (tap-friendly)
    wireHelp();
    document.addEventListener("click", (event) => { if (!event.target.closest(".help")) $$(".help.show").forEach((x) => { x.classList.remove("show"); x.setAttribute("aria-expanded", "false"); }); });

    // Build the log form once
    buildLogForm();

    // PWA shortcut: open the log sheet only after an authenticated launch.
    if (A.isAuthed() && new URLSearchParams(window.location.search).get("action") === "log") {
      setTimeout(openLog, 0);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();