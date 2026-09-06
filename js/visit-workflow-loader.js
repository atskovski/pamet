/* Lightweight loader keeps calendar/PDF workflow code off the authenticated critical bundle. */
(()=>{
  'use strict';
  if(window.PametVisitWorkflowLoader)return;
  let pending=null;
  const SAVED_PREFIX='pamet_saved_appointments_v160_';
  const $=(q,r=document)=>r.querySelector(q);

  function labelVisitSequence(){
    const prep=document.querySelector('[data-phase2="prep"]');
    const brief=document.querySelector('[data-phase2="brief"]');
    const prepCopy=prep?.querySelector('span');
    const briefCopy=brief?.querySelector('span');
    if(prepCopy)prepCopy.textContent='Step 1 · Add visit details, priorities, and questions';
    if(briefCopy)briefCopy.textContent='Step 2 · Create the clinician-ready summary from your visit plan and tracking';
  }

  function closeSavedAppointmentWorkspace(){
    if(!document.querySelector('#visitWorkflowModalRoot .visit-calendar-modal'))return;
    const careRoot=document.querySelector('#careUxModalRoot');
    if(careRoot?.children.length)careRoot.innerHTML='';
  }

  function load(){
    if(window.PametVisitWorkflow)return Promise.resolve(window.PametVisitWorkflow);
    if(pending)return pending;
    pending=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/deferred/visit-workflow.js';
      script.async=true;
      script.addEventListener('load',()=>window.PametVisitWorkflow?resolve(window.PametVisitWorkflow):reject(new Error('Visit workflow did not initialize.')),{once:true});
      script.addEventListener('error',()=>reject(new Error('Visit workflow could not be loaded.')),{once:true});
      document.head.appendChild(script);
    }).catch(error=>{pending=null;throw error});
    return pending;
  }

  function profileId(){return String(window.PametStore?.activeProfile?.id||'primary')}
  function savedKey(){return SAVED_PREFIX+profileId()}
  function readLocal(){try{const value=JSON.parse(localStorage.getItem(savedKey())||'[]');return Array.isArray(value)?value:[]}catch{return[]}}
  function writeLocal(items){try{localStorage.setItem(savedKey(),JSON.stringify(items.slice(0,100)))}catch{}}
  async function appointmentApi(path,options={}){
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    const text=await response.text();let body={};try{body=text?JSON.parse(text):{}}catch{body={error:text}}
    if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);
    return body;
  }
  function setCareStatus(message,kind='info'){
    const el=$('[data-care-save-status]',$('#careUxModalRoot')||document);if(!el)return;
    el.hidden=!message;el.className=`care-ux-status care-save-status ${kind}`;el.textContent=message||'';
  }
  function localDateTime(value){
    const date=new Date(value);if(Number.isNaN(date.getTime()))return'';
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  function parseVisitReason(value){
    const types=['Primary care','Specialist','Follow-up','Medication review','New symptom','Preventive visit','Other'];
    const text=String(value||'');const type=types.find(item=>text===item||text.startsWith(`${item} — `))||'Primary care';
    return {type,reason:text===type?'':text.startsWith(`${type} — `)?text.slice(type.length+3):text};
  }
  async function savedAppointment(localId){
    const local=readLocal().find(item=>String(item.localId)===String(localId));
    if(local)return local;
    const serverId=String(localId||'').startsWith('s')?String(localId).slice(1):'';
    if(!serverId)return null;
    const data=await appointmentApi('/api/appointments',{headers:{Accept:'application/json'}});
    const item=(data.appointments||[]).find(value=>String(value.id)===serverId);
    return item?{...item,localId:`s${item.id}`,serverId:item.id}:null;
  }
  function removeRenderedRow(localId){
    const list=$('#careAppointmentList');if(!list)return;
    const button=Array.from(list.querySelectorAll('[data-calendar-google]')).find(item=>item.dataset.calendarGoogle===String(localId));
    button?.closest('.care-saved-visit')?.remove();
    if(!list.querySelector('.care-saved-visit'))list.innerHTML='<div class="care-sync-help"><strong>No visits saved yet</strong><p>Saved appointments appear here.</p></div>';
  }
  async function removeSavedVisit(localId,{afterEdit=false}={}){
    const item=await savedAppointment(localId);if(!item)return false;
    const serverId=item.serverId||item.id||'';
    if(serverId)await appointmentApi(`/api/appointments/${encodeURIComponent(serverId)}`,{method:'DELETE'});
    writeLocal(readLocal().filter(value=>String(value.localId)!==String(localId)&&(!serverId||String(value.serverId)!==String(serverId))));
    removeRenderedRow(localId);
    if(!afterEdit)setCareStatus('Saved visit removed.','success');
    return true;
  }
  async function beginEdit(localId){
    const item=await savedAppointment(localId);if(!item)return setCareStatus('This saved visit could not be loaded for editing.','error');
    const form=$('#careAppointmentForm');if(!form)return;
    const parsed=parseVisitReason(item.reason);const starts=$('#careStarts',form);const confirmed=$('#careDateConfirmed',form);
    $('#careVisitType',form).value=parsed.type;$('#careClinician',form).value=item.clinician==='Appointment'?'':(item.clinician||'');
    starts.value=localDateTime(item.startsAt);$('#careReason',form).value=parsed.reason;$('#careQuestions',form).value=(item.questions||[]).join('\n');$('#careReminder',form).value=String(item.reminderMinutes||1440);
    confirmed.disabled=!starts.value;confirmed.checked=!!starts.value;
    form.dataset.editVisitId=String(localId);
    const save=$('#careSaveAppointment',form);if(save)save.textContent='Save changes';
    setCareStatus('Editing this saved visit. Update the details, confirm the date and time, then save changes.','info');
    form.scrollIntoView({behavior:'smooth',block:'start'});$('#careClinician',form)?.focus({preventScroll:true});
  }
  function cancelEditState(form){
    if(!form)return;delete form.dataset.editVisitId;
    const save=$('#careSaveAppointment',form);if(save)save.textContent='Save appointment';
  }
  function enhanceSavedVisits(){
    const list=$('#careAppointmentList');if(!list)return;
    list.querySelectorAll('.care-saved-visit').forEach(row=>{
      const actions=$('.care-saved-actions',row);const calendar=$('[data-calendar-google]',row);if(!actions||!calendar||actions.querySelector('[data-saved-visit-edit]'))return;
      const localId=calendar.dataset.calendarGoogle;
      const manage=document.createElement('div');manage.className='care-saved-manage';
      manage.innerHTML=`<button type="button" class="care-saved-manage-btn" data-saved-visit-edit="${localId}">Edit</button><span aria-hidden="true">·</span><button type="button" class="care-saved-manage-btn danger" data-saved-visit-remove="${localId}">Remove</button>`;
      actions.prepend(manage);
    });
    const form=$('#careAppointmentForm');
    if(form&&form.dataset.savedVisitEditBound!=='true'){
      form.dataset.savedVisitEditBound='true';
      form.addEventListener('submit',()=>{
        const editId=form.dataset.editVisitId;if(!editId)return;
        queueMicrotask(async()=>{
          const savedText=$('[data-care-save-status]',form)?.textContent||'';
          if(!/^Appointment saved to Upcoming and saved visits/i.test(savedText))return;
          try{await removeSavedVisit(editId,{afterEdit:true});cancelEditState(form);setCareStatus('Saved visit updated. Secure sync will continue automatically.','success')}
          catch(error){cancelEditState(form);setCareStatus(`Your changes were saved as a new visit, but the previous synced visit could not be removed. ${error.message||'Remove the older visit manually.'}`,'warning')}
        });
      });
    }
  }

  window.PametVisitWorkflowLoader={load,labelVisitSequence};
  document.addEventListener('pamet:settings-rendered',labelVisitSequence);
  document.addEventListener('click',event=>{
    const edit=event.target.closest?.('[data-saved-visit-edit]');
    if(edit){event.preventDefault();beginEdit(edit.dataset.savedVisitEdit).catch(error=>setCareStatus(error.message||'This saved visit could not be edited.','error'));return}
    const remove=event.target.closest?.('[data-saved-visit-remove]');
    if(remove){
      event.preventDefault();
      if(!window.confirm('Remove this saved visit from Pamet?'))return;
      remove.disabled=true;removeSavedVisit(remove.dataset.savedVisitRemove).catch(error=>{remove.disabled=false;setCareStatus(error.message||'The saved visit could not be removed.','error')});return;
    }
    const email=event.target.closest?.('#emailReport');
    if(email){
      event.preventDefault();
      event.stopImmediatePropagation();
      const open=workflow=>workflow?.openEmailBrief?.();
      if(window.PametVisitWorkflow)open(window.PametVisitWorkflow);
      else load().then(open).catch(()=>{});
      return;
    }
    if(event.target.closest?.('[data-nav="report"],[data-phase2="prep"]'))load().catch(()=>{});
  },true);

  const modalObserver=new MutationObserver(()=>{closeSavedAppointmentWorkspace();enhanceSavedVisits()});
  modalObserver.observe(document.body,{childList:true,subtree:true});
  labelVisitSequence();
  closeSavedAppointmentWorkspace();
  enhanceSavedVisits();
})();
