/* Deferred Appointment Workspace saved-visit editing/removal. */
(()=>{
  'use strict';
  if(window.PametAppointmentWorkspaceActions)return;
  const SAVED_PREFIX='pamet_saved_appointments_v160_';
  const $=(q,r=document)=>r.querySelector(q);
  const profileId=()=>String(window.PametStore?.activeProfile?.id||'primary');
  const savedKey=()=>SAVED_PREFIX+profileId();
  const readLocal=()=>{try{const value=JSON.parse(localStorage.getItem(savedKey())||'[]');return Array.isArray(value)?value:[]}catch{return[]}};
  const writeLocal=items=>{try{localStorage.setItem(savedKey(),JSON.stringify(items.slice(0,100)))}catch{}};

  async function api(path,options={}){
    const baseHeaders={'Content-Type':'application/json',...(options.headers||{})};
    let response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:baseHeaders});
    const credential=window.PametAuth?.getBackendCredential?.();
    if(response.status===401&&credential?.deviceKey&&!baseHeaders.Authorization){
      response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...baseHeaders,Authorization:`Bearer ${credential.deviceKey}`}});
    }
    const text=await response.text();let body={};try{body=text?JSON.parse(text):{}}catch{body={error:text}}
    if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);
    return body;
  }
  function setStatus(message,kind='info'){
    const el=$('[data-care-save-status]',$('#careUxModalRoot')||document);if(!el)return;
    el.hidden=!message;el.className=`care-ux-status care-save-status ${kind}`;el.textContent=message||'';
  }
  function localDateTime(value){
    const date=new Date(value);if(Number.isNaN(date.getTime()))return'';
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  function parseReason(value){
    const types=['Primary care','Specialist','Follow-up','Medication review','New symptom','Preventive visit','Other'];
    const text=String(value||'');const type=types.find(item=>text===item||text.startsWith(`${item} — `))||'Primary care';
    return {type,reason:text===type?'':text.startsWith(`${type} — `)?text.slice(type.length+3):text};
  }
  async function getItem(localId){
    const local=readLocal().find(item=>String(item.localId)===String(localId));
    if(local)return local;
    const serverId=String(localId||'').startsWith('s')?String(localId).slice(1):'';
    if(!serverId)return null;
    const data=await api('/api/appointments',{headers:{Accept:'application/json'}});
    const item=(data.appointments||[]).find(value=>String(value.id)===serverId);
    return item?{...item,localId:`s${item.id}`,serverId:item.id}:null;
  }
  function removeRow(localId){
    const list=$('#careAppointmentList');if(!list)return;
    const button=Array.from(list.querySelectorAll('[data-calendar-google]')).find(item=>item.dataset.calendarGoogle===String(localId));
    button?.closest('.care-saved-visit')?.remove();
    if(!list.querySelector('.care-saved-visit'))list.innerHTML='<div class="care-sync-help"><strong>No visits saved yet</strong><p>Saved appointments appear here.</p></div>';
  }
  function purge(localId,serverId=''){
    writeLocal(readLocal().filter(value=>String(value.localId)!==String(localId)&&(!serverId||String(value.serverId)!==String(serverId))));
    removeRow(localId);
  }
  function settleRemoval(localId,serverId=''){
    purge(localId,serverId);
    [650,1700].forEach(delay=>setTimeout(()=>purge(localId,serverId),delay));
  }
  async function removeSavedVisit(localId,{afterEdit=false}={}){
    const item=await getItem(localId);if(!item)return false;
    const serverId=item.serverId||item.id||'';
    if(serverId)await api(`/api/appointments/${encodeURIComponent(serverId)}`,{method:'DELETE'});
    settleRemoval(localId,serverId);
    if(!afterEdit)setStatus('Saved visit removed.','success');
    return true;
  }
  async function beginEdit(localId){
    const item=await getItem(localId);if(!item)return setStatus('This saved visit could not be loaded for editing.','error');
    const form=$('#careAppointmentForm');if(!form)return;
    const parsed=parseReason(item.reason);const starts=$('#careStarts',form);const confirmed=$('#careDateConfirmed',form);
    $('#careVisitType',form).value=parsed.type;
    $('#careClinician',form).value=item.clinician==='Appointment'?'':(item.clinician||'');
    starts.value=localDateTime(item.startsAt);
    $('#careReason',form).value=parsed.reason;
    $('#careQuestions',form).value=(item.questions||[]).join('\n');
    $('#careReminder',form).value=String(item.reminderMinutes||1440);
    confirmed.disabled=!starts.value;confirmed.checked=!!starts.value;
    form.dataset.editVisitId=String(localId);
    const save=$('#careSaveAppointment',form);if(save)save.textContent='Save changes';
    setStatus('Editing this saved visit. Update the details, confirm the date and time, then save changes.','info');
    form.scrollIntoView({behavior:'smooth',block:'start'});$('#careClinician',form)?.focus({preventScroll:true});
  }
  function clearEdit(form){
    delete form.dataset.editVisitId;
    const save=$('#careSaveAppointment',form);if(save)save.textContent='Save appointment';
  }
  function enhance(){
    const list=$('#careAppointmentList');
    list?.querySelectorAll('.care-saved-visit').forEach(row=>{
      const actions=$('.care-saved-actions',row);const calendar=$('[data-calendar-google]',row);
      if(!actions||!calendar||actions.querySelector('[data-saved-visit-edit]'))return;
      const localId=calendar.dataset.calendarGoogle;const manage=document.createElement('div');manage.className='care-saved-manage';
      manage.innerHTML=`<button type="button" class="care-saved-manage-btn" data-saved-visit-edit="${localId}">Edit</button><span aria-hidden="true">·</span><button type="button" class="care-saved-manage-btn danger" data-saved-visit-remove="${localId}">Remove</button>`;
      actions.prepend(manage);
    });
    const form=$('#careAppointmentForm');
    if(form&&form.dataset.savedVisitEditBound!=='true'){
      form.dataset.savedVisitEditBound='true';
      form.addEventListener('submit',()=>{
        const editId=form.dataset.editVisitId;if(!editId)return;
        queueMicrotask(async()=>{
          if(!/^Appointment saved to Upcoming and saved visits/i.test($('[data-care-save-status]',form)?.textContent||''))return;
          try{await removeSavedVisit(editId,{afterEdit:true});clearEdit(form);setStatus('Saved visit updated. Secure sync will continue automatically.','success')}
          catch(error){clearEdit(form);setStatus(`Your changes were saved as a new visit, but the previous synced visit could not be removed. ${error.message||'Remove the older visit manually.'}`,'warning')}
        });
      });
    }
  }

  document.addEventListener('click',event=>{
    const edit=event.target.closest?.('[data-saved-visit-edit]');
    if(edit){event.preventDefault();beginEdit(edit.dataset.savedVisitEdit).catch(error=>setStatus(error.message||'This saved visit could not be edited.','error'));return}
    const remove=event.target.closest?.('[data-saved-visit-remove]');
    if(!remove)return;
    event.preventDefault();
    if(!window.confirm('Remove this saved visit from Pamet?'))return;
    remove.disabled=true;
    removeSavedVisit(remove.dataset.savedVisitRemove).catch(error=>{remove.disabled=false;setStatus(error.message||'The saved visit could not be removed.','error')});
  },true);

  const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});enhance();
  window.PametAppointmentWorkspaceActions=Object.freeze({enhance});
})();
