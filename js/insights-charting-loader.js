/* Lightweight loader keeps chart rendering off the authenticated critical bundle until Patterns is opened. */
(function (global) {
  'use strict';

  if (global.PametInsightsChartingLoader) return;
  const ASSET_REVISION = '1695-chart4';
  let pending = null;
  let engine = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  // The production chart engine preserves one slot for every calendar day.
  // Keep the loading shell aligned with that contract so users never see stale
  // grouped-window metadata while the deferred bundle initializes.
  function bucketWidthFor() {
    return 1;
  }

  function dayKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function symptomDaySummary(entries = [], requestedSymptom = 'all') {
    const available = new Set();
    entries.forEach((entry) => (Array.isArray(entry?.symptoms) ? entry.symptoms : []).forEach((symptom) => available.add(String(symptom))));
    const symptom = requestedSymptom !== 'all' && available.has(String(requestedSymptom)) ? String(requestedSymptom) : 'all';
    const loggedDays = new Set(entries.map((entry) => dayKey(entry?.date)).filter(Boolean)).size;
    const symptomDays = new Set(entries.filter((entry) => {
      const symptoms = Array.isArray(entry?.symptoms) ? entry.symptoms : [];
      return symptom === 'all' ? symptoms.length > 0 : symptoms.includes(symptom);
    }).map((entry) => dayKey(entry?.date)).filter(Boolean)).size;
    return { symptom, symptomDays, loggedDays };
  }

  function symptomDaysCard(entries, symptom) {
    const summary = symptomDaySummary(entries, symptom);
    const scope = summary.symptom === 'all' ? 'Any recorded symptom' : summary.symptom;
    const share = summary.loggedDays ? Math.round((summary.symptomDays / summary.loggedDays) * 100) : 0;
    return `<article class="basic-metric-card" data-basic-metric="symptom-days">
      <div class="basic-metric-card-head"><div><span>Symptom days</span><small>${escapeHtml(scope)}</small></div><strong>${summary.symptomDays}</strong></div>
      <div class="basic-sparkline basic-sparkline-empty" role="img" aria-label="Symptom day count only; no graph"><span>Count only · no graph</span></div>
      <div class="basic-metric-card-foot"><span class="basic-delta trend-flat"><b aria-hidden="true">•</b>${summary.symptomDays} of ${summary.loggedDays} logged days</span><span>${share}% of logged days included the selected symptom</span></div>
    </article>`;
  }

  function improveMarkup(markup, options = {}) {
    if (typeof markup !== 'string') return markup;
    let output = markup;

    // Frequency is intentionally not drawn as a daily line/bar. A 0/100 daily
    // series looks continuous but is really only a day count. Keep the useful
    // count in Basic and remove Frequency from Advanced chart measures.
    output = output.replace(
      /<article class="basic-metric-card" data-basic-metric="frequency">[\s\S]*?<\/article>/,
      symptomDaysCard(options.entries || [], options.symptom || 'all')
    );
    output = output.replace(
      /<button type="button" class="chart-metric-btn[^"]*" data-chart-metric="frequency"[^>]*>Frequency<\/button>/g,
      ''
    );
    output = output.replace(
      'A fast read across frequency, severity, sleep, stress, and hydration.',
      'A fast read across symptom-day count, severity, sleep, stress, and hydration.'
    );

    // Keep the typical-range label in the chart's reserved top margin rather
    // than inside the plotted data. The surfaced badge stays readable over
    // both line and bar views without covering recorded values.
    output = output.replace(
      /<text class="chart-reference-label" x="[^"]+" y="[^"]+">Typical range in this window<\/text>/g,
      '<rect class="chart-reference-label-bg" x="86" y="4" width="176" height="20" rx="10" fill="var(--surface,#fff)" stroke="var(--pamet-sage,#6F8F7D)" stroke-opacity=".78" aria-hidden="true"/><text class="chart-reference-label-prominent" x="95" y="18" fill="var(--text-primary,#243536)" font-size="10.5" font-weight="800">Typical range in this window</text>'
    );
    return output;
  }

  function normalizedOptions(options = {}) {
    return options.metric === 'frequency' ? { ...options, metric:'severity' } : options;
  }

  function loadingMarkup(options = {}) {
    const days = Number(options.days || 7);
    return `<section class="insights-chart-card insights-chart-loading"
      data-chart-mode-current="basic" data-chart-window="${days}"
      data-chart-bucket-days="${bucketWidthFor(days)}" data-chart-point-count="${days}" aria-busy="true">
      <div class="insights-chart-head">
        <div>
          <span class="pamet-eyebrow">Dynamic chart · ${days}-day window</span>
          <h3>Preparing your chart</h3>
          <p>Pamet is loading the daily chart view for the selected window.</p>
        </div>
      </div>
    </section>`;
  }

  function loadStyles() {
    const existing = document.querySelector('link[data-pamet-insights-charting]');
    if (existing?.dataset.loaded === 'true') return Promise.resolve();
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
      });
    }
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/dist/pamet.insights-charting.min.css?v=${ASSET_REVISION}`;
      link.dataset.pametInsightsCharting = 'true';
      link.addEventListener('load', () => {
        link.dataset.loaded = 'true';
        resolve();
      }, { once:true });
      link.addEventListener('error', () => reject(new Error('Insights chart styles could not be loaded.')), { once:true });
      document.head.appendChild(link);
    });
  }

  function loadScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `/dist/pamet.insights-charting.min.js?v=${ASSET_REVISION}`;
      script.async = true;
      script.addEventListener('load', () => {
        const loaded = global.PametInsightsCharts;
        if (!loaded || loaded === proxy || typeof loaded.render !== 'function') {
          reject(new Error('Insights charting did not initialize.'));
          return;
        }
        engine = loaded;
        global.PametInsightsCharts = proxy;
        resolve();
      }, { once:true });
      script.addEventListener('error', () => reject(new Error('Insights charting could not be loaded.')), { once:true });
      document.head.appendChild(script);
    });
  }

  function load() {
    if (engine) return Promise.resolve(proxy);
    if (pending) return pending;
    pending = Promise.all([loadStyles(), loadScript()])
      .then(() => {
        requestAnimationFrame(() => global.PametInsightsController?.render?.());
        return proxy;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
    return pending;
  }

  const proxy = Object.freeze({
    render(options) {
      if (engine) return improveMarkup(engine.render(normalizedOptions(options)), options);
      load().catch(() => {});
      return loadingMarkup(options);
    },
    bucketize(...args) {
      return engine?.bucketize?.(...args) || { width:bucketWidthFor(Number(args[1] || 7)), buckets:[] };
    },
    comparison(...args) {
      return engine?.comparison?.(...args) || { selectedDays:0, baselineDays:0, factors:[], sufficient:false };
    },
    metrics() {
      return (engine?.metrics?.() || ['frequency','severity','sleep','stress','hydration']).filter((metric) => metric !== 'frequency');
    },
    bucketWidthFor(days) {
      return engine?.bucketWidthFor?.(days) || bucketWidthFor(Number(days || 7));
    }
  });

  global.PametInsightsCharts = proxy;
  global.PametInsightsChartingLoader = Object.freeze({ load });
})(window);
