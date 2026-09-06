/* Lightweight loader keeps chart rendering off the authenticated critical bundle until Patterns is opened. */
(function (global) {
  'use strict';

  if (global.PametInsightsChartingLoader) return;
  const ASSET_REVISION = '1695-chart4';
  let pending = null;
  let engine = null;
  let presentationPending = null;

  // The production chart engine now preserves one slot for every calendar day.
  // Keep the loading shell aligned with that contract so users never see stale
  // grouped-window metadata while the deferred bundle initializes.
  function bucketWidthFor() {
    return 1;
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

  function loadPresentation() {
    if (global.PametInsightsChartPresentation) return Promise.resolve();
    if (presentationPending) return presentationPending;
    presentationPending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `/assets/insights-chart-presentation.js?v=${ASSET_REVISION}`;
      script.async = true;
      script.addEventListener('load', () => global.PametInsightsChartPresentation ? resolve() : reject(new Error('Insights chart presentation did not initialize.')), { once:true });
      script.addEventListener('error', () => reject(new Error('Insights chart presentation could not be loaded.')), { once:true });
      document.head.appendChild(script);
    }).catch((error) => {
      presentationPending = null;
      throw error;
    });
    return presentationPending;
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
    if (engine && global.PametInsightsChartPresentation) return Promise.resolve(proxy);
    if (pending) return pending;
    pending = Promise.all([loadStyles(), loadPresentation(), loadScript()])
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
      if (engine && global.PametInsightsChartPresentation) {
        const presentation = global.PametInsightsChartPresentation;
        return presentation.improve(engine.render(presentation.normalize(options)), options);
      }
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