/* Lightweight loader keeps calendar/PDF workflow code off the authenticated critical bundle. */
(()=>{
  'use strict';
  if(window.PametVisitWorkflowLoader)return;
  let pending=null,actionsPending=null;

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

  function loadAppointmentActions(){
    if(window.PametAppointmentWorkspaceActions)return Promise.resolve(window.PametAppointmentWorkspaceActions);
    if(actionsPending)return actionsPending;
    actionsPending=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/assets/appointment-workspace-actions.js?v=1695-visit-actions1';
      script.async=true;
      script.addEventListener('load',()=>window.PametAppointmentWorkspaceActions?resolve(window.PametAppointmentWorkspaceActions):reject(new Error('Saved visit actions did not initialize.')),{once:true});
      script.addEventListener('error',()=>reject(new Error('Saved visit actions could not be loaded.')),{once:true});
      document.head.appendChild(script);
    }).catch(error=>{actionsPending=null;throw error});
    return actionsPending;
  }

  function handleModalChanges(){
    closeSavedAppointmentWorkspace();
    if(document.querySelector('#careAppointmentList'))loadAppointmentActions().catch(()=>{});
  }

  window.PametVisitWorkflowLoader={load,labelVisitSequence,loadAppointmentActions};
  document.addEventListener('pamet:settings-rendered',labelVisitSequence);
  document.addEventListener('click',event=>{
    const email=event.target.closest?.('#emailReport');
    if(email){
      event.preventDefault();
      event.stopImmediatePropagation();
      const open=workflow=>workflow?.openEmailBrief?.();
      if(window.PametVisitWorkflow)open(window.PametVisitWorkflow);
      else load().then(open).catch(()=>{});
      return;
    }
    const prep=event.target.closest?.('[data-phase2="prep"]');
    if(prep)loadAppointmentActions().catch(()=>{});
    if(event.target.closest?.('[data-nav="report"],[data-phase2="prep"]'))load().catch(()=>{});
  },true);

  const modalObserver=new MutationObserver(handleModalChanges);
  modalObserver.observe(document.body,{childList:true,subtree:true});
  labelVisitSequence();
  handleModalChanges();
})();
