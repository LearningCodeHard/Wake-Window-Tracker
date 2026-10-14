// DOM-stub execution checks. These do NOT verify WebKit layout or rendering.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'preview.html'),'utf8');
function screen(){
 const nodes=new Map();
 function node(id){if(nodes.has(id))return nodes.get(id);const classes=new Set();const n={id,value:'',textContent:'',hidden:false,style:{},dataset:{},focus(){},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)}};let content='';Object.defineProperty(n,'innerHTML',{get:()=>content,set:s=>{content=s;register(s);}});nodes.set(id,n);return n;}
 function register(s){s=s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');for(const m of s.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const n=node(m[1]);const v=m[0].match(/\bvalue="([^"]*)"/);if(v)n.value=v[1];}for(const m of s.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const options=[...m[2].matchAll(/<option value="([^"]*)"([^>]*)>/g)];node(m[1]).value=(options.find(o=>/\bselected\b/.test(o[2]))||options[0])[1];}}
 register(html);
 const document={getElementById:id=>node(id),documentElement:{dataset:{}},body:node('body'),activeElement:null,addEventListener(){}};
 const localStorage={getItem:()=>null,setItem(){}};
 const context={document,localStorage,Intl,Date,console,setInterval(){},setTimeout:f=>f(),confirm:()=>{throw Error('Browser confirmation is unavailable in this host');}};context.window=context;vm.createContext(context);
 for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
 return {context,nodes,run:s=>vm.runInContext(s,context)};
}
test('demo UI presents the exact noon schedule and bedtime once',()=>{const s=screen();const t=s.nodes.get('timeline').innerHTML;assert.match(t,/2:00 PM/);assert.match(t,/5:00 PM/);assert.equal((t.match(/8:00 PM/g)||[]).length,1);assert.match(s.nodes.get('guidanceText').textContent,/boundary/);});
test('test identity stays explicit in demo and folder modes without a demo banner',()=>{
 const s=screen();s.run("S.release={channel:'test',version:'2.0.3'};render()");assert.equal(s.nodes.get('appTitle').textContent,'Wake Window TEST');assert.match(s.nodes.get('saveState').textContent,/TEST.*Demo only.*clock 12:00 PM.*no shared writes/);assert.doesNotMatch(html,/id="demoBanner"/);
 s.run("S.now+=90*60000;render()");assert.match(s.nodes.get('saveState').textContent,/clock 1:30 PM/);
 s.run("S.mode='live';render()");assert.equal(s.nodes.get('appTitle').textContent,'Wake Window TEST');assert.match(s.nodes.get('saveState').textContent,/TEST.*Test folder/);
 s.run("S.release.channel='production';render()");assert.equal(s.nodes.get('appTitle').textContent,'Wake Window');assert.doesNotMatch(s.nodes.get('saveState').textContent,/TEST|Demo only|Test folder/);
});
test('appointment form sends selected day and captured planning revision',async()=>{
 const s=screen();s.run("S.revisions.planning='plan-r1';awakeSheet()");s.nodes.get('awakeStart').value='14:00';s.nodes.get('awakeEnd').value='14:30';const promise=s.run('saveAwake()'),q=s.context.__queue.shift();assert.equal(q.action,'awakePeriod');assert.equal(q.data.base,'plan-r1');assert.equal(q.data.date,'2026-10-05');assert.equal(q.data.start,'14:00');s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('pin form can save duration only without submitting an estimated start',async()=>{
 const s=screen();s.run('pinSheet(2)');s.nodes.get('pinStartEnabled').checked=false;s.nodes.get('pinDurationEnabled').checked=true;s.nodes.get('pinMinutes').value='75';const promise=s.run('savePin()'),q=s.context.__queue.shift();assert.equal(q.action,'pinNap');assert.equal(q.data.ordinal,2);assert.equal(q.data.start,null);assert.equal(q.data.minutes,75);s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('empty pin selection requires a choice and does not issue a write',async()=>{
 const s=screen();s.run('pinSheet(2)');s.nodes.get('pinStartEnabled').checked=false;s.nodes.get('pinDurationEnabled').checked=false;await s.run('savePin()');assert.equal(s.context.__queue.length,0);assert.match(s.nodes.get('modalError').textContent,/Choose/);
});
test('reset planning requires in-dashboard confirmation and preserves actual state',async()=>{
 const s=screen();s.run("S.revisions.planning='p';resetPlanningSheet()");assert.equal(s.context.__queue.length,0);assert.match(s.nodes.get('modalBody').innerHTML,/Actual sleep/);const promise=s.run('confirmDeletion()'),q=s.context.__queue.shift();assert.equal(q.action,'resetPlanning');assert.equal(q.data.base,'p');s.context.receive({id:q.id,message:'Cleared'});await promise;assert.equal(s.run('S.day.naps.length'),1);
});
test('failed save retains entered values and shows explicit unconfirmed state',async()=>{
 const s=screen();s.run('awakeSheet()');s.nodes.get('awakeStart').value='14:00';s.nodes.get('awakeEnd').value='14:30';const promise=s.run('saveAwake()'),q=s.context.__queue.shift();assert.match(s.nodes.get('operationState').textContent,/Saving/);s.context.receive({id:q.id,error:'iCloud read failed'});await promise;assert.equal(s.nodes.get('awakeStart').value,'14:00');assert.equal(s.nodes.get('modal').classList.contains('open'),true);assert.match(s.nodes.get('operationState').textContent,/Not confirmed/);assert.equal(s.nodes.get('body').classList.contains('native-busy'),false);
});
test('read status does not claim the other phone received a change',()=>{
 const s=screen();s.run("S.mode='live';S.lastSavedAt=Date.now();render()");assert.match(s.nodes.get('saveState').textContent,/Refresh the other phone/);assert.match(s.nodes.get('saveState').textContent,/Last local save/);assert.doesNotMatch(s.nodes.get('saveState').textContent,/Both phones synced/);
});
test('a confirmed save followed by a failed refresh is reported without asking for another save',async()=>{
 const s=screen();s.run('awakeSheet()');s.nodes.get('awakeStart').value='14:00';s.nodes.get('awakeEnd').value='14:30';const promise=s.run('saveAwake()'),q=s.context.__queue.shift();s.context.receive({id:q.id,error:'Read failed',saveConfirmed:true});await promise;assert.match(s.nodes.get('operationState').textContent,/Save confirmed locally/);assert.doesNotMatch(s.nodes.get('operationState').textContent,/^Not confirmed/);assert.equal(s.nodes.get('modal').classList.contains('open'),true);
});
test('new appointments appear inline and unsafe labels are escaped',()=>{
 const s=screen();s.run("S.day.planning={awake:[{id:'a',label:'<script>x</script>',start:WW.wall(S.date,'14:30',S.settings.timezone),end:WW.wall(S.date,'15:00',S.settings.timezone)}],pins:[]};render()");assert.match(s.nodes.get('timeline').innerHTML,/Keep awake/);assert.match(s.nodes.get('timeline').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(s.nodes.get('timeline').innerHTML,/<script>/);
});
test('past records are grouped separately from future suggestions',()=>{
 const s=screen();assert.match(s.nodes.get('earlierTimeline').innerHTML,/Recorded nap/);assert.doesNotMatch(s.nodes.get('timeline').innerHTML,/Recorded nap/);
});
test('concurrent shared plan versions are presented and choosing requires confirmation',()=>{
 const s=screen();s.run("S.day.planningConflict=true;S.planningVersions=[{id:'one',at:'2026-10-05T16:00:00Z',value:{awake:[{id:'a',label:'Parent A appointment',start:WW.wall(S.date,'14:00',S.settings.timezone),end:WW.wall(S.date,'14:30',S.settings.timezone)}],pins:[]}},{id:'two',at:'2026-10-05T16:01:00Z',value:{awake:[{id:'b',label:'Parent B appointment',start:WW.wall(S.date,'15:00',S.settings.timezone),end:WW.wall(S.date,'15:30',S.settings.timezone)}],pins:[]}}];render();planningSheet()");assert.match(s.nodes.get('modalBody').innerHTML,/Parent A appointment/);assert.match(s.nodes.get('modalBody').innerHTML,/Parent B appointment/);s.run("choosePlanningVersion('one')");assert.equal(s.context.__queue.length,0);assert.equal(s.context.pendingDeletion.action,'resolvePlanning');
});
test('settings bottom sheet includes editable duration ranges',()=>{const s=screen();s.run('settingsSheet()');assert.equal(s.nodes.get('nap_min').value,'60');assert.equal(s.nodes.get('final_max').value,'180');assert.match(s.nodes.get('modalBody').innerHTML,/Save/);});
test('nap editor preserves imported time values',()=>{const s=screen();s.run('napSheet(0)');assert.equal(s.nodes.get('napStart').value,'11:00');assert.equal(s.nodes.get('napEnd').value,'12:00');});
test('bedtime edit sends the daily override through the bridge',async()=>{const s=screen();s.run('bedtimeSheet()');s.nodes.get('todayBed').value='19:30';const promise=s.run('saveBedtime()');const q=s.context.__queue.shift();assert.equal(q.action,'bedtime');assert.equal(q.data.time,'19:30');s.context.receive({id:q.id,message:'Saved'});await promise;assert.equal(s.nodes.get('modal').classList.contains('open'),false);});
test('invalid actual data displays an actionable error without crashing UI',()=>{const s=screen();s.run("S.day.naps[0].end='2026-10-05T14:00:00Z';render()");assert.match(s.nodes.get('guidanceText').textContent,/after/);});
test('manual save preserves date, times and explicit-entry source',async()=>{const s=screen();s.run('napSheet()');s.nodes.get('napStart').value='08:00';s.nodes.get('napEnd').value='09:00';const promise=s.run('saveNap()');const q=s.context.__queue.shift();assert.equal(q.data.date,'2026-10-05');assert.equal(q.data.start,'08:00');assert.equal(q.data.imported,false);s.context.receive({id:q.id,error:'Test save refused'});await promise;assert.match(s.nodes.get('modalError').textContent,/refused/);});
function asleep(s){s.run("S.day.naps.push({start:WW.wall(S.date,'12:05',S.settings.timezone),end:null,expectedEnd:WW.wall(S.date,'13:30',S.settings.timezone),entity:'nap:2026-10-05:active',revision:'r1'});S.now=Date.parse(WW.wall(S.date,'12:46',S.settings.timezone));render()");}
test('active dashboard shows asleep, accurate elapsed, and estimated wake with no completed duration inflation',()=>{
 const s=screen();asleep(s);assert.equal(s.nodes.get('currentState').textContent,'Sleeping · 41m');assert.match(s.nodes.get('timeline').innerHTML,/1:30 PM/);assert.match(s.nodes.get('napTotal').textContent,/1 completed · 1h/);assert.match(s.nodes.get('timeline').innerHTML,/estimated end/);assert.equal(s.nodes.get('endActive').hidden,false);
});
test('active sheet preserves custom expected wake and sends separate estimated timestamp',async()=>{
 const s=screen();asleep(s);s.run('activeNapSheet(1)');assert.equal(s.nodes.get('napExpected').value,'13:30');const promise=s.run('saveActiveNap()'),q=s.context.__queue.shift();assert.equal(q.action,'activeNap');assert.equal(q.data.expectedEnd,'13:30');assert.equal(q.data.entity,'nap:2026-10-05:active');s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('actual wake editor defaults to current time rather than the expected wake',()=>{
 const s=screen();asleep(s);s.run('finishNapSheet(1)');assert.equal(s.nodes.get('napEnd').value,'12:46');assert.equal(s.nodes.get('modalTitle').textContent,'Record actual wake');
});
test('end nap now sends actual clock time and existing revision',async()=>{
 const s=screen();asleep(s);const promise=s.run('endNapNow(1)'),q=s.context.__queue.shift();assert.equal(q.action,'nap');assert.equal(q.data.end,'12:46');assert.equal(q.data.base,'r1');s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('missing OCR end requires confirmation before active import can be saved',async()=>{
 const s=screen();s.run("activeNapSheet(null,{start:WW.wall(S.date,'11:15',S.settings.timezone),end:null,expectedEnd:WW.wall(S.date,'12:30',S.settings.timezone),messages:[],needsActiveConfirmation:true})");await s.run('saveActiveNap()');assert.equal(s.context.__queue.length,0);assert.match(s.nodes.get('modalError').textContent,/Confirm/);s.nodes.get('confirmActive').checked=true;const promise=s.run('saveActiveNap()'),q=s.context.__queue.shift();assert.equal(q.action,'activeNap');s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('expected wake passing leaves asleep status and asks for estimate update',()=>{
 const s=screen();asleep(s);s.run("S.now=Date.parse(WW.wall(S.date,'13:45',S.settings.timezone));render()");assert.match(s.nodes.get('currentState').textContent,/Sleeping/);assert.equal(s.nodes.get('guidanceTitle').textContent,'Update expected wake');assert.match(s.nodes.get('timeline').innerHTML,/Planning paused/);
});
test('repeated active import without timer goal preserves a custom expected wake',()=>{
 const s=screen();asleep(s);s.run("activeNapSheet(null,{start:WW.wall(S.date,'12:05',S.settings.timezone),end:null,expectedEnd:WW.wall(S.date,'13:20',S.settings.timezone),estimateSource:'preferred',messages:[]})");assert.equal(s.nodes.get('napExpected').value,'13:30');
});
test('deleting a completed nap asks inside the dashboard and cancel leaves it recorded',()=>{
 const s=screen();s.run('napSheet(0);deleteNap()');assert.equal(s.nodes.get('modalTitle').textContent,'Delete nap?');assert.equal(s.context.__queue.length,0);assert.match(s.nodes.get('modalBody').innerHTML,/Keep entry/);s.run('closeSheet()');assert.equal(s.run('S.day.naps.length'),1);assert.equal(s.context.pendingDeletion,null);
});
test('confirming deletion sends the saved revision and refreshes the timeline after native save',async()=>{
 const s=screen();s.run('napSheet(0);deleteNap()');const promise=s.run('confirmDeletion()'),q=s.context.__queue.shift();assert.equal(q.action,'deleteNap');assert.equal(q.data.entity,'nap:2026-10-05:sample');assert.equal(q.data.base,'demo');assert.equal(q.data.date,'2026-10-05');const snapshot=s.run('JSON.parse(JSON.stringify(S))');snapshot.day.naps=[];s.context.receive({id:q.id,message:'Nap deleted',snapshot});await promise;assert.doesNotMatch(s.nodes.get('timeline').innerHTML,/Recorded nap/);assert.equal(s.nodes.get('napTotal').textContent,'0 completed · 0m');assert.equal(s.nodes.get('modal').classList.contains('open'),false);
});
test('active nap cancellation removes the active entity only after explicit confirmation',async()=>{
 const s=screen();asleep(s);s.run('activeNapSheet(1);deleteNap()');assert.equal(s.context.__queue.length,0);const promise=s.run('confirmDeletion()'),q=s.context.__queue.shift();assert.equal(q.data.entity,'nap:2026-10-05:active');assert.equal(q.data.base,'r1');const snapshot=s.run('JSON.parse(JSON.stringify(S))');snapshot.day.naps.pop();s.context.receive({id:q.id,message:'Nap deleted',snapshot});await promise;assert.equal(s.nodes.get('endActive').hidden,true);assert.doesNotMatch(s.nodes.get('timeline').innerHTML,/Current nap/);
});
test('stale deletion remains visible and does not pretend the nap was removed',async()=>{
 const s=screen();s.run('napSheet(0);deleteNap()');const promise=s.run('confirmDeletion()'),q=s.context.__queue.shift();s.context.receive({id:q.id,error:'This entry changed on another phone. Refresh and try again.'});await promise;assert.match(s.nodes.get('modalError').textContent,/another phone/);assert.equal(s.nodes.get('modal').classList.contains('open'),true);assert.equal(s.run('S.day.naps.length'),1);
});
test('unsaved nap has no delete button or deletion request',()=>{
 const s=screen();s.run('napSheet()');assert.doesNotMatch(s.nodes.get('modalBody').innerHTML,/Delete this nap/);s.run('deleteNap()');assert.equal(s.context.__queue.length,0);assert.match(s.nodes.get('toast').textContent,/not been saved/);
});
test('morning wake removal also works without host browser dialogs',async()=>{
 const s=screen();s.run("S.day.morning=WW.wall(S.date,'07:00',S.settings.timezone);S.revisions.morning='morning-r1';morningSheet();removeMorning()");assert.equal(s.context.__queue.length,0);const promise=s.run('confirmDeletion()'),q=s.context.__queue.shift();assert.equal(q.action,'morning');assert.equal(q.data.time,null);assert.equal(q.data.base,'morning-r1');s.context.receive({id:q.id,message:'Removed'});await promise;
});
test('all clock-time forms use single native fields while record dates remain automatic',()=>{
 const s=screen();for(const open of ['napSheet()','activeNapSheet()','napSheet(0)','morningSheet()','awakeSheet()','pinSheet(2)','bedtimeSheet()','settingsSheet()']){s.run(open);const body=s.nodes.get('modalBody').innerHTML;assert.doesNotMatch(body,/id="napDate"|type="date"|<select|type="hidden"/);assert.match(body,/type="time" step="60"/);}assert.match(html,/type="date" id="viewDate"/);
});
test('native fields initialize imported exact minutes and PM correctly',()=>{
 const s=screen();s.run("napSheet(null,{start:WW.wall(S.date,'13:07',S.settings.timezone),end:WW.wall(S.date,'14:59',S.settings.timezone),messages:[]})");assert.equal(s.nodes.get('napStart').value,'13:07');assert.equal(s.nodes.get('napEnd').value,'14:59');
});
test('native time changes preserve exact submitted values including midnight and noon',async()=>{
 const s=screen();for(const value of ['00:00','12:00','13:07','23:59','']){s.run('napSheet()');s.nodes.get('napStart').value=value;const promise=s.run('saveNap()'),q=s.context.__queue.shift();assert.equal(q.data.start,value);s.context.receive({id:q.id,message:'Saved'});await promise;}
});
test('new manual nap saves today even while dashboard is viewing a previous day',async()=>{
 const s=screen();s.run("S.date='2026-10-04';S.day={date:S.date,morning:null,bedtime:null,naps:[]};render();napSheet()");assert.match(s.nodes.get('modalBody').innerHTML,/Today/);s.nodes.get('napStart').value='08:03';const promise=s.run('saveNap()'),q=s.context.__queue.shift();assert.equal(q.data.date,'2026-10-05');assert.equal(q.data.start,'08:03');assert.equal(q.data.end,'12:00');s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('editing a historical record retains its original day without a date field',async()=>{
 const s=screen();s.run("S.date='2026-10-04';S.day.naps=[{start:WW.wall(S.date,'08:00',S.settings.timezone),end:WW.wall(S.date,'09:00',S.settings.timezone),entity:'nap:2026-10-04:old',revision:'old-r1'}];napSheet(0)");assert.match(s.nodes.get('modalBody').innerHTML,/Oct 4, 2026/);const promise=s.run('saveNap()'),q=s.context.__queue.shift();assert.equal(q.data.date,'2026-10-04');assert.equal(q.data.entity,'nap:2026-10-04:old');assert.equal(q.data.base,'old-r1');s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('new active nap uses today and native start changes update expected wake',async()=>{
 const s=screen();s.run("S.date='2026-10-04';S.day={date:S.date,morning:null,bedtime:null,naps:[]};activeNapSheet()");assert.equal(s.nodes.get('napStart').value,'12:00');s.nodes.get('napStart').value='11:15';s.nodes.get('napStart').onchange();assert.equal(s.nodes.get('napExpected').value,'12:30');const promise=s.run('saveActiveNap()'),q=s.context.__queue.shift();assert.equal(q.data.date,'2026-10-05');assert.equal(q.data.expectedEnd,'12:30');s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('OCR review preserves an inferred earlier date rather than silently moving the nap to today',async()=>{
 const s=screen();s.run("napSheet(null,{start:WW.wall('2026-10-04','08:00',S.settings.timezone),end:WW.wall('2026-10-04','09:00',S.settings.timezone),messages:[]})");assert.match(s.nodes.get('modalBody').innerHTML,/Oct 4, 2026/);const promise=s.run('saveNap()'),q=s.context.__queue.shift();assert.equal(q.data.date,'2026-10-04');assert.equal(q.data.imported,true);s.context.receive({id:q.id,message:'Saved'});await promise;
});
test('a form opened before midnight preserves its nap date while a newly opened form uses the new day',()=>{
 const s=screen();s.run("S.now=Date.parse(WW.wall(S.date,'23:58',S.settings.timezone));napSheet()");assert.equal(s.context.napEntryDate,'2026-10-05');s.run('S.now+=5*60000');assert.equal(s.context.napEntryDate,'2026-10-05');s.run('napSheet()');assert.equal(s.context.napEntryDate,'2026-10-06');
});
