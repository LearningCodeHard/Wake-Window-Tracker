let S=__STATE__, pending={}, seq=0, lastFocus=null,currentPlan=null,lastOperation='';
window.__queue=[];window.__waiter=null;
const $=id=>document.getElementById(id);
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=()=>S.mode==='demo'?S.now:Date.now();
const fmt=t=>new Intl.DateTimeFormat('en-US',{timeZone:S.settings.timezone,hour:'numeric',minute:'2-digit'}).format(new Date(t));
const dur=m=>m>=60?`${Math.floor(m/60)}h${m%60?' '+m%60+'m':''}`:`${m}m`;
function toast(t){$('toast').textContent=t;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',5000);}
function request(action,data={}){return new Promise((resolve,reject)=>{const id=++seq;pending[id]={resolve,reject};window.__queue.push({id,action,data});if(window.__waiter){const f=window.__waiter;window.__waiter=null;f(window.__queue.shift());}});}
window.receive=function(r){if(r.snapshot){S=r.snapshot;render();}const p=pending[r.id];delete pending[r.id];if(p){if(r.error){const e=Error((r.saveConfirmed?'Save confirmed locally; updated view could not be read. ':'')+r.error);e.saveConfirmed=!!r.saveConfirmed;p.reject(e);}else p.resolve(r);}};
async function act(action,data={},close=true){document.body.classList.add('native-busy');lastOperation=action==='load'?'Reading shared files on this phone…':'Saving on this phone…';$('operationState').textContent=lastOperation;try{const r=await request(action,data);lastOperation=action==='load'?'Read completed.':r.saveConfirmed?'Save confirmed on this phone.':'No new write was needed.';if(close)closeSheet();if(r.message)toast(r.message);return r;}catch(e){lastOperation=(e.saveConfirmed?'':'Not confirmed: ')+e.message+' Refresh before retrying a save.';$('modalError').textContent=e.message;toast(e.message);return null;}finally{document.body.classList.remove('native-busy');$('operationState').textContent=lastOperation;}}
function connectionStopped(message){lastOperation=message+' A pending save may have succeeded; reopen and check before repeating it.';$('operationState').textContent=lastOperation;for(const id of Object.keys(pending)){pending[id].reject(Error(lastOperation));delete pending[id];}document.body.classList.remove('native-busy');toast(lastOperation);}
function openSheet(title,body,actions=''){lastFocus=document.activeElement;$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalActions').innerHTML=actions;$('modalActions').hidden=!actions;$('modalError').textContent='';$('backdrop').classList.add('open');$('modal').classList.add('open');document.body.classList.add('sheet-open');$('modalScroll').scrollTop=0;}
function closeSheet(){window.pendingDeletion=null;$('backdrop').classList.remove('open');$('modal').classList.remove('open');document.body.classList.remove('sheet-open');if(lastFocus)lastFocus.focus();}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
function field(label,id,type,value){
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}"${type==='time'?' step="60"':''} value="${esc(value)}"></div>`;
}
function setTime(id,value){$(id).value=value;}
function napDateNote(date){const today=WW.parts(clock(),S.settings.timezone).date;return date===today?'Today':new Intl.DateTimeFormat('en-US',{timeZone:S.settings.timezone,month:'short',day:'numeric',year:'numeric'}).format(new Date(WW.wall(date,'12:00',S.settings.timezone)));}
function saveButtons(handler,label='Save',footer=false){const buttons=`<button onclick="closeSheet()">Cancel</button><button class="save" onclick="${handler}">${label}</button>`;return footer?buttons:`<div class="sheet-actions">${buttons}</div>`;}
async function changeDay(date){await act('load',{date},false);}
function morningSheet(){openSheet('Morning Wake',`<p>Actual wake time for ${esc(S.date)}.</p><div class="form-grid">${field('Wake time','morning','time',S.day.morning?WW.parts(S.day.morning,S.settings.timezone).time:'')}</div>${saveButtons('saveMorning()')}${S.day.morning?'<div class="toolbar"><button class="small-btn destructive" onclick="removeMorning()">Remove Morning Wake</button></div>':''}`);}
async function saveMorning(){await act('morning',{date:S.date,time:$('morning').value,base:S.revisions.morning});}
function removeMorning(){confirmRemoval('Remove morning wake?','Remove the recorded morning wake for this day? Review the schedule after saving.','morning',{date:S.date,time:null,base:S.revisions.morning},'Remove Wake');}
function napSheet(index=null,imported=null){
  const n=index!==null?S.day.naps[index]:imported,current=WW.parts(clock(),S.settings.timezone);const start=n?WW.parts(n.start,S.settings.timezone):{date:current.date,time:''},end=n&&n.end?WW.parts(n.end,S.settings.timezone):{date:start.date,time:start.date===current.date?current.time:''};window.napEntryDate=start.date;
  const matching=imported?S.day.naps.find(x=>x.end===null&&x.start===imported.start):null;
  window.editingNap=n&&n.entity?{entity:n.entity,base:n.revision}:matching?{entity:matching.entity,base:matching.revision}:null;window.importedNap=!!imported;
  let hint=imported?'Review the extracted date and times before saving.':'';if(imported&&imported.messages.length)hint+=' '+imported.messages.join(' ');
  openSheet(imported?'Review imported nap':n&&n.end===null?'Record actual wake':index===null?'Log Completed Nap':'Edit recorded nap',`<p>${esc(napDateNote(window.napEntryDate))} · ${esc(hint||'Enter actual sleep times. Planned ranges do not limit recorded naps.')}</p><div class="form-grid">${field('Start','napStart','time',start.time)}${field('Actual end','napEnd','time',end.time)}</div>${saveButtons('saveNap()',n&&n.end===null?'Finish Nap':'Save Nap')}${window.editingNap?'<div class="toolbar"><button class="small-btn destructive" onclick="deleteNap()">Delete This Nap</button></div>':''}`);
}
async function saveNap(){const e=window.editingNap;await act('nap',{date:window.napEntryDate,start:$('napStart').value,end:$('napEnd').value,entity:e?e.entity:null,base:e?e.base:null,imported:!!window.importedNap});}
function deleteNap(){const n=window.editingNap;if(!n||!n.entity){toast('This nap has not been saved. Close the sheet to discard it.');return;}confirmRemoval('Delete nap?','Remove this nap from the day? Review the schedule after saving.','deleteNap',{date:window.napEntryDate,...n},'Delete Nap');}
function confirmRemoval(title,message,action,data,label){openSheet(title,`<p>${esc(message)}</p><div class="sheet-actions"><button onclick="closeSheet()">Keep Entry</button><button class="delete-save" onclick="confirmDeletion()">${esc(label)}</button></div>`);window.pendingDeletion={action,data};}
async function confirmDeletion(){const d=window.pendingDeletion;if(!d)return;const r=await act(d.action,d.data);if(r)window.pendingDeletion=null;}
function activeIndex(){return S.day.naps.findIndex(n=>n.end===null);}
function activeNapSheet(index=null,imported=null){
  const n=index!==null?S.day.naps[index]:imported;
  if(index!==null&&(!n||n.end!==null)){toast('This nap has ended. Refresh to view the actual wake.');return;}
  const current=WW.parts(clock(),S.settings.timezone);
  const start=n?WW.parts(n.start,S.settings.timezone):{date:current.date,time:current.time};window.napEntryDate=start.date;
  const matching=imported?S.day.naps.find(x=>x.end===null&&x.start===imported.start):null;
  const existing=n&&n.entity?n:matching;
  const expected=existing&&imported&&imported.estimateSource!=='goal'?WW.parts(existing.expectedEnd,S.settings.timezone).time:n?WW.parts(n.expectedEnd,S.settings.timezone).time:start.time?WW.parts(Date.parse(WW.wall(start.date,start.time,S.settings.timezone))+S.settings.nap.ideal*60000,S.settings.timezone).time:'';
  window.editingNap=existing?{entity:existing.entity,base:existing.revision}:null;window.importedNap=!!imported;window.confirmActive=!!(imported&&imported.needsActiveConfirmation);
  const hint=imported?(imported.messages||[]).join(' '):'Start is actual. Expected wake is an estimate you can change; it does not end the nap automatically.';
  const existingIndex=existing?S.day.naps.indexOf(existing):-1;
  openSheet(imported?'Review nap in progress':existing?'Expected wake':'Start Nap',`<p>${esc(napDateNote(window.napEntryDate))} · ${esc(hint)}</p><div class="form-grid">${field('Actual start','napStart','time',start.time)}${field('Expected wake · estimated','napExpected','time',expected)}</div>${window.confirmActive?'<p><label><input type="checkbox" id="confirmActive"> This nap is still in progress</label></p>':''}${saveButtons('saveActiveNap()',existing?'Update Expected Wake':'Start Nap')}${existing?`<div class="toolbar">${S.date===current.date?`<button class="small-btn" onclick="endNapNow(${existingIndex})">End Nap Now</button>`:''}<button class="small-btn" onclick="finishNapSheet(${existingIndex})">Enter Actual Wake</button><button class="small-btn destructive" onclick="deleteNap()">Cancel Active Nap</button></div>`:''}`);
  if(!n){$('napStart').onchange=updateExpectedFromStart;}
}
function updateExpectedFromStart(){try{setTime('napExpected',WW.parts(Date.parse(WW.wall(window.napEntryDate,$('napStart').value,S.settings.timezone))+S.settings.nap.ideal*60000,S.settings.timezone).time);}catch{}}
async function saveActiveNap(){if(window.confirmActive&&!$('confirmActive').checked){$('modalError').textContent='Confirm the nap is still in progress, or cancel and enter a completed nap.';return;}const e=window.editingNap;await act('activeNap',{date:window.napEntryDate,start:$('napStart').value,expectedEnd:$('napExpected').value,entity:e?e.entity:null,base:e?e.base:null,imported:!!window.importedNap});}
function finishNapSheet(index){napSheet(index);}
async function endNapNow(index){const n=S.day.naps[index];if(!n||n.end!==null){toast('Refresh to view the current nap.');return;}await act('nap',{date:S.date,start:WW.parts(n.start,S.settings.timezone).time,end:WW.parts(clock(),S.settings.timezone).time,entity:n.entity,base:n.revision});}
function bedtimeSheet(){openSheet('Bedtime Target',`<p>Change the target for ${esc(S.date)}. The planner will choose the remaining nap count and timings.</p><div class="form-grid">${field('Target bedtime','todayBed','time',S.day.bedtime||S.settings.bedtime)}</div>${saveButtons('saveBedtime()')}`);}
async function saveBedtime(){await act('bedtime',{date:S.date,time:$('todayBed').value,base:S.revisions.bedtime});}
let napCountsEdit;
function napCountFields({target,max}){
  return `<div class="triple setting-pair">${field('Preferred naps','napTarget','number',target)}${field('Maximum naps','napMax','number',max)}</div>`;
}
function napCountsSheet(){
  napCountsEdit={date:S.date,base:S.revisions.settings};
  openSheet('Daily Naps',`<p>Shared defaults for both phones. The maximum includes recorded and active naps.</p>
    <div class="settings-card">${napCountFields(WW.napCounts(S.settings))}</div>`,saveButtons('saveNapCounts()','Save',true));
}
function enteredNapCounts(){
  return Object.fromEntries(['napTarget','napMax'].map(key=>[key,$(key).value===''?null:Number($(key).value)]));
}
async function saveNapCounts(){
  await act('napCounts',{...napCountsEdit,...enteredNapCounts()});
}
const durationLabels={short:'Short nap',nap:'Standard nap',long:'Long nap',first:'First wake window',second:'Second wake window',later:'Later wake windows',final:'Final wake window'};
function settingsSheet(){
  window.settingsBase=S.revisions.settings;
  const profiles=WW.napProfiles(S.settings);
  const rangeFields=keys=>keys.map(key=>{
    const range=profiles[key]||S.settings[key];
    return `<div class="setting-group"><h4>${durationLabels[key]}</h4><div class="triple">${['min','ideal','max'].map((x,i)=>
      field(['Minimum','Preferred','Maximum'][i],key+'_'+x,'number',range[x])).join('')}</div></div>`;
  }).join('');
  const content=`<section class="settings-section">
    <h3>Daily naps</h3>
    <div class="settings-card">${napCountFields(WW.napCounts(S.settings))}<p>The maximum includes recorded and active naps.</p></div>
  </section>
  <section class="settings-section"><h3>Nap duration profiles <span>Minutes</span></h3>
    <div class="settings-card">${rangeFields(['short','nap','long'])}<p>The planner selects a profile automatically. Tap a planned nap to override it.</p></div>
  </section>
  <section class="settings-section"><h3>Wake windows <span>Minutes</span></h3>
    <div class="settings-card">${rangeFields(['first','second','later','final'])}
      <p>At 7:00 AM or later, the first window uses the second window’s range.</p></div>
  </section>
  <section class="settings-section"><h3>Schedule control</h3>
    <dl class="settings-card rules">
      <dt>Nap timing tolerance</dt><dd>10 minutes</dd>
      <dt>Schedule revisions</dt><dd>Approval required</dd>
      <dt>Missed planned naps</dt><dd>Overdue warning</dd>
    </dl>
  </section>
  <section class="settings-section"><h3>Shared defaults</h3>
    <div class="settings-card form-grid">${field('Default bedtime','defaultBed','time',S.settings.bedtime)}${field('Household timezone','timezone','text',S.settings.timezone)}</div>
  </section>
  <section class="settings-section"><h3>Appointments and Nap Pins</h3>${planningControls()}</section>`;
  openSheet('Planner Settings',content,'<button onclick="closeSheet()">Cancel</button><button class="save" onclick="saveSettings()">Save Settings</button>');

}
async function saveSettings(){
  const settings={timezone:$('timezone').value.trim(),bedtime:$('defaultBed').value,...enteredNapCounts()};
  for(const key of Object.keys(durationLabels))settings[key]=Object.fromEntries(['min','ideal','max'].map(x=>[x,Number($(key+'_'+x).value)]));
  await act('settings',{settings,base:window.settingsBase});
}
function theme(){const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('ww_appearance',t);}catch{}}
function probeSheet(){openSheet('Two-Phone Check',`<p>Use a different label on each phone. Test records do not affect naps.</p><div class="form-grid">${field('This phone label','probeLabel','text','Phone A')}</div><div class="sheet-actions"><button onclick="probeRefresh()">Read Test Records</button><button class="save" onclick="probeWrite()">Write Test Record</button></div><div id="probeResults">${probeRows()}</div><p>Both labels must appear on both phones after reading again. A local save alone does not prove sharing.</p>`);}
function probeRows(){return (S.probes||[]).map(p=>`<div class="probe-row"><strong>${esc(p.label)}</strong><br>${esc(p.at)}<br>Code: ${esc(p.code)}</div>`).join('')||'<p>No test records read yet.</p>';}
async function probeRefresh(){await act('load',{date:S.date},false);$('probeResults').innerHTML=probeRows();}
async function probeWrite(){await act('probe',{label:$('probeLabel').value},false);$('probeResults').innerHTML=probeRows();}
async function advanceDemo(){await act('advance',{},false);}
