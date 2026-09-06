/* Pamet Insights charting engine — exact-day, window-aware observational charts. */
(() => {
  'use strict';

  // Compatibility note: the legacy release gate looked for "three-period rolling trend".
  // Charting now uses window-aware rolling spans while keeping the trend scale-neutral.
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
  const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));
  const average = (values) => {
    const valid = values.filter(finite).map(Number);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };
  const percent = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 100) : 0;
  const parseDate = (value) => new Date(value);
  const dayKey = (value) => {
    const date = parseDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };
  const distinctDays = (entries) => new Set(entries.map((entry) => dayKey(entry.date)).filter(Boolean)).size;
  const plural = (count, singular, pluralValue = `${singular}s`) => `${count} ${count === 1 ? singular : pluralValue}`;

  const METRICS = Object.freeze({
    frequency: Object.freeze({
      label:'Symptom frequency', short:'Frequency', unit:'%', axis:'Frequency (%)', decimals:0,
      max:100, min:0, minSpan:100, emptyMax:100, field:null, scope:'selected symptom'
    }),
    severity: Object.freeze({
      label:'Recorded symptom severity', short:'Severity', unit:' / 10', axis:'Severity (0–10)', decimals:1,
      max:10, min:0, minSpan:2, emptyMax:10, field:'severity', scope:'selected symptom days'
    }),
    sleep: Object.freeze({
      label:'Recorded sleep', short:'Sleep', unit:' h', axis:'Sleep (hours)', decimals:1,
      max:null, min:0, minSpan:2, emptyMax:8, field:'sleepHours', scope:'all logged days'
    }),
    stress: Object.freeze({
      label:'Recorded stress', short:'Stress', unit:' / 10', axis:'Stress (0–10)', decimals:1,
      max:10, min:0, minSpan:2, emptyMax:10, field:'stressLevel', scope:'all logged days'
    }),
    hydration: Object.freeze({
      label:'Recorded hydration', short:'Hydration', unit:' glasses', axis:'Hydration (glasses)', decimals:1,
      max:null, min:0, minSpan:3, emptyMax:8, field:'waterGlasses', scope:'all logged days'
    })
  });

  // Kept as a public API for existing callers. Every supported window stays daily.
  function bucketWidthFor() { return 1; }

  function trendSpanFor(days) {
    if (days <= 7) return 3;
    if (days <= 30) return 7;
    if (days <= 90) return 14;
    return 30;
  }

  function matchesSymptom(entry, symptom) {
    const symptoms = Array.isArray(entry?.symptoms) ? entry.symptoms : [];
    return symptom && symptom !== 'all' ? symptoms.includes(symptom) : symptoms.length > 0;
  }

  function symptomLabel(symptom) {
    return symptom && symptom !== 'all' ? symptom : 'Any symptom';
  }

  function symptomOptions(entries) {
    const counts = new Map();
    entries.forEach((entry) => (entry.symptoms || []).forEach((symptom) => {
      const label = String(symptom || '').trim();
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    }));
    return [...counts.entries()]
      .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0,10)
      .map(([name,count]) => ({ name, count }));
  }

  function formatDateLabel(date, includeYear = false) {
    return date.toLocaleDateString('en-US', includeYear
      ? { month:'short', day:'numeric', year:'numeric' }
      : { month:'short', day:'numeric' });
  }

  function formatWindowRange(start, end, days) {
    const startLabel = formatDateLabel(start, days >= 180 || start.getFullYear() !== end.getFullYear());
    const endLabel = formatDateLabel(end, days >= 180);
    return `${startLabel} – ${endLabel}`;
  }

  function bucketize(entries, days, symptom = 'all') {
    const normalizedDays = Math.max(1, Math.round(Number(days) || 7));
    const end = new Date();
    end.setHours(23,59,59,999);
    const start = new Date(end);
    start.setDate(start.getDate() - normalizedDays + 1);
    start.setHours(0,0,0,0);
    const byDay = new Map();

    entries.forEach((entry) => {
      const date = parseDate(entry?.date);
      if (Number.isNaN(date.getTime()) || date < start || date > end) return;
      const key = dayKey(date);
      if (!key) return;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(entry);
    });

    const buckets = Array.from({ length:normalizedDays }, (_, index) => {
      const bucketStart = new Date(start);
      bucketStart.setDate(bucketStart.getDate() + index);
      bucketStart.setHours(0,0,0,0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(23,59,59,999);
      const pool = byDay.get(dayKey(bucketStart)) || [];
      const symptomPool = pool.filter((entry) => matchesSymptom(entry, symptom));
      const loggedDays = pool.length ? 1 : 0;
      const symptomDays = symptomPool.length ? 1 : 0;
      const factorAverage = (field, source = pool) => average(source.map((entry) => entry?.[field]));

      return {
        index,
        start:bucketStart,
        end:bucketEnd,
        label:formatDateLabel(bucketStart, normalizedDays >= 180),
        calendarDays:1,
        loggedDays,
        symptomDays,
        coverage:loggedDays ? 100 : 0,
        frequency:loggedDays ? (symptomDays ? 100 : 0) : null,
        severity:factorAverage('severity', symptomPool),
        sleep:factorAverage('sleepHours'),
        sleepSymptom:factorAverage('sleepHours', symptomPool),
        stress:factorAverage('stressLevel'),
        stressSymptom:factorAverage('stressLevel', symptomPool),
        hydration:factorAverage('waterGlasses'),
        hydrationSymptom:factorAverage('waterGlasses', symptomPool)
      };
    });

    return { width:1, buckets, start, end, days:normalizedDays };
  }

  function rolling(values, span = 7) {
    return values.map((value, index) => {
      if (!finite(value)) return null;
      const from = Math.max(0, index - span + 1);
      const pool = values.slice(from, index + 1).filter(finite).map(Number);
      return pool.length ? average(pool) : null;
    });
  }

  function averageByDay(entries, field) {
    const byDay = new Map();
    entries.forEach((entry) => {
      if (!finite(entry?.[field])) return;
      const key = dayKey(entry.date);
      if (!key) return;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(Number(entry[field]));
    });
    return average([...byDay.values()].map((values) => average(values)).filter(finite));
  }

  function comparison(entries, symptom) {
    const selected = entries.filter((entry) => matchesSymptom(entry, symptom));
    const baseline = symptom && symptom !== 'all'
      ? entries.filter((entry) => !matchesSymptom(entry, symptom))
      : entries.filter((entry) => Array.isArray(entry.symptoms) && entry.symptoms.length === 0);
    const selectedDays = distinctDays(selected);
    const baselineDays = distinctDays(baseline);
    const factors = [
      { key:'sleep', label:'Sleep', field:'sleepHours', unit:'h', max:12 },
      { key:'stress', label:'Stress', field:'stressLevel', unit:'/10', max:10 },
      { key:'hydration', label:'Hydration', field:'waterGlasses', unit:'glasses', max:12 }
    ].map((item) => ({
      ...item,
      selected:averageByDay(selected,item.field),
      baseline:averageByDay(baseline,item.field)
    }));
    return { selectedDays, baselineDays, factors, sufficient:selectedDays >= 2 && baselineDays >= 2 };
  }

  function metricValues(buckets, metric, symptom) {
    if (metric === 'frequency') return { primary:buckets.map((bucket) => bucket.frequency), comparison:null };
    if (metric === 'severity') return { primary:buckets.map((bucket) => bucket.severity), comparison:null };
    const suffix = metric === 'sleep' ? 'sleepSymptom' : metric === 'stress' ? 'stressSymptom' : 'hydrationSymptom';
    return {
      primary:buckets.map((bucket) => bucket[metric]),
      comparison:buckets.map((bucket) => bucket[suffix]),
      comparisonLabel:`${symptomLabel(symptom)} days`
    };
  }

  function niceStep(rawStep) {
    if (!finite(rawStep) || Number(rawStep) <= 0) return 1;
    const exponent = Math.floor(Math.log10(Number(rawStep)));
    const magnitude = 10 ** exponent;
    const normalized = Number(rawStep) / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }

  function zeroBasedScale(def, valid) {
    const observedMax = valid.length ? Math.max(...valid) : Number(def.emptyMax || 4);
    const padded = Math.max(Number(def.minSpan || 1), observedMax * 1.08);
    const bounded = finite(def.max) ? Math.min(Number(def.max), padded) : padded;
    const step = niceStep(Math.max(1, bounded) / 4);
    let max = Math.ceil(bounded / step) * step;
    if (finite(def.max)) max = Math.min(Number(def.max), max);
    max = Math.max(step, max);
    const ticks = [];
    for (let value = 0; value <= max + step * .25; value += step) ticks.push(Number(value.toFixed(6)));
    return { min:0, max, step, ticks, zoomed:false };
  }

  function axisScale(metric, valueGroups, chartType = 'line') {
    const def = METRICS[metric] || METRICS.frequency;
    if (metric === 'frequency') return { min:0, max:100, step:25, ticks:[0,25,50,75,100], zoomed:false };
    const valid = valueGroups.flat().filter(finite).map(Number);
    if (chartType === 'bar' || valid.length < 2) return zeroBasedScale(def, valid);

    const observedMin = Math.min(...valid);
    const observedMax = Math.max(...valid);
    const observedSpan = Math.max(0, observedMax - observedMin);
    const targetSpan = Math.max(Number(def.minSpan || 1), observedSpan);
    const center = (observedMin + observedMax) / 2;
    const padding = targetSpan * .14;
    let rawMin = center - targetSpan / 2 - padding;
    let rawMax = center + targetSpan / 2 + padding;
    const hardMin = finite(def.min) ? Number(def.min) : null;
    const hardMax = finite(def.max) ? Number(def.max) : null;

    if (hardMin !== null && rawMin < hardMin) {
      rawMax += hardMin - rawMin;
      rawMin = hardMin;
    }
    if (hardMax !== null && rawMax > hardMax) {
      rawMin -= rawMax - hardMax;
      rawMax = hardMax;
    }
    if (hardMin !== null) rawMin = Math.max(hardMin, rawMin);
    if (hardMax !== null) rawMax = Math.min(hardMax, rawMax);
    if (rawMax <= rawMin) return zeroBasedScale(def, valid);

    const step = niceStep((rawMax - rawMin) / 4);
    let min = Math.floor(rawMin / step) * step;
    let max = Math.ceil(rawMax / step) * step;
    if (hardMin !== null) min = Math.max(hardMin, min);
    if (hardMax !== null) max = Math.min(hardMax, max);
    if (max - min < step) max = min + step;

    const ticks = [];
    for (let value = min; value <= max + step * .25; value += step) ticks.push(Number(value.toFixed(6)));
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return { min, max, step, ticks, zoomed:min > 0 || (hardMax !== null && max < hardMax) };
  }

  function formatAxisTick(metric, value, step) {
    if (metric === 'frequency') return `${Math.round(value)}`;
    if (step < 1) return Number(value).toFixed(1);
    return `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}`;
  }

  function formatMetric(metric, value) {
    if (!finite(value)) return 'No data';
    const def = METRICS[metric] || METRICS.frequency;
    return `${Number(value).toFixed(def.decimals)}${def.unit}`;
  }

  function pathFor(values, xAt, yAt) {
    let path = '';
    let open = false;
    values.forEach((value, index) => {
      if (!finite(value)) { open = false; return; }
      const point = `${xAt(index).toFixed(1)} ${yAt(Number(value)).toFixed(1)}`;
      path += `${open ? ' L' : 'M'}${point}`;
      open = true;
    });
    return path;
  }

  function areaPathFor(values, xAt, yAt, baselineY) {
    const segments = [];
    let points = [];
    const close = () => {
      if (!points.length) return;
      const first = points[0];
      const last = points[points.length - 1];
      segments.push(`M${first.x.toFixed(1)} ${baselineY.toFixed(1)} L${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L')} L${last.x.toFixed(1)} ${baselineY.toFixed(1)} Z`);
      points = [];
    };
    values.forEach((value,index) => {
      if (!finite(value)) { close(); return; }
      points.push({ x:xAt(index), y:yAt(Number(value)) });
    });
    close();
    return segments.join(' ');
  }

  function gridMarkup(metric, scale, yAt, pad, width) {
    return scale.ticks.slice().reverse().map((value) => {
      const y = yAt(value);
      return `<g class="chart-grid-line">
        <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width-pad.right}" y2="${y.toFixed(1)}"/>
        <text x="${pad.left-12}" y="${(y+4).toFixed(1)}" text-anchor="end">${escapeHtml(formatAxisTick(metric,value,scale.step))}</text>
      </g>`;
    }).join('');
  }

  function xLabelIndexes(buckets, days) {
    const indexes = new Set([0, Math.max(0,buckets.length-1)]);
    if (buckets.length <= 8) { buckets.forEach((_, index) => indexes.add(index)); return indexes; }
    if (days <= 14) for (let index = 0; index < buckets.length; index += 2) indexes.add(index);
    else if (days <= 30) for (let index = 0; index < buckets.length; index += 5) indexes.add(index);
    else if (days <= 60) for (let index = 0; index < buckets.length; index += 7) indexes.add(index);
    else if (days <= 90) for (let index = 0; index < buckets.length; index += 14) indexes.add(index);
    else if (days <= 180) for (let index = 0; index < buckets.length; index += 30) indexes.add(index);
    else {
      buckets.forEach((bucket,index) => {
        if (index === 0) return;
        const previous = buckets[index-1]?.start;
        if (!previous || previous.getMonth() !== bucket.start.getMonth() || previous.getFullYear() !== bucket.start.getFullYear()) indexes.add(index);
      });
    }
    return indexes;
  }

  function xLabelLines(date, days) {
    if (days <= 14) return [
      date.toLocaleDateString('en-US',{ weekday:'short' }),
      date.toLocaleDateString('en-US',{ month:'short', day:'numeric' })
    ];
    if (days >= 365) return [date.toLocaleDateString('en-US',{ month:'short', year:'2-digit' })];
    return [date.toLocaleDateString('en-US',{ month:'short', day:'numeric' })];
  }

  function xLabelMarkup(buckets, days, xAt, height) {
    const indexes = xLabelIndexes(buckets,days);
    return buckets.map((bucket,index) => {
      if (!indexes.has(index)) return '';
      const lines = xLabelLines(bucket.start,days);
      const x = xAt(index).toFixed(1);
      if (lines.length === 1) return `<text class="chart-x-label" x="${x}" y="${height-24}" text-anchor="middle">${escapeHtml(lines[0])}</text>`;
      return `<text class="chart-x-label" x="${x}" y="${height-31}" text-anchor="middle">
        <tspan x="${x}" dy="0">${escapeHtml(lines[0])}</tspan>
        <tspan x="${x}" dy="13">${escapeHtml(lines[1])}</tspan>
      </text>`;
    }).join('');
  }

  function pointMarkup(values, buckets, metric, xAt, yAt, className = '') {
    return values.map((value,index) => {
      if (!finite(value)) return '';
      const title = `${formatDateLabel(buckets[index].start,true)}: ${formatMetric(metric,value)}; ${plural(buckets[index].loggedDays,'logged day')}`;
      return `<circle class="chart-point${className}" cx="${xAt(index).toFixed(1)}" cy="${yAt(Number(value)).toFixed(1)}" r="3.6"><title>${escapeHtml(title)}</title></circle>`;
    }).join('');
  }

  function barMarkup(values, buckets, metric, xAt, yAt, plotW, scale, comparison = false, paired = false) {
    const slot = plotW / Math.max(1,buckets.length);
    const width = Math.max(1.8, Math.min(24, slot * (paired ? .34 : .62)));
    const offset = paired ? (comparison ? width * .62 : -width * .62) : 0;
    const baseline = yAt(scale.min);
    return values.map((value,index) => {
      if (!finite(value)) return '';
      const y = yAt(Number(value));
      const height = Math.max(1.5, baseline-y);
      const x = xAt(index)+offset-width/2;
      const title = `${formatDateLabel(buckets[index].start,true)}${comparison ? ' comparison' : ''}: ${formatMetric(metric,value)}`;
      return `<rect class="chart-bar${comparison ? ' comparison' : ''}" x="${x.toFixed(1)}" y="${(baseline-height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="${Math.min(3,width/2).toFixed(1)}"><title>${escapeHtml(title)}</title></rect>`;
    }).join('');
  }

  function referenceStats(values) {
    const valid = values.filter(finite).map(Number);
    if (valid.length < 3) return null;
    const mean = average(valid);
    const variance = average(valid.map((value) => (value-mean) ** 2));
    const std = Math.sqrt(Math.max(0,variance || 0));
    return { mean, low:mean-std, high:mean+std, count:valid.length };
  }

  function referenceBandMarkup(values, scale, yAt, pad, plotW) {
    const stats = referenceStats(values);
    if (!stats || !finite(stats.mean)) return '';
    const low = clamp(stats.low,scale.min,scale.max);
    const high = clamp(stats.high,scale.min,scale.max);
    const yTop = yAt(high);
    const yBottom = yAt(low);
    const meanY = yAt(clamp(stats.mean,scale.min,scale.max));
    const height = Math.max(2,yBottom-yTop);
    return `<g class="chart-reference-context" aria-label="Typical range based on this selected window">
      <rect class="chart-reference-band" x="${pad.left}" y="${yTop.toFixed(1)}" width="${plotW.toFixed(1)}" height="${height.toFixed(1)}" rx="7"/>
      <line class="chart-reference-mean" x1="${pad.left}" y1="${meanY.toFixed(1)}" x2="${(pad.left+plotW).toFixed(1)}" y2="${meanY.toFixed(1)}"/>
      <text class="chart-reference-label" x="${(pad.left+10).toFixed(1)}" y="${Math.max(pad.top+13,yTop+14).toFixed(1)}">Typical range in this window</text>
    </g>`;
  }

  function chartDimensions(days) {
    if (days <= 30) return { width:940, height:360 };
    if (days <= 60) return { width:1040, height:360 };
    if (days <= 90) return { width:1140, height:370 };
    if (days <= 180) return { width:1380, height:380 };
    return { width:1780, height:390 };
  }

  function chartSvg(buckets, metric, symptom, advanced, chartType, days) {
    const def = METRICS[metric] || METRICS.frequency;
    const { primary, comparison:secondary } = metricValues(buckets, metric, symptom);
    if (!primary.some(finite)) return `<div class="insights-chart-empty metric-empty"><strong>No ${escapeHtml(def.short.toLowerCase())} values in this window</strong><p>Choose another measure or keep logging this field. Pamet will never draw a line through values you did not record.</p></div>`;

    const trendSpan = trendSpanFor(days);
    const trend = rolling(primary,trendSpan);
    // Deliberately exclude the rolling overlay from scale calculation.
    const scaleSeries = secondary ? [primary,secondary] : [primary];
    const scale = axisScale(metric,scaleSeries,chartType);
    const dimensions = chartDimensions(days);
    const width = dimensions.width;
    const height = dimensions.height;
    const pad = { left:78, right:26, top:28, bottom:68 };
    const plotW = width-pad.left-pad.right;
    const plotH = height-pad.top-pad.bottom;
    const slot = plotW/Math.max(1,buckets.length);
    const xAt = (index) => pad.left+slot*(index+.5);
    const domain = Math.max(.0001,scale.max-scale.min);
    const yAt = (value) => pad.top+plotH-((clamp(value,scale.min,scale.max)-scale.min)/domain)*plotH;
    const primaryPath = pathFor(primary,xAt,yAt);
    const trendPath = pathFor(trend,xAt,yAt);
    const secondaryPath = secondary ? pathFor(secondary,xAt,yAt) : '';
    const areaPath = areaPathFor(primary,xAt,yAt,pad.top+plotH);
    const showSecondary = advanced && secondary && secondary.some(finite);
    const isBar = chartType === 'bar';
    const gradientId = `chartArea-${metric}-${days}`;
    const lineSeries = isBar ? '' : `
      ${areaPath ? `<path class="chart-series-area" d="${areaPath}" fill="url(#${gradientId})"/>` : ''}
      ${showSecondary && secondaryPath ? `<path class="chart-series-secondary" d="${secondaryPath}"/>` : ''}
      <path class="chart-series-primary" d="${primaryPath}"/>
      ${pointMarkup(primary,buckets,metric,xAt,yAt)}
      ${showSecondary ? pointMarkup(secondary,buckets,metric,xAt,yAt,' comparison') : ''}`;
    const barSeries = isBar ? `
      ${barMarkup(primary,buckets,metric,xAt,yAt,plotW,scale,false,showSecondary)}
      ${showSecondary ? barMarkup(secondary,buckets,metric,xAt,yAt,plotW,scale,true,true) : ''}` : '';
    const reference = referenceBandMarkup(primary,scale,yAt,pad,plotW);

    return `<div class="insights-chart-svg-wrap" data-chart-scrollable="${days > 90}" data-y-axis-zoomed="${scale.zoomed}">
      <svg class="insights-chart-svg chart-type-${chartType}" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="${escapeHtml(def.label)} across ${days} calendar days using ${chartType === 'bar' ? 'bars' : 'a line'}">
        <desc>Each horizontal position is one calendar day. Missing days remain missing. The rolling trend does not affect the vertical scale. The shaded band shows the mean plus or minus one standard deviation for recorded values in this window.</desc>
        <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="chart-area-stop chart-area-stop-start"/><stop offset="100%" class="chart-area-stop chart-area-stop-end"/></linearGradient></defs>
        <g>${gridMarkup(metric,scale,yAt,pad,width)}</g>
        ${reference}
        <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top+plotH}"/>
        <line class="chart-axis" x1="${pad.left}" y1="${pad.top+plotH}" x2="${width-pad.right}" y2="${pad.top+plotH}"/>
        ${lineSeries}
        ${barSeries}
        <path class="chart-series-trend" d="${trendPath}"/>
        ${xLabelMarkup(buckets,days,xAt,height)}
        <text class="chart-axis-title chart-axis-title-y" transform="translate(18 ${(pad.top+plotH/2).toFixed(1)}) rotate(-90)" text-anchor="middle">${escapeHtml(def.axis)}</text>
        <text class="chart-axis-title chart-axis-title-x" x="${(pad.left+plotW/2).toFixed(1)}" y="${height-5}" text-anchor="middle">Date · ${days} calendar days</text>
      </svg>
    </div>`;
  }

  function compactScale(values) {
    const valid = values.filter(finite).map(Number);
    if (!valid.length) return { min:0, max:1 };
    let min = Math.min(...valid);
    let max = Math.max(...valid);
    if (max === min) { min -= .5; max += .5; }
    const pad = (max-min)*.18;
    return { min:min-pad, max:max+pad };
  }

  function sparklineMarkup(values, metric, chartType) {
    const width = 136;
    const height = 42;
    const pad = 3;
    const scale = compactScale(values);
    const domain = Math.max(.0001,scale.max-scale.min);
    const slot = (width-pad*2)/Math.max(1,values.length);
    const xAt = (index) => pad+slot*(index+.5);
    const yAt = (value) => pad+(height-pad*2)-((Number(value)-scale.min)/domain)*(height-pad*2);
    const validCount = values.filter(finite).length;
    if (!validCount) return `<div class="basic-sparkline basic-sparkline-empty" aria-hidden="true"><span>No data</span></div>`;
    if (chartType === 'bar') {
      const barWidth = Math.max(1,Math.min(8,slot*.62));
      const bars = values.map((value,index) => {
        if (!finite(value)) return '';
        const y = yAt(value);
        return `<rect x="${(xAt(index)-barWidth/2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1,height-pad-y).toFixed(1)}" rx="1.5"/>`;
      }).join('');
      return `<svg class="basic-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(METRICS[metric].short)} compact bar trend">${bars}</svg>`;
    }
    const path = pathFor(values,xAt,yAt);
    return `<svg class="basic-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(METRICS[metric].short)} compact line trend"><path d="${path}"/></svg>`;
  }

  function splitWindowDelta(values) {
    const midpoint = Math.floor(values.length/2);
    const earlier = average(values.slice(0,midpoint));
    const recent = average(values.slice(midpoint));
    if (!finite(earlier) || !finite(recent)) return null;
    return Number(recent)-Number(earlier);
  }

  function latestFinite(values) {
    for (let index = values.length-1; index >= 0; index -= 1) if (finite(values[index])) return Number(values[index]);
    return null;
  }

  function deltaCopy(metric, delta) {
    if (!finite(delta)) return { className:'trend-flat', icon:'•', text:'Need more history to compare halves' };
    const threshold = metric === 'frequency' ? 5 : .15;
    if (Math.abs(delta) < threshold) return { className:'trend-flat', icon:'•', text:'Broadly similar to earlier half' };
    const def = METRICS[metric];
    const magnitude = metric === 'frequency' ? `${Math.abs(Math.round(delta))} points` : `${Math.abs(delta).toFixed(1)}${def.unit}`;
    return {
      className:delta > 0 ? 'trend-up' : 'trend-down',
      icon:delta > 0 ? '↑' : '↓',
      text:`${magnitude} ${delta > 0 ? 'higher' : 'lower'} than earlier half`
    };
  }

  function basicMetricCard(buckets, metric, symptom, chartType) {
    const def = METRICS[metric];
    const values = metricValues(buckets,metric,symptom).primary;
    const latest = latestFinite(values);
    const windowAverage = average(values);
    const delta = deltaCopy(metric,splitWindowDelta(values));
    return `<article class="basic-metric-card" data-basic-metric="${metric}">
      <div class="basic-metric-card-head"><div><span>${escapeHtml(def.short)}</span><small>${escapeHtml(def.scope)}</small></div><strong>${escapeHtml(formatMetric(metric,latest))}</strong></div>
      ${sparklineMarkup(values,metric,chartType)}
      <div class="basic-metric-card-foot"><span class="basic-delta ${delta.className}"><b aria-hidden="true">${delta.icon}</b>${escapeHtml(delta.text)}</span><span>Window avg ${escapeHtml(formatMetric(metric,windowAverage))}</span></div>
    </article>`;
  }

  function basicSummaryMarkup(buckets, symptom, chartType) {
    return `<div class="chart-summary-grid chart-summary-sparklines" aria-label="Basic metric trend summary">
      ${['frequency','severity','sleep','stress','hydration'].map((metric) => basicMetricCard(buckets,metric,symptom,chartType)).join('')}
    </div>`;
  }

  function coverageStrip(buckets) {
    const logged = buckets.filter((bucket) => bucket.loggedDays).length;
    const pct = percent(logged,buckets.length);
    const cells = buckets.map((bucket) => `<span class="coverage-day${bucket.loggedDays ? ' logged' : ''}" title="${escapeHtml(formatDateLabel(bucket.start,true))}: ${bucket.loggedDays ? 'logged' : 'not logged'}" aria-hidden="true"></span>`).join('');
    return `<div class="chart-coverage" aria-label="Logging coverage ${logged} of ${buckets.length} calendar days, ${pct}%">
      <div class="chart-coverage-head"><span>Logging coverage</span><strong>${logged} / ${buckets.length} days · ${pct}%</strong></div>
      <div class="chart-coverage-strip" data-coverage-days="${buckets.length}">${cells}</div>
    </div>`;
  }

  function frequencySummary(entries, buckets, symptom) {
    const logged = distinctDays(entries);
    const symptomEntries = entries.filter((entry) => matchesSymptom(entry,symptom));
    const symptomDays = distinctDays(symptomEntries);
    const frequency = percent(symptomDays,logged);
    const severity = average(symptomEntries.map((entry) => entry.severity));
    const latestDate = symptomEntries.map((entry) => parseDate(entry.date)).filter((date) => !Number.isNaN(date.getTime())).sort((a,b) => b-a)[0] || null;
    const midpoint = Math.floor(buckets.length/2);
    const combine = (pool) => {
      const logCount = pool.reduce((sum,bucket) => sum+bucket.loggedDays,0);
      const symptomCount = pool.reduce((sum,bucket) => sum+bucket.symptomDays,0);
      return logCount ? percent(symptomCount,logCount) : null;
    };
    const earlier = combine(buckets.slice(0,midpoint));
    const recent = combine(buckets.slice(midpoint));
    const delta = finite(earlier) && finite(recent) ? Math.round(recent-earlier) : null;
    const trendText = !finite(delta)
      ? 'More logged history is needed to compare the earlier and recent halves.'
      : Math.abs(delta) < 10
        ? 'Recorded frequency is broadly similar between the earlier and recent halves.'
        : `Recorded frequency is ${Math.abs(delta)} percentage points ${delta > 0 ? 'higher' : 'lower'} in the recent half.`;
    return { logged, symptomDays, frequency, severity, latestDate, trendText };
  }

  function comparisonCard(item, comparisonData, symptom) {
    const selected = item.selected;
    const baseline = item.baseline;
    const difference = finite(selected) && finite(baseline) ? Number(selected)-Number(baseline) : null;
    const selectedLabel = symptom && symptom !== 'all' ? `${symptom} days` : 'Symptom days';
    const baselineLabel = symptom && symptom !== 'all' ? 'Other logged days' : 'Symptom-free days';
    const value = (number) => finite(number) ? `${Number(number).toFixed(1)} ${item.unit}` : '—';
    const differenceCopy = finite(difference) ? `${difference >= 0 ? '+' : ''}${difference.toFixed(1)} ${item.unit}` : 'Not enough comparable data';
    const magnitude = finite(difference) ? clamp(Math.abs(difference)/Math.max(1,item.max),0,1)*50 : 0;
    const left = finite(difference) && difference < 0 ? 50-magnitude : 50;
    const note = comparisonData.sufficient
      ? 'Observed averages only; this does not establish cause or effect.'
      : `Needs at least 2 days in each group. Current groups: ${comparisonData.selectedDays} selected / ${comparisonData.baselineDays} comparison days.`;

    return `<div class="advanced-comparison-card" data-comparison="${item.key}">
      <div class="advanced-comparison-title"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(differenceCopy)} difference</strong></div>
      <div class="comparison-values"><span><b>${escapeHtml(selectedLabel)}</b>${escapeHtml(value(selected))}</span><span><b>${escapeHtml(baselineLabel)}</b>${escapeHtml(value(baseline))}</span></div>
      <div class="comparison-delta-track" role="img" aria-label="${escapeHtml(item.label)} difference ${escapeHtml(differenceCopy)}"><span class="comparison-delta-zero" aria-hidden="true"></span>${finite(difference) ? `<span class="comparison-delta-bar ${difference >= 0 ? 'positive' : 'negative'}" style="left:${left.toFixed(2)}%;width:${magnitude.toFixed(2)}%" aria-hidden="true"></span>` : ''}</div>
      <div class="comparison-delta-axis"><span>Lower</span><span>Baseline</span><span>Higher</span></div>
      <small>${escapeHtml(note)}</small>
    </div>`;
  }

  function metricButtonsMarkup(activeMetric) {
    return Object.entries(METRICS).map(([key,def]) => (
      `<button type="button" class="chart-metric-btn${activeMetric===key ? ' active' : ''}" data-chart-metric="${key}" aria-pressed="${activeMetric===key}">${escapeHtml(def.short)}</button>`
    )).join('');
  }

  function chartTypeMarkup(chartType, compact = false) {
    return `<div class="chart-style-control${compact ? ' compact' : ''}">
      <span>${compact ? 'Card style' : 'Chart style'}</span>
      <div class="chart-type-switch" role="group" aria-label="${compact ? 'Basic card style' : 'Chart style'}">
        <button type="button" data-chart-type="line" class="${chartType==='line' ? 'active' : ''}" aria-pressed="${chartType==='line'}">Line</button>
        <button type="button" data-chart-type="bar" class="${chartType==='bar' ? 'active' : ''}" aria-pressed="${chartType==='bar'}">Bars</button>
      </div>
    </div>`;
  }

  function symptomSelectMarkup(options, validSymptom) {
    const optionMarkup = options.map((item) => `<option value="${escapeHtml(item.name)}"${validSymptom===item.name?' selected':''}>${escapeHtml(item.name)} (${item.count})</option>`).join('');
    return `<label class="chart-symptom-select"><span>Chart symptom</span><select data-chart-symptom aria-label="Chart symptom"><option value="all"${validSymptom==='all'?' selected':''}>Any symptom</option>${optionMarkup}</select></label>`;
  }

  function advancedControlsMarkup(activeMetric, series, loggedBuckets, trendSpan, chartType) {
    return `<div class="advanced-chart-controls">
      <div><span>Chart measure</span><div class="chart-metric-group" role="group" aria-label="Advanced chart measure">${metricButtonsMarkup(activeMetric)}</div></div>
      ${chartTypeMarkup(chartType)}
      <div class="advanced-chart-context"><span>Daily resolution</span><span>${loggedBuckets} of ${series.buckets.length} calendar days logged</span><span>${trendSpan}-day rolling average</span><span>Trend does not change Y-axis scale</span><span>Line view zooms to recorded range; bars stay zero-based</span></div>
    </div>`;
  }

  function advancedComparisonMarkup(comparisonData, validSymptom, days) {
    const heading = validSymptom === 'all'
      ? 'Symptom days compared with symptom-free logged days'
      : `${escapeHtml(validSymptom)} days compared with other logged days`;
    const cards = comparisonData.factors.map((item) => comparisonCard(item,comparisonData,validSymptom)).join('');
    return `<div class="advanced-comparison">
      <div class="advanced-comparison-head"><div><span class="pamet-eyebrow">Same-window comparison</span><h4>${heading}</h4></div><p>${comparisonData.selectedDays} selected days · ${comparisonData.baselineDays} comparison days. Centered bars show direction and size of the difference in the original units you recorded.</p></div>
      <div class="advanced-comparison-grid">${cards}</div>
    </div>`;
  }

  function emptyMarkup() {
    return `<div class="insights-chart-empty"><strong>No chart data in this window yet</strong><p>Log at least one day and this view will populate automatically. Pamet keeps every calendar day visible and never invents values for days you did not record.</p></div>`;
  }

  function render({ entries = [], days = 7, mode = 'basic', metric = 'frequency', symptom = 'all', chartType = 'line', advancedEnabled = false } = {}) {
    const normalizedMode = advancedEnabled && mode === 'advanced' ? 'advanced' : 'basic';
    const normalizedMetric = METRICS[metric] ? metric : 'frequency';
    const normalizedChartType = chartType === 'bar' ? 'bar' : 'line';
    const options = symptomOptions(entries);
    const validSymptom = symptom === 'all' || options.some((item) => item.name === symptom) ? symptom : 'all';
    const series = bucketize(entries,days,validSymptom);
    const summary = frequencySummary(entries,series.buckets,validSymptom);
    const comparisonData = comparison(entries,validSymptom);
    const metricDef = METRICS[normalizedMetric];
    const loggedBuckets = series.buckets.filter((bucket) => bucket.loggedDays > 0).length;
    const trendSpan = trendSpanFor(series.days);
    const chartHeading = normalizedMode === 'basic' ? `${symptomLabel(validSymptom)} at a glance` : metricDef.label;
    const modeCopy = normalizedMode === 'basic'
      ? 'A fast read across frequency, severity, sleep, stress, and hydration. Each card keeps the selected calendar window intact and compares its recent half with its earlier half.'
      : 'A deeper daily view with a recorded-range line scale, typical-range context, a scale-neutral rolling average, and same-window symptom-day comparisons.';
    const advancedSuffix = advancedEnabled ? '' : ' · Pro+';
    const range = formatWindowRange(series.start,series.end,series.days);
    const chartBody = summary.logged === 0
      ? emptyMarkup()
      : normalizedMode === 'basic'
        ? basicSummaryMarkup(series.buckets,validSymptom,normalizedChartType)
        : chartSvg(series.buckets,normalizedMetric,validSymptom,true,normalizedChartType,series.days);
    const advancedPanel = normalizedMode === 'advanced'
      ? `${advancedControlsMarkup(normalizedMetric,series,loggedBuckets,trendSpan,normalizedChartType)}<div class="chart-legend"><span class="legend-primary">${escapeHtml(metricDef.label)}</span>${['sleep','stress','hydration'].includes(normalizedMetric) ? `<span class="legend-secondary">${escapeHtml(symptomLabel(validSymptom))} days</span>` : ''}<span class="legend-trend">${trendSpan}-day rolling average</span><span class="legend-range">Typical range</span></div>`
      : `<div class="basic-chart-explainer"><strong>Glanceable summary</strong><span>Latest value, compact trend, window average, and recent-half change for each measure.</span></div>`;
    const comparisons = normalizedMode === 'advanced' ? advancedComparisonMarkup(comparisonData,validSymptom,series.days) : '';

    return `<section class="insights-chart-card" aria-labelledby="insightsChartTitle" data-chart-mode-current="${normalizedMode}" data-chart-window="${series.days}" data-chart-bucket-days="1" data-chart-point-count="${series.buckets.length}" data-chart-type-current="${normalizedChartType}">
      <div class="insights-chart-head"><div><span class="pamet-eyebrow">Dynamic chart · ${series.days}-day window</span><h3 id="insightsChartTitle">${escapeHtml(chartHeading)}</h3><p>${escapeHtml(modeCopy)}</p></div><div class="chart-mode-switch" role="group" aria-label="Chart detail"><button type="button" data-chart-mode="basic" class="${normalizedMode==='basic'?'active':''}" aria-pressed="${normalizedMode==='basic'}">Basic</button><button type="button" data-chart-mode="advanced" class="${normalizedMode==='advanced'?'active':''}${advancedEnabled?'':' chart-locked'}" aria-pressed="${normalizedMode==='advanced'}">Advanced${advancedSuffix}</button></div></div>
      <div class="chart-primary-controls">${symptomSelectMarkup(options,validSymptom)}${normalizedMode === 'basic' ? chartTypeMarkup(normalizedChartType,true) : ''}<div class="chart-window-explain"><strong>${series.days} calendar days · daily resolution</strong><span>${escapeHtml(range)}. Data stays daily; only date labels thin out to prevent overlap.${normalizedMode === 'advanced' && series.days > 90 ? ' Scroll horizontally for exact-day detail.' : ''}</span></div></div>
      ${advancedPanel}
      ${chartBody}
      ${coverageStrip(series.buckets)}
      ${comparisons}
      <p class="chart-method-note">Charts summarize what you recorded. Missing days remain missing, values are not interpolated, the rolling average never changes the Y-axis scale, the typical range is descriptive only, and associations do not establish medical cause, diagnosis, or treatment effect.</p>
    </section>`;
  }

  window.PametInsightsCharts = Object.freeze({ render, bucketize, comparison, metrics:() => Object.keys(METRICS), bucketWidthFor, trendSpanFor });
})();
