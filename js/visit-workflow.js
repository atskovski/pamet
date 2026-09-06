/* Pamet visit workflow — calendar handoff, PDF email, Visit Brief guidance/navigation. */
(()=>{
  'use strict';
  const S=window.PametStore,A=window.PametAuth;
  if(!S||!A||window.PametVisitWorkflow)return;
  const $=(q,r=document)=>r.querySelector(q);
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PREF_KEY='pamet_calendar_preference_v1';
  let workflowConfig=null;

  function authHeaders(extra={}){const credential=A.getBackendCredential?.(),headers={...extra};if(credential?.deviceKey)headers.Authorization=`Bearer ${credential.deviceKey}`;return headers}
  async function api(path,options={}){
    const headers=authHeaders({'Content-Type':'application/json',...(options.headers||{})});
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers});
    const text=await response.text();let body={};try{body=text?JSON.parse(text):{}}catch{body={error:text}}
    if(!response.ok){const error=new Error(body.error||`Request failed (${response.status})`);error.status=response.status;throw error}
    return body;
  }
  async function config(force=false){if(workflowConfig&&!force)return workflowConfig;workflowConfig=await api('/api/visit-workflow/config',{headers:{Accept:'application/json'}});return workflowConfig}
  function modalRoot(){let root=$('#visitWorkflowModalRoot');if(!root){root=document.createElement('div');root.id='visitWorkflowModalRoot';document.body.appendChild(root)}return root}
  function closeModal(){const root=$('#visitWorkflowModalRoot');if(root)root.innerHTML=''}
  function modal(content,className=''){
    const root=modalRoot();
    root.innerHTML=`<div class="pamet-modal-backdrop visit-workflow-backdrop"><section class="pamet-modal visit-workflow-modal ${className}" role="dialog" aria-modal="true">${content}</section></div>`;
    root.querySelectorAll('[data-visit-close]').forEach(button=>button.addEventListener('click',closeModal));
    root.querySelector('.pamet-modal-backdrop')?.addEventListener('click',event=>{if(event.target===event.currentTarget)closeModal()});
    return root;
  }
  function modalStatus(root,message,kind='info'){
    const el=$('[data-visit-status]',root);if(!el)return;el.hidden=!message;el.className=`care-ux-status ${kind}`;el.textContent=message||'';
  }
  function notice(message,kind='success'){
    let root=$('#visitWorkflowNotice');if(!root){root=document.createElement('div');root.id='visitWorkflowNotice';root.className='visit-workflow-notice';root.setAttribute('role','status');root.setAttribute('aria-live','polite');document.body.appendChild(root)}
    root.className=`visit-workflow-notice ${kind}`;root.textContent=message;root.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>{if(root.isConnected)root.hidden=true},5000);
  }

  function currentUserEmail(){return cleanEmail($('#settingsEmail')?.textContent)||cleanEmail(A.currentUser?.email)||''}
  function cleanEmail(value){const text=String(value||'').trim();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)?text:''}
  function standardSnapshot(){
    const report=S.report();
    return {
      version:'standard-1.0',generatedAt:new Date().toISOString(),profileName:S.activeProfile?.name||'Pamet profile',profileId:S.activeProfile?.id||'primary',rangeLabel:report.rangeLabel||'Recorded history',
      overview:report.overview||[],breakdown:report.breakdown||[],medications:report.medications||[],notes:[],
      patterns:(report.patterns||[]).slice(0,12).map(item=>({title:item.title||'Pamet observation',detail:item.detail||''}))
    };
  }
  function briefPayload(){
    const advanced=window.PametAdvancedVisitBrief?.active===true&&S.hasEntitlement?.('advancedVisitBrief');
    return {mode:advanced?'advanced':'standard',snapshot:advanced?window.PametAdvancedVisitBrief.snapshot({includeNotes:true}):standardSnapshot()};
  }
  async function openEmailBrief(){
    const payload=briefPayload(),advanced=payload.mode==='advanced',root=modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Email ${advanced?'Advanced ':''}Visit Brief</h2><p class="pamet-modal-sub">When email delivery is available, Pamet sends the Visit Brief as a PDF attachment. Health details are not copied into the email body.</p></div><button class="pamet-close" type="button" data-visit-close aria-label="Close">×</button></div><div data-visit-status class="care-ux-status info" role="status" aria-live="polite">Checking email delivery…</div><form id="visitBriefEmailForm" class="pamet-form"><label>Recipient email<input id="visitBriefRecipient" type="email" maxlength="254" autocomplete="email" required value="${esc(currentUserEmail())}" placeholder="name@example.com"></label><div class="visit-email-attachment"><span class="visit-email-pdf-badge">PDF</span><div><strong>${advanced?'Advanced Visit Brief':'Visit Brief'}</strong><small>Attached as a PDF · no health summary in the message body</small></div></div><p class="phase2-form-help">Only send health information to an address you trust. Standard email is not a substitute for a secure clinical records exchange.</p><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-visit-close>Cancel</button><button class="btn btn-primary" id="visitBriefEmailSend" disabled>Send PDF</button></div></form>`,'visit-email-modal');
    const send=$('#visitBriefEmailSend',root);
    try{
      const cfg=await config(true);
      if(cfg.emailEnabled){send.disabled=false;modalStatus(root,'Email delivery is ready. The Visit Brief will be attached as a PDF.','success')}
      else if(cfg.emailDisabledReason==='privacy-review')modalStatus(root,'Emailing Visit Brief PDFs is temporarily unavailable while Pamet completes privacy and email-provider review. Use Download PDF instead.','warning');
      else modalStatus(root,'Email delivery is not configured yet. Use Download PDF until Pamet has a verified sending domain.','warning');
    }catch{modalStatus(root,'Pamet could not confirm email delivery. Use Download PDF instead.','warning')}
    $('#visitBriefEmailForm',root).addEventListener('submit',async event=>{
      event.preventDefault();
      const to=$('#visitBriefRecipient',root).value.trim();
      if(!cleanEmail(to))return modalStatus(root,'Enter a valid recipient email address.','error');
      send.disabled=true;modalStatus(root,`Sending PDF attachment to ${to}…`,'info');
      try{
        const fresh=briefPayload();
        await api('/api/visit-brief/email',{method:'POST',body:JSON.stringify({to,mode:fresh.mode,snapshot:fresh.snapshot})});
        $('#visitBriefEmailForm',root).hidden=true;
        modalStatus(root,'Visit Brief PDF sent successfully. No health summary was placed in the email body.','success');
        setTimeout(closeModal,2200);
      }catch(error){modalStatus(root,error.message||'The Visit Brief could not be emailed. Download the PDF instead.','error');send.disabled=false}
    });
  }

  function installReportNavigation(){
    const title=$('#screen-report .screen-title');
    if(title&&!$('#visitBriefBack')){
      const row=document.createElement('div');row.className='visit-brief-title-row';
      const back=document.createElement('button');back.type='button';back.id='visitBriefBack';back.className='icon-btn visit-brief-back';back.setAttribute('aria-label','Back to Settings');back.textContent='←';
      title.parentNode.insertBefore(row,title);row.append(back,title);
    }
    const toolbar=$('#advancedVisitBriefToolbar');
    if(toolbar&&!$('#visitBriefWorkspaceHint')&&S.hasEntitlement?.('advancedVisitBrief')){
      const hint=document.createElement('div');hint.id='visitBriefWorkspaceHint';hint.className='visit-brief-workspace-hint';
      hint.innerHTML='<div><strong>Complete Appointment Workspace first</strong><span>Your visit date, clinician, reason, priorities, and questions are used to fill the Advanced Visit Brief and its since-last-visit context.</span></div><button type="button" class="btn btn-ghost" data-visit-workspace-open>Open Appointment Workspace</button>';
      toolbar.insertAdjacentElement('afterend',hint);
    }
  }
  function goSettings(){const tab=$('[data-tab="settings"]');if(tab)tab.click();else document.querySelectorAll('.screen').forEach(screen=>screen.classList.toggle('active',screen.id==='screen-settings'))}

  function readPreference(){try{const value=localStorage.getItem(PREF_KEY);return ['google','apple','pamet'].includes(value)?value:'ask'}catch{return'ask'}}
  function savePreference(value){try{if(['google','apple','pamet'].includes(value))localStorage.setItem(PREF_KEY,value);else localStorage.removeItem(PREF_KEY)}catch{}}
  function enhanceAppointmentForm(form){
    if(!form||form.dataset.calendarEnhanced==='true')return;form.dataset.calendarEnhanced='true';
    const explainer=$('.care-save-explainer',form),saved=readPreference();
    const wrap=document.createElement('div');wrap.className='visit-calendar-field';
    wrap.innerHTML=`<label>Add to calendar after saving<select id="careCalendarDestination"><option value="ask">Ask me after saving</option><option value="google">Google Calendar</option><option value="apple">Apple Calendar</option><option value="pamet">Pamet only</option></select></label><label class="visit-calendar-remember"><input id="careRememberCalendar" type="checkbox" ${saved!=='ask'?'checked':''}><span>Remember this calendar choice on this device</span></label><p>Saved appointments always stay in your secure Pamet account. Google Calendar may request permission; Apple Calendar uses a standard .ics calendar file.</p>`;
    (explainer||form.querySelector('.pamet-form-actions'))?.insertAdjacentElement('beforebegin',wrap);
    const select=$('#careCalendarDestination',form);if(select)select.value=saved;
    form.addEventListener('submit',()=>{
      const choice=select?.value||'ask',remember=$('#careRememberCalendar',form)?.checked===true;
      if(choice!=='ask'&&remember)savePreference(choice);else if(!remember&&choice!=='ask')savePreference('ask');
      const pending={choice,startsLocal:$('#careStarts',form)?.value||'',clinician:$('#careClinician',form)?.value?.trim()||'',profileId:S.activeProfile?.id||'primary'};
      waitForAppointmentSave(form.closest('.care-appointment-modal')||form.closest('.pamet-modal')||document,pending);
    });
  }
  function waitForAppointmentSave(root,pending){
    const statusEl=$('[data-care-status]',root);if(!statusEl)return;
    let done=false;
    const finish=async()=>{
      if(done)return;const text=statusEl.textContent||'';
      if(!/^Appointment saved to Upcoming and saved visits/i.test(text))return;
      done=true;observer.disconnect();clearTimeout(timer);
      try{const appointment=await resolveSavedAppointment(pending);if(!appointment)return notice('Appointment saved in Pamet, but the calendar copy could not be prepared.','warning');await afterAppointmentSave(appointment,pending.choice)}catch(error){notice(error.message||'Appointment saved in Pamet, but the calendar copy could not be prepared.','warning')}
    };
    const observer=new MutationObserver(finish);observer.observe(statusEl,{childList:true,subtree:true,characterData:true});
    const timer=setTimeout(()=>{done=true;observer.disconnect()},12000);finish();
  }
  async function resolveSavedAppointment(pending){
    const data=await api('/api/appointments',{headers:{Accept:'application/json'}}),target=+new Date(pending.startsLocal),items=(data.appointments||[]).filter(item=>!item.profileId||item.profileId===pending.profileId);
    const exact=items.find(item=>Math.abs(+new Date(item.startsAt)-target)<60000&&(!pending.clinician||String(item.clinician||'').trim()===pending.clinician));
    return exact||items.find(item=>Math.abs(+new Date(item.startsAt)-target)<60000)||null;
  }
  async function afterAppointmentSave(appointment,choice){
    if(choice==='pamet')return notice('Appointment saved in Pamet.');
    if(choice==='google')return addGoogleCalendar(appointment.id);
    if(choice==='apple')return addAppleCalendar(appointment.id);
    showCalendarChoice(appointment);
  }
  async function addGoogleCalendar(appointmentId){
    notice('Appointment saved in Pamet. Preparing Google Calendar…','info');
    try{
      const result=await api(`/api/calendar/google/start?appointmentId=${encodeURIComponent(appointmentId)}`,{headers:{Accept:'application/json'}});
      if(!result?.url)throw new Error('Google Calendar could not be prepared.');
      window.location.assign(result.url);
    }catch(error){notice(error.message||'Appointment saved in Pamet, but Google Calendar could not be opened.','warning')}
  }
  async function addAppleCalendar(appointmentId){
    notice('Appointment saved in Pamet. Preparing Apple Calendar…','info');
    try{
      const response=await fetch(`/api/calendar/apple.ics?appointmentId=${encodeURIComponent(appointmentId)}`,{credentials:'same-origin',cache:'no-store',headers:authHeaders({Accept:'text/calendar'})});
      if(!response.ok){let message='Apple Calendar file could not be created.';try{message=(await response.json()).error||message}catch{}throw new Error(message)}
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='pamet-appointment.ics';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
      notice('Apple Calendar file created. Open the .ics file and confirm Add.');
    }catch(error){notice(error.message||'Appointment saved in Pamet, but the Apple Calendar file could not be created.','warning')}
  }
  function showCalendarChoice(appointment){
    const when=Number.isNaN(+new Date(appointment.startsAt))?'the saved time':new Date(appointment.startsAt).toLocaleString();
    const root=modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Appointment saved</h2><p class="pamet-modal-sub">The visit is secure in Pamet. Where else would you like to add it?</p></div><button class="pamet-close" type="button" data-visit-close aria-label="Close">×</button></div><div class="visit-calendar-summary"><strong>${esc(appointment.clinician||'Appointment')}</strong><span>${esc(when)}</span></div><div class="visit-calendar-actions"><button type="button" class="btn btn-primary" data-calendar-choice="google">Google Calendar</button><button type="button" class="btn btn-ghost" data-calendar-choice="apple">Apple Calendar</button><button type="button" class="btn btn-ghost" data-calendar-choice="pamet">Keep in Pamet only</button></div><label class="visit-calendar-remember"><input id="visitRememberCalendar" type="checkbox"><span>Remember my choice on this device</span></label><p class="phase2-form-help">Google may ask you to authorize Pamet to add this event. If direct Google Calendar access is not configured, Pamet opens a prefilled Google event for you to confirm. Apple uses an .ics file that you confirm in Calendar.</p>`,'visit-calendar-modal');
    root.querySelectorAll('[data-calendar-choice]').forEach(button=>button.addEventListener('click',()=>{
      const choice=button.dataset.calendarChoice;if($('#visitRememberCalendar',root)?.checked)savePreference(choice);closeModal();
      if(choice==='google')addGoogleCalendar(appointment.id);else if(choice==='apple')addAppleCalendar(appointment.id);else notice('Appointment saved in Pamet.');
    }));
  }

  function handleCalendarReturn(){
    const url=new URL(window.location.href),status=url.searchParams.get('calendar');if(!status)return;
    if(status==='google-added')notice('Appointment added to Google Calendar.');
    else if(status==='google-error')notice('The appointment is still saved in Pamet, but Google Calendar could not add it. You can try again from Appointment Workspace.','warning');
    url.searchParams.delete('calendar');url.searchParams.delete('reason');history.replaceState({},'',url.pathname+(url.search?url.search:'')+url.hash);
  }

  document.addEventListener('click',event=>{
    const back=event.target.closest?.('#visitBriefBack');if(back){event.preventDefault();event.stopImmediatePropagation();goSettings();return}
    const workspace=event.target.closest?.('[data-visit-workspace-open]');if(workspace){event.preventDefault();event.stopImmediatePropagation();window.PametCareUx?.openAppointmentWorkspace?.();return}
    const email=event.target.closest?.('#emailReport');if(email){event.preventDefault();event.stopImmediatePropagation();openEmailBrief();return}
    const reportNav=event.target.closest?.('[data-nav="report"]');if(reportNav)requestAnimationFrame(()=>{installReportNavigation()});
  },true);

  const refresh=()=>{
    installReportNavigation();
    const form=$('#careAppointmentForm');if(form)enhanceAppointmentForm(form);
  };
  document.addEventListener('pamet:settings-rendered',refresh);
  window.addEventListener('pamet:entitlements',refresh);
  window.addEventListener('pamet:profile-updated',refresh);
  new MutationObserver(()=>requestAnimationFrame(refresh)).observe(document.body,{childList:true,subtree:true});
  handleCalendarReturn();refresh();
  window.PametVisitWorkflow={openEmailBrief,showCalendarChoice,addGoogleCalendar,addAppleCalendar,refresh};
})();