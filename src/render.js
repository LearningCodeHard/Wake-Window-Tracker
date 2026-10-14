/* Quiet timeline and V2 planning controls. Existing actual-event forms stay in ui.js. */
function dayPlanning(){return S.day.planning||{awake:[],pins:[]};}
function futurePins(){return dayPlanning().pins.filter(p=>p.ordinal>S.day.naps.length||p.anchors.some((id,i)=>!S.day.naps[i]||WW.napIdentity(S.day.naps[i])!==id));}
function eventRow(title,sub,start,end,click='',classes='',tag=''){
  return `<div class="event ${classes}"><div class="event-title">${esc(title)}${tag?` <span class="tag">${esc(tag)}</span>`:''}</div><button${click?` onclick="${esc(click)}"`:' disabled'}><span class="event-time">${esc(fmt(start))}${end?'–'+esc(fmt(end)):''}</span><span class="event-sub">${esc(sub)}</span></button></div>`;
}
function render(){
  $('viewDate').value=S.date;$('dateText').textContent=new Intl.DateTimeFormat('en-US',{timeZone:S.settings.timezone,weekday:'long',month:'long',day:'numeric'}).format(new Date(WW.wall(S.date,'12:00',S.settings.timezone)));
  $('appTitle').textContent=S.release&&S.release.channel==='test'?'Wake Window TEST':'Wake Window';
  $('demoAdvance').hidden=S.mode!=='demo';
  const d=S.day,completed=d.naps.filter(n=>n.end!==null),active=d.naps.find(n=>n.end===null),historical=S.date!==WW.parts(clock(),S.settings.timezone).date;
  const total=Math.round(completed.reduce((a,n)=>a+(Date.parse(n.end)-Date.parse(n.start))/60000,0));
  let p;try{p=WW.plan(d,S.settings,clock());}catch(e){p={status:'error',events:[],message:e.message,notes:[]};}currentPlan=p;
  const warnings=[...(S.warnings||[]),...(p.notes||[])];if((S.conflicts||[]).length)warnings.push('Conflicting edits were found. Review the displayed entries and save again to acknowledge the latest revision.');
  if(historical)warnings.push('Viewing another date. Actual records and saved appointments are shown; future suggestions are hidden.');
  $('notice').hidden=!warnings.length;$('notice').textContent=warnings.join(' ');
  $('endActive').hidden=!active||historical;
  const sleeping=!!active&&!historical;
  $('currentState').textContent=historical?'Recorded day':sleeping?`Sleeping · ${dur(Math.max(0,Math.floor((clock()-Date.parse(active.start))/60000)))}`:Number.isFinite(p.anchor)?`Awake · ${dur(Math.max(0,Math.floor((clock()-p.anchor)/60000)))}`:'Ready to plan';
  $('currentSince').textContent=sleeping?`Since ${fmt(active.start)}`:Number.isFinite(p.anchor)&&!historical?`Since ${fmt(p.anchor)}`:'Add a morning wake or nap';
  $('timelineTitle').textContent=historical?'Recorded day':'Rest of today';$('timelineNote').textContent=historical?'Actual':p.status==='blocked'?'Needs review':'Suggested';
  const events=[],earlier=[];
  if(d.morning)earlier.push(eventRow('Morning wake','Actual · tap to edit',d.morning,null,'morningSheet()','actual'));
  d.naps.forEach((n,i)=>{if(n.end===null){if(!historical)events.push({at:Date.parse(n.expectedEnd),html:eventRow('Expected wake','Current nap · estimated end',n.expectedEnd,null,`activeNapSheet(${i})`,'current')});else earlier.push(eventRow('Unfinished nap','Actual start · estimated end',n.start,n.expectedEnd,`activeNapSheet(${i})`,'actual'));}else earlier.push(eventRow(`Recorded nap ${i+1}`,`${dur(Math.round((Date.parse(n.end)-Date.parse(n.start))/60000))} · actual · tap to edit`,n.start,n.end,`napSheet(${i})`,'actual'));});
  for(const a of dayPlanning().awake){const html=eventRow(a.label||'Awake period','No planned sleep during this time',a.start,a.end,`awakeSheet(${JSON.stringify(a.id)})`,'appointment','Keep awake');if(!historical&&Date.parse(a.end)>clock())events.push({at:Date.parse(a.start),html});else earlier.push(html);}
  if(!historical){
    let ordinal=d.naps.length,next=true;
    p.events.forEach((e,i)=>{if(e.kind!=='nap')return;ordinal++;e.ordinal=ordinal;const before=p.events[i-1];const pin=dayPlanning().pins.find(x=>x.ordinal===ordinal);
      events.push({at:e.start,html:eventRow(`Suggested nap ${ordinal}`,`${dur(e.minutes)} sleep${before?' · '+dur(before.minutes)+' awake before':''}`,e.start,e.end,`pinSheet(${ordinal})`,next?'next':'',pin?'Pinned':'')});next=false;});
    if(p.bedtime)events.push({at:p.bedtime,html:eventRow('Bedtime',p.deviation?`${Math.abs(p.deviation)}m ${p.deviation>0?'later':'earlier'} than target ${fmt(p.target)}`:`On target${p.events.length?' · '+dur(p.events[p.events.length-1].minutes)+' awake before':''}`,p.bedtime,null,'bedtimeSheet()')});
    else events.push({at:Date.parse(WW.wall(S.date,d.bedtime||S.settings.bedtime,S.settings.timezone)),html:eventRow('Bedtime target',p.status==='blocked'||p.status==='active-overdue'?'Planning paused · review below':'Choose your target for this day',WW.wall(S.date,d.bedtime||S.settings.bedtime,S.settings.timezone),null,'bedtimeSheet()')});
  }
  $('timeline').innerHTML=historical?earlier.join('')||'<p class="empty">No recorded events.</p>':events.sort((a,b)=>a.at-b.at).map(e=>e.html).join('');
  $('earlierTimeline').innerHTML=earlier.join('')||'<p class="empty">No earlier records yet.</p>';$('earlierDetails').hidden=historical;
  $('napTotal').textContent=`${completed.length} completed · ${dur(total)}`;
  const attention=['blocked','adjust','overdue','active-overdue','error'].includes(p.status)&&!historical;
  $('guidance').hidden=!attention;$('guidanceTitle').textContent=p.status==='active-overdue'?'Update expected wake':p.status==='blocked'?'Plan needs an adjustment':p.status==='adjust'?'Bedtime outlook':'Planning status';$('guidanceText').textContent=p.message||'';
  const release=S.release?`${S.release.version} · ${S.release.channel.toUpperCase()} · `:'2.0.3 · Manual · ';
  $('saveState').textContent=release+(S.mode==='demo'?`Demo only · clock ${fmt(clock())} · no shared writes`:`${S.release&&S.release.channel==='test'?'Test folder · ':''}Shared files read on this phone at ${fmt(S.checkedAt)}.${S.lastSavedAt?' Last local save '+fmt(S.lastSavedAt)+'.':''} Refresh the other phone to read shared changes.`);
  $('updatesButton').hidden=!(S.release&&S.release.updates);
  $('operationState').textContent=lastOperation;
}
function addSheet(){openSheet('Add to today',`<div class="nap-menu"><button onclick="awakeSheet()">Keep awake · appointment</button><button onclick="napAction()">Start or log nap</button><button onclick="morningSheet()">Morning wake</button></div>`);}
function infoSheet(){openSheet('Plan details',`<p>${esc(currentPlan&&currentPlan.message||'Enter an actual wake or nap to begin.')}</p><p>Suggestions use your configured nap and wake ranges. Actual times always win. Active naps use an editable expected wake.</p><div class="toolbar"><button class="small-btn" onclick="bedtimeSheet()">Change bedtime</button><button class="small-btn" onclick="probeSheet()">Two-phone check</button></div>`);}
function awakeSheet(id=null){
  const a=id?dayPlanning().awake.find(x=>x.id===id):null;
  if(id&&!a){toast('This awake period was removed. Refresh to read the day.');return;}
  window.planningEntryDate=S.date;window.planningBase=S.revisions.planning||null;window.awakeEditId=a?a.id:null;
  openSheet(a?'Edit awake period':'Keep awake',`<p>${esc(napDateNote(S.date))} · Include travel time in the interval if needed.</p><div class="form-grid">${field('Label · optional','awakeLabel','text',a?a.label:'Appointment')}${field('Start','awakeStart','time',a?WW.parts(a.start,S.settings.timezone).time:'')}${field('End','awakeEnd','time',a?WW.parts(a.end,S.settings.timezone).time:'')}</div><p>This reserves awake time; it does not record an actual wake or change actual sleep.</p>${saveButtons('saveAwake()','Save awake period')}${a?'<div class="toolbar"><button class="small-btn destructive" onclick="removeAwake()">Remove awake period</button></div>':''}`);
}
async function saveAwake(){await act('awakePeriod',{date:window.planningEntryDate,base:window.planningBase,id:window.awakeEditId,label:$('awakeLabel').value,start:$('awakeStart').value,end:$('awakeEnd').value});}
function removeAwake(){confirmRemoval('Remove awake period?','Release this appointment interval and recalculate the remaining schedule.','removeAwake',{date:window.planningEntryDate,base:window.planningBase,id:window.awakeEditId},'Remove period');}
function pinSheet(ordinal){
  const pin=dayPlanning().pins.find(x=>x.ordinal===ordinal),event=currentPlan&&currentPlan.events.find(e=>e.kind==='nap'&&e.ordinal===ordinal);
  if(!pin&&!event){toast('Refresh to see the current suggestions.');return;}
  if(pin&&ordinal<=S.day.naps.length){openSheet('Review saved pin',`<p>Earlier history changed. Release this old pin, then use the current suggestions to create a new one.</p><button class="small-btn" onclick="releasePinFromList(${esc(JSON.stringify(pin.id))})">Release old pin</button>`);return;}
  window.planningEntryDate=S.date;window.planningBase=S.revisions.planning||null;window.pinOrdinal=ordinal;window.pinEditId=pin?pin.id:null;
  const start=pin&&pin.start?WW.parts(pin.start,S.settings.timezone).time:event?WW.parts(event.start,S.settings.timezone).time:'';
  const minutes=pin&&pin.minutes!==null?pin.minutes:event?event.minutes:S.settings.nap.ideal;
  openSheet(`Adjust suggested nap ${ordinal}`,`<p>${esc(napDateNote(S.date))} · Pin start, duration, or both. Other parts of the day stay automatic.</p><label class="check-row"><input id="pinStartEnabled" type="checkbox" ${!pin||pin.start!==null?'checked':''}>Pin start time</label><div class="form-grid">${field('Start','pinStart','time',start)}</div><label class="check-row"><input id="pinDurationEnabled" type="checkbox" ${pin&&pin.minutes!==null?'checked':''}>Pin duration</label><div class="form-grid">${field('Duration · minutes','pinMinutes','number',minutes)}</div><p>Duration stays within ${S.settings.nap.min}–${S.settings.nap.max} minutes. If a pin cannot fit, the day will show a conflict rather than quietly changing it.</p>${saveButtons('savePin()','Save pin')}${pin?'<div class="toolbar"><button class="small-btn" onclick="releaseCurrentPin()">Release this pin</button></div>':''}`);
}
async function savePin(){if(!$('pinStartEnabled').checked&&!$('pinDurationEnabled').checked){$('modalError').textContent='Choose a start or duration to pin, or release the existing pin.';return;}await act('pinNap',{date:window.planningEntryDate,base:window.planningBase,ordinal:window.pinOrdinal,start:$('pinStartEnabled').checked?$('pinStart').value:null,minutes:$('pinDurationEnabled').checked?Number($('pinMinutes').value):null});}
async function releaseCurrentPin(){await act('releasePin',{date:window.planningEntryDate,base:window.planningBase,id:window.pinEditId});}
function planningSheet(){
  if(S.day.planningConflict){planningConflictSheet();return;}
  const data=dayPlanning(),pins=futurePins();
  const appointments=data.awake.map(a=>`<div class="constraint-row"><strong>${esc(a.label||'Awake period')}</strong><br>${esc(fmt(a.start))}–${esc(fmt(a.end))}<div class="toolbar"><button class="small-btn" onclick="awakeSheet(${esc(JSON.stringify(a.id))})">Edit</button></div></div>`).join('');
  const pinRows=pins.map(p=>`<div class="constraint-row">Nap ${p.ordinal} · ${esc([p.start?fmt(p.start)+' start':'',p.minutes!==null?dur(p.minutes)+' duration':''].filter(Boolean).join(' · '))}<div class="toolbar"><button class="small-btn" onclick="pinSheet(${p.ordinal})">Edit pin</button><button class="small-btn" onclick="releasePinFromList(${esc(JSON.stringify(p.id))})">Release</button></div></div>`).join('');
  openSheet('Day adjustments',`<p>${esc(napDateNote(S.date))} · Shared planning inputs, separate from actual sleep.</p>${appointments}${pinRows}${!appointments&&!pinRows?'<p>No active adjustments. The planner is automatic.</p>':''}<div class="toolbar"><button class="small-btn" onclick="awakeSheet()">Add awake period</button>${data.awake.length||data.pins.length?'<button class="small-btn" onclick="resetPlanningSheet()">Return to automatic</button>':''}</div>`);
}
async function releasePinFromList(id){await act('releasePin',{date:S.date,base:S.revisions.planning||null,id});}
function resetPlanningSheet(){confirmRemoval('Return to automatic?','Remove this day’s awake periods and nap pins? Actual sleep, morning wake, bedtime target and shared settings stay saved.','resetPlanning',{date:S.date,base:S.revisions.planning||null},'Clear adjustments');}
function planningConflictSheet(){
  const versions=(S.planningVersions||[]).map(v=>`<div class="constraint-row"><strong>Saved ${esc(fmt(v.at))}</strong><p>${esc(v.value.awake.map(a=>(a.label||'Awake period')+' '+fmt(a.start)+'–'+fmt(a.end)).join('; ')||'No awake periods')}</p><p>${esc(v.value.pins.map(p=>'Nap '+p.ordinal+(p.start?' '+fmt(p.start):'')+(p.minutes!==null?' '+dur(p.minutes):'')).join('; ')||'No pins')}</p><button class="small-btn" onclick="choosePlanningVersion(${esc(JSON.stringify(v.id))})">Use this version</button></div>`).join('');
  openSheet('Review shared plan versions',`<p>Both versions are retained. Choose the appointments and pins to use; actual sleep stays intact. After choosing, add any missing appointment from the other version if needed.</p>${versions}`);
}
function choosePlanningVersion(version){confirmRemoval('Use this plan version?','Use the appointments and pins from this version? Other saved revisions remain in history. Actual sleep and settings are unchanged.','resolvePlanning',{date:S.date,base:S.revisions.planning||null,version},'Use version');}
