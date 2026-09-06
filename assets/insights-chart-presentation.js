/* Deferred presentation transforms for Pamet Insights charting. */
((global)=>{
  'use strict';
  if(global.PametInsightsChartPresentation)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const dayKey=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'':`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`};
  function symptomDaySummary(entries=[],requested='all'){
    const available=new Set();entries.forEach(entry=>(Array.isArray(entry?.symptoms)?entry.symptoms:[]).forEach(symptom=>available.add(String(symptom))));
    const symptom=requested!=='all'&&available.has(String(requested))?String(requested):'all';
    const loggedDays=new Set(entries.map(entry=>dayKey(entry?.date)).filter(Boolean)).size;
    const symptomDays=new Set(entries.filter(entry=>{const symptoms=Array.isArray(entry?.symptoms)?entry.symptoms:[];return symptom==='all'?symptoms.length>0:symptoms.includes(symptom)}).map(entry=>dayKey(entry?.date)).filter(Boolean)).size;
    return {symptom,symptomDays,loggedDays};
  }
  function symptomDaysCard(entries,symptom){
    const summary=symptomDaySummary(entries,symptom),scope=summary.symptom==='all'?'Any recorded symptom':summary.symptom,share=summary.loggedDays?Math.round(summary.symptomDays/summary.loggedDays*100):0;
    return `<article class="basic-metric-card" data-basic-metric="symptom-days"><div class="basic-metric-card-head"><div><span>Symptom days</span><small>${esc(scope)}</small></div><strong>${summary.symptomDays}</strong></div><div class="basic-sparkline basic-sparkline-empty" role="img" aria-label="Symptom day count only; no graph"><span>Count only · no graph</span></div><div class="basic-metric-card-foot"><span class="basic-delta trend-flat"><b aria-hidden="true">•</b>${summary.symptomDays} of ${summary.loggedDays} logged days</span><span>${share}% of logged days included the selected symptom</span></div></article>`;
  }
  function improve(markup,options={}){
    if(typeof markup!=='string')return markup;
    return markup
      .replace(/<article class="basic-metric-card" data-basic-metric="frequency">[\s\S]*?<\/article>/,symptomDaysCard(options.entries||[],options.symptom||'all'))
      .replace(/<button type="button" class="chart-metric-btn[^"]*" data-chart-metric="frequency"[^>]*>Frequency<\/button>/g,'')
      .replace('A fast read across frequency, severity, sleep, stress, and hydration.','A fast read across symptom-day count, severity, sleep, stress, and hydration.')
      .replace(/<text class="chart-reference-label" x="[^"]+" y="[^"]+">Typical range in this window<\/text>/g,'<rect class="chart-reference-label-bg" x="86" y="4" width="176" height="20" rx="10" fill="var(--surface,#fff)" stroke="var(--pamet-sage,#6F8F7D)" stroke-opacity=".78" aria-hidden="true"/><text class="chart-reference-label chart-reference-label-prominent" x="95" y="18" fill="var(--text-primary,#243536)" stroke="var(--surface,#fff)" stroke-width="1.5" paint-order="stroke fill">Typical range in this window</text>');
  }
  const normalize=options=>options?.metric==='frequency'?{...options,metric:'severity'}:options;
  global.PametInsightsChartPresentation=Object.freeze({improve,normalize});
})(window);
