/* Quiet timeline and V2 planning controls. Existing actual-event forms stay in ui.js. */
function dayPlanning(){return S.day.planning||{awake:[],pins:[]};}
function futurePins(){return dayPlanning().pins.filter(p=>p.ordinal>S.day.naps.length||p.anchors.some((id,i)=>!S.day.naps[i]||WW.napIdentity(S.day.naps[i])!==id));}
function eventRow(title,sub,start,end,click='',classes='',tag=''){
  return `<div class="event ${classes}"><div class="event-title">${esc(title)}${tag?` <span class="tag">${esc(tag)}</span>`:''}</div><button${click?` onclick="${esc(click)}"`:' disabled'}><span class="event-time">${esc(fmt(start))}${end?'–'+esc(fmt(end)):''}</span><span class="event-sub">${esc(sub)}</span></button></div>`;
}
function render(){
  $('viewDate').value=S.date;$('dateText').textContent=new Intl.DateTimeFormat('en-US',{timeZone:S.settings.timezone,weekday:'long',month:'long',day:'numeric'}).format(new Date(WW.wall(S.date,'12:00',S.settings.timezone)));
  $('appTitle').textContent='Graham’s Day Planner';
  $('demoAdvance').hidden=S.mode!=='demo';
  const d=S.day,completed=d.naps.filter(n=>n.end!==null),active=d.naps.find(n=>n.end===null),historical=S.date!==WW.parts(clock(),S.settings.timezone).date;
  const total=Math.round(completed.reduce((a,n)=>a+(Date.parse(n.end)-Date.parse(n.start))/60000,0));
  let p,review;
  try{
    WW.validateDay(d,S.settings,clock());
    review=historical?{}:scheduleReview();
    p=review.saved||review.proposal||{events:[]};
  }catch(e){p={status:'error',events:[],message:e.message};review={};}
  currentPlan=p;
  const last=d.naps[d.naps.length-1],anchor=Date.parse(last?.end||d.morning);
  const warnings=[...(S.warnings||[]),...(review.proposal?.notes||p.notes||[])];if((S.conflicts||[]).length)warnings.push('Conflicting edits were found. Review the displayed entries and save again to acknowledge the latest revision.');
  if(historical)warnings.push('Viewing another date. Actual records and saved appointments are shown; future suggestions are hidden.');
  $('notice').hidden=!warnings.length;$('notice').textContent=warnings.join(' ');
  $('endActive').hidden=!active||historical;
  const sleeping=!!active&&!historical;
  $('currentState').textContent=historical?'Recorded day':sleeping?`Sleeping · ${dur(Math.max(0,Math.floor((clock()-Date.parse(active.start))/60000)))}`:Number.isFinite(anchor)?`Awake · ${dur(Math.max(0,Math.floor((clock()-anchor)/60000)))}`:'Ready to plan';
  $('currentSince').textContent=sleeping?`Since ${fmt(active.start)}`:Number.isFinite(anchor)&&!historical?`Since ${fmt(anchor)}`:'Add a morning wake or nap';
  $('timelineTitle').textContent=historical?'Recorded Day':'Rest of Today';$('timelineNote').textContent=historical?'Actual':review.status||'Suggested';
  const events=[],earlier=[];
  if(d.morning)earlier.push(eventRow('Morning Wake','Actual · tap to edit',d.morning,null,'morningSheet()','actual'));
  let previous=d.morning;
  d.naps.forEach((n,i)=>{
    const wake=previous?` · Previous wake ${dur(Math.round((Date.parse(n.start)-Date.parse(previous))/60000))}`:'';
    const details=n.end?`${dur(Math.round((Date.parse(n.end)-Date.parse(n.start))/60000))} · actual${wake}`:`Actual start · estimated end${wake}`;
    earlier.push(eventRow(n.end?`Recorded nap ${i+1}`:'Nap in progress',details,n.start,n.end||n.expectedEnd,n.end?`napSheet(${i})`:`activeNapSheet(${i})`,'actual'));
    if(!n.end&&!historical)events.push({at:Date.parse(n.expectedEnd),html:eventRow('Expected wake','Current nap · estimated end'+wake,n.expectedEnd,null,`activeNapSheet(${i})`,'current')});
    previous=n.end;
  });
  for(const a of dayPlanning().awake){const html=eventRow(a.label||'Awake period','No planned sleep during this time',a.start,a.end,`awakeSheet(${JSON.stringify(a.id)})`,'appointment','Keep awake');if(!historical&&Date.parse(a.end)>clock())events.push({at:Date.parse(a.start),html});else earlier.push(html);}
  if(!historical){
    let next=true;
    p.events.forEach((e,i)=>{
      if(e.kind!=='nap'||e.ordinal<=d.naps.length)return;
      const before=p.events[i-1],overdue=e.start<clock();
      const details=`${dur(e.minutes)} sleep${before?' · Previous wake '+dur(before.minutes):''}`;
      events.push({at:e.start,html:eventRow(`${review.saved?'Planned':'Suggested'} nap ${e.ordinal}`,details,e.start,e.end,
        `pinSheet(${e.ordinal})`,next?'next':'',overdue?'Overdue':e.pinned?'Pinned':'')});
      next=false;
    });
    if(p.bedtime){
      const final=p.events[p.events.length-1];
      const details=[bedtimeTradeoff(p),final?'Final wake '+dur(final.minutes):''].filter(Boolean).join(' · ');
      events.push({at:p.bedtime,html:eventRow('Bedtime',details,p.bedtime,null,'bedtimeSheet()')});
    }
    else events.push({at:Date.parse(WW.wall(S.date,d.bedtime||S.settings.bedtime,S.settings.timezone)),html:eventRow('Bedtime target',p.status==='blocked'||p.status==='active-overdue'?'Planning paused · review below':'Choose your target for this day',WW.wall(S.date,d.bedtime||S.settings.bedtime,S.settings.timezone),null,'bedtimeSheet()')});
  }
  $('timeline').innerHTML=historical?earlier.join('')||'<p class="empty">No recorded events.</p>':events.sort((a,b)=>a.at-b.at).map(e=>e.html).join('');
  $('earlierTimeline').innerHTML=earlier.join('')||'<p class="empty">No earlier records yet.</p>';$('earlierDetails').hidden=historical;
  $('napTotal').textContent=`${completed.length} completed · ${dur(total)}`;
  const proposal=review.proposal,attention=!historical&&(review.reasons?.length||review.overdue||review.expired||['blocked','adjust','active-overdue','error'].includes(proposal?.status||p.status));
  $('guidance').hidden=!attention;
  $('guidanceTitle').textContent=proposal?.status==='active-overdue'?'Update Expected Wake':review.status||'Adjustment Needed';
  $('guidanceText').textContent=[...(review.reasons||[]),review.overdue,
    review.expired?'A proposed transition has passed. Use Recalculate for options from the current time.':proposal?.message||p.message,
    review.saved&&proposal?.bedtime?`Approved ${fmt(review.saved.bedtime)} · Proposed ${fmt(proposal.bedtime)}.`:''
  ].filter(Boolean).join(' ');
  $('planControls').hidden=historical||!review.status;
  $('planActions').innerHTML=review.conflict?'<button class="primary" onclick="approvalConflictSheet()">Review Approvals</button>':
    `${proposal?.bedtime&&!review.expired?'<button class="primary" onclick="reviewSchedule()">'+(review.saved?'Review Proposed Plan':'Approve Plan')+'</button>':''}
    ${review.status?'<button class="small-btn" onclick="recalculate()">Recalculate</button>':''}`;
  const release=S.release?`${S.release.version} · ${S.release.channel.toUpperCase()} · `:'Manual · ';
  $('saveState').textContent=release+(S.mode==='demo'?`Demo only · clock ${fmt(clock())} · no shared writes`:`${S.release&&S.release.channel==='test'?'Test folder · ':''}Shared files read on this phone at ${fmt(S.checkedAt)}.${S.lastSavedAt?' Last local save '+fmt(S.lastSavedAt)+'.':''} Refresh the other phone to read shared changes.`);
  $('operationState').textContent=lastOperation;
}
function addSheet(){openSheet('Add',`<div class="nap-menu"><button onclick="awakeSheet()">Keep Awake - Appointment</button><button onclick="activeNapSheet()"${activeIndex()>=0?' disabled':''}>Start Nap</button><button onclick="napSheet()">Log Completed Nap</button></div>${activeIndex()>=0?'<p>A nap is already in progress. Use End Nap or tap its expected wake to edit it.</p>':''}`);}
function updatesSheet(){
  const info=S.release&&S.release.updateInfo;
  const controls=info?info.actions.map(a=>`<button onclick="applyUpdateControl(${esc(JSON.stringify(a.id))})"${a.enabled?'':' disabled'}>${esc(a.label)}</button>`).join(''):'';
  openSheet('Updates',`<p>${esc(S.release?S.release.version+' · '+S.release.channel.toUpperCase():'Manual Install')}</p>${info?`<p>${esc(info.status)}. Changes take effect on the next launch.</p>`:S.release&&S.release.updates?'<p>Install launcher 1.0.3 to show update controls directly here.</p>':''}<div class="nap-menu">${controls}<button onclick="probeSheet()">Two-Phone Check</button></div>`);
}
async function applyUpdateControl(id){
  document.body.classList.add('native-busy');
  try{const r=await request('updateControl',{id});S.release.updateInfo=r.updateInfo;updatesSheet();if(r.message)toast(r.message);}
  catch(e){$('modalError').textContent=e.message;toast(e.message);}
  finally{document.body.classList.remove('native-busy');}
}
function awakeSheet(id=null){
  const a=id?dayPlanning().awake.find(x=>x.id===id):null;
  if(id&&!a){toast('This awake period was removed. Refresh to read the day.');return;}
  window.planningEntryDate=S.date;window.planningBase=S.revisions.planning||null;window.awakeEditId=a?a.id:null;
  openSheet(a?'Edit awake period':'Keep awake',`<p>${esc(napDateNote(S.date))} · Include travel time in the interval if needed.</p><div class="form-grid">${field('Label · optional','awakeLabel','text',a?a.label:'Appointment')}${field('Start','awakeStart','time',a?WW.parts(a.start,S.settings.timezone).time:'')}${field('End','awakeEnd','time',a?WW.parts(a.end,S.settings.timezone).time:'')}</div><p>This reserves awake time; it does not record an actual wake or change actual sleep.</p>${saveButtons('saveAwake()','Save Awake Period')}${a?'<div class="toolbar"><button class="small-btn destructive" onclick="removeAwake()">Remove Awake Period</button></div>':''}`);
}
async function saveAwake(){await act('awakePeriod',{date:window.planningEntryDate,base:window.planningBase,id:window.awakeEditId,label:$('awakeLabel').value,start:$('awakeStart').value,end:$('awakeEnd').value});}
function removeAwake(){confirmRemoval('Remove awake period?','Release this appointment interval and review the resulting proposal.','removeAwake',{date:window.planningEntryDate,base:window.planningBase,id:window.awakeEditId},'Remove Period');}
function pinSheet(ordinal){
  const pin=dayPlanning().pins.find(x=>x.ordinal===ordinal),event=currentPlan&&currentPlan.events.find(e=>e.kind==='nap'&&e.ordinal===ordinal);
  if(!pin&&!event){toast('Refresh to see the current suggestions.');return;}
  if(pin&&ordinal<=S.day.naps.length){openSheet('Review saved pin',`<p>Earlier history changed. Release this old pin, then use the current suggestions to create a new one.</p><button class="small-btn" onclick="releasePinFromList(${esc(JSON.stringify(pin.id))})">Release Old Pin</button>`);return;}
  window.planningEntryDate=S.date;window.planningBase=S.revisions.planning||null;window.pinOrdinal=ordinal;window.pinEditId=pin?pin.id:null;
  const start=pin&&pin.start?WW.parts(pin.start,S.settings.timezone).time:event?WW.parts(event.start,S.settings.timezone).time:'';
  const minutes=pin&&pin.minutes!==null?pin.minutes:event?event.minutes:S.settings.nap.ideal;
  openSheet(`Adjust suggested nap ${ordinal}`,`<p>${esc(napDateNote(S.date))} · Choose a start time, duration or profile.</p><label class="check-row"><input id="pinStartEnabled" type="checkbox" ${!pin||pin.start!==null?'checked':''}>Pin start time</label><div class="form-grid">${field('Start','pinStart','time',start)}</div><label class="check-row"><input id="pinDurationEnabled" type="checkbox" ${pin&&pin.minutes!==null?'checked':''}>Pin duration</label><div class="form-grid">${field('Duration · minutes','pinMinutes','number',minutes)}</div><div class="field"><label for="pinProfile">Nap profile</label><select id="pinProfile">${Object.entries(WW.napProfiles(S.settings)).map(([name,r])=>`<option value="${name}" ${(pin?.profile||event?.profile||'standard')===name?'selected':''}>${name[0].toUpperCase()+name.slice(1)} · ${r.min}–${r.max} min</option>`).join('')}</select></div><label class="check-row"><input id="pinProfileEnabled" type="checkbox" ${pin?.profile?'checked':''}>Pin profile</label>${saveButtons('savePin()','Save Pin')}${pin?'<div class="toolbar"><button class="small-btn" onclick="releaseCurrentPin()">Release This Pin</button></div>':''}`);
}
async function savePin(){if(!$('pinStartEnabled').checked&&!$('pinDurationEnabled').checked&&!$('pinProfileEnabled').checked){$('modalError').textContent='Choose a start, duration or profile to pin, or release the existing pin.';return;}await act('pinNap',{date:window.planningEntryDate,base:window.planningBase,ordinal:window.pinOrdinal,start:$('pinStartEnabled').checked?$('pinStart').value:null,minutes:$('pinDurationEnabled').checked?Number($('pinMinutes').value):null,profile:$('pinProfileEnabled').checked||$('pinDurationEnabled').checked?$('pinProfile').value:null});}
async function releaseCurrentPin(){await act('releasePin',{date:window.planningEntryDate,base:window.planningBase,id:window.pinEditId});}
function planningControls(){
  if(S.day.planningConflict)return planningConflictControls();
  const data=dayPlanning(),pins=futurePins();
  const appointments=data.awake.map(a=>`<div class="constraint-row"><strong>${esc(a.label||'Awake period')}</strong><br>${esc(fmt(a.start))}–${esc(fmt(a.end))}<div class="toolbar"><button class="small-btn" onclick="awakeSheet(${esc(JSON.stringify(a.id))})">Edit Appointment</button></div></div>`).join('');
  const pinRows=pins.map(p=>`<div class="constraint-row">Nap ${p.ordinal} · ${esc([p.start?fmt(p.start)+' start':'',p.minutes!==null?dur(p.minutes)+' duration':'',p.profile||''].filter(Boolean).join(' · '))}<div class="toolbar"><button class="small-btn" onclick="pinSheet(${p.ordinal})">Edit Pin</button><button class="small-btn" onclick="releasePinFromList(${esc(JSON.stringify(p.id))})">Release Pin</button></div></div>`).join('');
  return `<p>${esc(napDateNote(S.date))} · Appointments and nap pins</p>${appointments}${pinRows}${!appointments&&!pinRows?'<p>No active adjustments. Add an appointment using Add, or tap a suggested nap to pin it.</p>':''}${data.awake.length||data.pins.length?'<div class="toolbar"><button class="small-btn" onclick="resetPlanningSheet()">Return to Automatic</button></div>':''}`;
}
function planningSheet(){openSheet('Review Adjustments',planningControls());}
async function releasePinFromList(id){await act('releasePin',{date:S.date,base:S.revisions.planning||null,id});}
function resetPlanningSheet(){confirmRemoval('Return to automatic?','Remove this day’s awake periods and nap pins? Actual sleep, morning wake, bedtime target and shared settings stay saved.','resetPlanning',{date:S.date,base:S.revisions.planning||null},'Clear Adjustments');}
function planningConflictControls(){
  const versions=(S.planningVersions||[]).map(v=>`<div class="constraint-row"><strong>Saved ${esc(fmt(v.at))}</strong><p>${esc(v.value.awake.map(a=>(a.label||'Awake period')+' '+fmt(a.start)+'–'+fmt(a.end)).join('; ')||'No awake periods')}</p><p>${esc(v.value.pins.map(p=>'Nap '+p.ordinal+(p.start?' '+fmt(p.start):'')+(p.minutes!==null?' '+dur(p.minutes):'')).join('; ')||'No pins')}</p><button class="small-btn" onclick="choosePlanningVersion(${esc(JSON.stringify(v.id))})">Use This Version</button></div>`).join('');
  return `<p>Both versions are retained. Choose the appointments and pins to use; actual sleep stays intact. After choosing, add any missing appointment from the other version if needed.</p>${versions}`;
}
function choosePlanningVersion(version){confirmRemoval('Use this plan version?','Use the appointments and pins from this version? Other saved revisions remain in history. Actual sleep and settings are unchanged.','resolvePlanning',{date:S.date,base:S.revisions.planning||null,version},'Use Version');}

let scheduleDraft=null,displayedReview=null,openOptions=null;
function scheduleReview(){
  const approved=S.approved,conflict=!!S.approvalVersions?.length;
  const reasons=conflict?['Both phones saved approvals for this day. Review both schedules and choose one.']:
    approved?WW.approval.changes(S,approved):[];
  const saved=approved?.plan,overdue=approved?WW.approval.overdue(S,approved,clock()):'';
  let draft=null,proposal=null;
  if(!conflict&&(!saved||reasons.length)){
    const key=JSON.stringify([WW.approval.signature(S),S.day,S.settings]);
    if(scheduleDraft?.key!==key){
      const changeTime=Math.min(clock(),S.changedAt||clock());
      const generatedAt=saved&&WW.parts(changeTime,S.settings.timezone).date===S.date?changeTime:clock();
      scheduleDraft={key,generatedAt,options:WW.alternatives(S.day,S.settings,generatedAt)};
    }
    draft=scheduleDraft;
    proposal=draft.options[0];
    const active=S.day.naps.find(n=>n.end===null);
    if(active&&Date.parse(active.expectedEnd)<=clock()){
      proposal={status:'active-overdue',events:[],message:'Expected wake has passed. Update expected wake or record the actual wake.'};
    }
  }
  const expired=!!proposal?.bedtime&&WW.approval.expired(proposal,clock());
  const status=conflict||reasons.length||['blocked','adjust','active-overdue'].includes(proposal?.status)?'Adjustment Needed':
    overdue||expired?'Overdue':saved?'Approved':proposal?.bedtime?'Needs Approval':'';
  displayedReview={saved,reasons,overdue,draft,proposal,status,conflict,expired};
  return displayedReview;
}
function bedtimeTradeoff(plan){
  return plan.deviation?`${dur(Math.abs(plan.deviation))} ${plan.deviation>0?'later':'earlier'} than target`:'Meets bedtime target';
}
function optionCard(plan,label,index=null){
  const rows=plan.events.map((e,i)=>{
    if(e.kind!=='nap')return '';
    return `<li><strong>Nap ${e.ordinal}</strong> · ${fmt(e.start)}–${fmt(e.end)}<br>
      ${dur(e.minutes)} · ${esc(e.profile||'standard')}<br>Previous wake · ${dur(plan.events[i-1].minutes)}</li>`;
  }).join('');
  const count=plan.totalNaps,desired=WW.napCounts(S.settings).target;
  const profiles=plan.events.filter(e=>e.kind==='nap').map(e=>e.profile||'standard');
  const lengths=[...new Set(profiles)].map(name=>`${profiles.filter(p=>p===name).length} ${name}`).join(', ');
  return `<div class="plan-option"><label class="option-label">${index===null?'':`<input type="radio" name="schedule-option" value="${index}" ${index===0?'checked':''}>`}<strong>${esc(label)}</strong></label>
    <div class="option-grid"><div><strong>${count} ${count===1?'nap':'naps'} · ${fmt(plan.bedtime)}</strong>${rows?`<ul class="option-naps">${rows}</ul>`:'<p>No remaining naps</p>'}</div>
    <div><strong>Tradeoffs</strong><ul><li>${esc(bedtimeTradeoff(plan))}</li><li>${count===desired?'Meets nap target':`${Math.abs(count-desired)} ${count<desired?'below':'above'} nap target`}</li>${lengths?`<li>Remaining naps · ${esc(lengths)}</li>`:''}<li>Final wake · ${dur(plan.events[plan.events.length-1].minutes)}</li></ul></div></div></div>`;
}
function reviewSchedule(){
  const review=displayedReview;
  if(!review?.proposal?.bedtime||review.expired)return;
  showOptions(review.draft.options,review.draft.generatedAt,false);
}
function recalculate(){
  const generatedAt=clock();
  try{showOptions(WW.alternatives(S.day,S.settings,generatedAt,true),generatedAt,true);}
  catch(e){openSheet('Adjustment Needed',`<p>${esc(e.message)}</p>`);}
}
function showOptions(options,generatedAt,compare){
  const available=options.filter(p=>p.bedtime);
  openOptions={date:S.date,signature:WW.approval.signature(S),generatedAt,compare};
  const review=displayedReview;
  const impact=review?.saved?`<p>Approved bedtime · ${fmt(review.saved.bedtime)} · Target ${fmt(WW.wall(S.date,S.day.bedtime||S.settings.bedtime,S.settings.timezone))}</p>`:'';
  const why=review?.reasons.length?`<p>${esc(review.reasons.join(' '))}</p>`:'';
  if(!available.length){
    openSheet('Adjustment Needed',`${why}${impact}<p>${esc(options[0].message)}</p><div class="toolbar"><button class="small-btn" onclick="planningSheet()">Review Adjustments</button><button class="small-btn" onclick="settingsSheet()">Settings</button></div>`);
    return;
  }
  const canApprove=!(S.conflicts||[]).length;
  openSheet(compare?'Schedule Alternatives':'Review Schedule',why+impact+
    available.map((p,i)=>optionCard(p,i===0?'Recommended':`Option ${i+1}`,i)).join('')+
    `<div class="sheet-actions"><button onclick="closeSheet()">${review?.saved?'Keep Current':'Cancel'}</button>
    <button class="save" onclick="approveOption()" ${canApprove?'':'disabled'}>${compare?'Approve Selected':'Approve Plan'}</button></div>
    <div class="toolbar"><button class="small-btn" onclick="recalculate()">${compare?'Recalculate':'View Alternatives'}</button><button class="small-btn" onclick="reloadSchedule()">Refresh Shared Day</button></div>
    ${canApprove?'':'<p>Refresh and review conflicting edits before approving.</p>'}`);
}
async function reloadSchedule(){await act('load',{date:S.date});}
async function approveOption(){
  const selected=document.querySelector('input[name="schedule-option"]:checked');
  if(selected&&openOptions)await act('approvePlan',{...openOptions,index:Number(selected.value)});
}
function approvalConflictSheet(){
  const signature=WW.approval.signature(S),date=S.date;
  window.approvalConflict={signature,date};
  openSheet('Review Approvals','<p>Two approvals arrived for this day. Compare them and choose the schedule to keep.</p>'+
    S.approvalVersions.map((v,i)=>optionCard(v.value.plan,`Approval ${i+1} · ${fmt(v.at)}`)+
      `<button class="small-btn" onclick="resolveApproval(${esc(JSON.stringify(v.id))})">Use This Approval</button>`).join(''));
}
async function resolveApproval(version){await act('resolveApproval',{...window.approvalConflict,version});}

try{document.documentElement.dataset.theme=localStorage.getItem('ww_appearance')||'dark';}catch{}
render();setInterval(render,60000);
if(S.imported){if(S.imported.error){setTimeout(()=>{napSheet();$('modalError').textContent=S.imported.error;},200);}else setTimeout(()=>S.imported.kind==='active'?activeNapSheet(null,S.imported):napSheet(null,S.imported),200);}
