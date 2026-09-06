'use strict';
const { test, expect } = require('@playwright/test');

const ULTRA={correlations:true,unlimitedHistory:true,sharing:true,appointmentWorkspace:true,multipleProfiles:true,advancedVisitBrief:true,encryptedSync:true};

async function ready(page){
  await page.addInitScript(()=>{
    localStorage.setItem('pamet_user_v1',JSON.stringify({id:'appointment-actions-user',firstName:'Visit',lastName:'Editor',email:'visit-editor@pamet.test',plan:'ultra',createdAt:new Date().toISOString()}));
    localStorage.setItem('pamet_session_v2',JSON.stringify({token:'appointment-actions-session',at:Date.now()}));
  });
  await page.route('**/api/entitlements',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({plan:'ultra',capabilities:ULTRA})}));
  await page.goto('/',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.PametAuthenticatedFeaturesLoaded===true&&!!window.PametVisitWorkflowLoader&&!!window.PametCareUx);
  await expect.poll(()=>page.evaluate(()=>window.PametEntitlements?.snapshot?.().plan)).toBe('ultra');
}

test('@production Upcoming and saved visits can be edited and removed in place',async({page})=>{
  const firstId='123e4567-e89b-42d3-a456-426614174111';
  let appointments=[{id:firstId,profileId:'primary',clinician:'Dr. Rivera',startsAt:'2026-09-18T16:30:00.000Z',reason:'Primary care — Original headache review',questions:['What changed?'],reminderMinutes:1440,status:'scheduled'}];
  const deleted=[];

  const appointmentsRoute=async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const method=request.method();
    const suffix=url.pathname.replace(/^.*\/api\/appointments\/?/,'');
    if(method==='DELETE'&&suffix){
      deleted.push(suffix);appointments=appointments.filter(item=>item.id!==suffix);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({deleted:true})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({appointments})});
  };
  await page.route('**/api/appointments',appointmentsRoute);
  await page.route('**/api/appointments/**',appointmentsRoute);

  await ready(page);
  await page.evaluate(()=>window.PametCareUx.openAppointmentWorkspace());
  const list=page.locator('#careAppointmentList');
  await expect(list).toContainText('Original headache review');
  await expect(list.getByRole('button',{name:'Edit'})).toBeVisible();
  await expect(list.getByRole('button',{name:'Remove'})).toBeVisible();

  await list.getByRole('button',{name:'Edit'}).click();
  await expect(page.locator('#careSaveAppointment')).toHaveText('Save changes');
  await expect(page.locator('#careVisitType')).toHaveValue('Primary care');
  await expect(page.locator('#careReason')).toHaveValue('Original headache review');
  await expect(page.locator('#careDateConfirmed')).toBeChecked();
  await page.locator('#careReason').fill('Updated migraine review');
  await page.locator('#careSaveAppointment').click();

  await expect(page.locator('[data-care-save-status]')).toContainText('Saved visit updated');
  await expect.poll(()=>deleted.includes(firstId)).toBe(true);
  await expect(list).toContainText('Updated migraine review');
  await expect(list).not.toContainText('Original headache review');

  page.once('dialog',dialog=>dialog.accept());
  await list.getByRole('button',{name:'Remove'}).click();
  await expect(page.locator('[data-care-save-status]')).toContainText('Saved visit removed');
  await expect(list).toContainText('No visits saved yet');
});
