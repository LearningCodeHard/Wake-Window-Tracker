const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../src/core.js');
const s=()=>W.copy(W.defaults),tz=W.defaults.timezone,date='2026-10-05';
const at=t=>W.wall(date,t,tz),ms=t=>Date.parse(at(t));
const day=(a='11:00',b='12:00')=>({date,morning:null,naps:[{start:at(a),end:at(b)}]});
const sleeping=(start='12:05',expected='13:30')=>({date,morning:null,naps:[{start:at(start),end:null,expectedEnd:at(expected)}]});
const detailsText=require('node:fs').readFileSync(require('node:path').join(__dirname,'huckleberry-details.txt'),'utf8');
const detailsNow=Date.parse('2026-10-13T11:52:38Z');
test('exact Huckleberry Details capture ignores calendar/feed noise and keeps the recorded date',()=>{
 const r=W.parseOCR(detailsText,detailsNow,tz);
 assert.equal(r.date,'2026-10-11');assert.equal(r.start,W.wall(r.date,'09:46',tz));assert.equal(r.end,W.wall(r.date,'11:43',tz));
 assert.equal((Date.parse(r.end)-Date.parse(r.start))/60000,117);assert.deepEqual(r.messages,[]);
});
test('Details duration mismatch over two minutes prompts review without replacing explicit times',()=>{
 const r=W.parseOCR(detailsText.replace('Example Child slept for 1h 56m','Example Child slept for 2h 30m'),detailsNow,tz);
 assert.match(r.messages[0],/duration/);assert.equal(W.parts(r.end,tz).time,'11:43');
});
test('Details accepts dash variants, dotted AM/PM, other names and abbreviated months',()=>{
 for(const dash of ['-','–','—']){
  const text=detailsText.replace('Example Child slept','Baby slept').replace('Sunday, October 11, 2026','Oct 11, 2026').replace('9:46 AM - 11:43 AM',`9:46 a.m. ${dash} 11:43 a.m.`);
  const r=W.parseOCR(text,detailsNow,tz);assert.equal(r.date,'2026-10-11');assert.equal(W.parts(r.start,tz).time,'09:46');
 }
});
test('Details does not interpret feeding details or a day summary as a sleep entry',()=>{
 assert.ok(W.parseOCR(detailsText.replace('Example Child slept for 1h 56m','Example Child fed for 1h 56m'),detailsNow,tz).error);
 assert.ok(W.parseOCR(detailsText.split('GET SLEEP')[0],detailsNow,tz).error);
});
test('Details missing or unreadable date is refused instead of assuming today',()=>{
 for(const dateText of ['', 'Today','October 11','Sunday, Octobex 11, 2026'])assert.ok(W.parseOCR(detailsText.replace('Sunday, October 11, 2026',dateText),detailsNow,tz).error);
});
test('Details invalid calendar date and future actual end are refused',()=>{
 assert.match(W.parseOCR(detailsText.replace('Sunday, October 11, 2026','February 30, 2026'),detailsNow,tz).error,/calendar/);
 assert.match(W.parseOCR(detailsText,Date.parse('2026-10-11T15:00:00Z'),tz).error,/future/);
});
test('Details incomplete or ambiguous clock ranges are refused',()=>{
 for(const range of ['9:46 AM -','9:46 - 11:43','9:46 AM - 11:xx AM','19:46 AM - 11:43 AM'])assert.ok(W.parseOCR(detailsText.replace('9:46 AM - 11:43 AM',range),detailsNow,tz).error);
});
test('Details reverse or overnight ranges are refused',()=>{
 for(const range of ['11:43 AM - 9:46 AM','11:46 PM - 1:43 AM'])assert.match(W.parseOCR(detailsText.replace('9:46 AM - 11:43 AM',range),detailsNow,tz).error,/after/);
});
test('Details multiple entries are rejected instead of picking an arbitrary nap',()=>{
 assert.ok(W.parseOCR(detailsText+'\n'+detailsText,detailsNow,tz).error);
 assert.ok(W.parseOCR(detailsText.replace('\nNotes','\n10:00 AM - 11:00 AM\nNotes'),detailsNow,tz).error);
});
test('Details notes are excluded from parsing',()=>{
 const r=W.parseOCR(detailsText.replace('\nNotes','\nNotes\nTomorrow 8:00 AM - 9:00 AM'),detailsNow,tz);
 assert.equal(r.date,'2026-10-11');assert.equal(W.parts(r.start,tz).time,'09:46');
});
test('Details malformed section never falls back to unrelated labelled times behind the sheet',()=>{
 const text='Start Time Today 10:00 AM\nEnd Time Today 11:00 AM\nDetails\nExample Child slept for 1h 56m\nNotes';
 assert.ok(W.parseOCR(text,detailsNow,tz).error);
});
test('active nap plans from 1:30 expected wake at 12:46, with no false awake elapsed',()=>{
 const p=W.plan(sleeping(),s(),ms('12:46'));
 assert.equal(p.anchor,ms('13:30'));assert.equal(p.sleepElapsed,41);assert.equal(p.elapsed,0);
 assert.equal(p.events[0].start,ms('13:30'));assert.ok(p.events.find(e=>e.kind==='nap').start>=ms('15:30'));
 assert.equal(p.count,1);assert.equal(p.bedtime,ms('20:00'));assert.match(p.message,/expected wake/);
});
test('actual wake replaces estimate and recomputes from the real end',()=>{
 const d=sleeping();d.naps[0]={start:at('12:05'),end:at('12:40')};const p=W.plan(d,s(),ms('12:46'));
 assert.equal(p.anchor,ms('12:40'));assert.equal(p.elapsed,6);assert.equal(p.activeNap,undefined);
});
test('passed expected wake stays asleep and pauses projections until updated',()=>{
 const p=W.plan(sleeping(),s(),ms('13:45'));assert.equal(p.status,'active-overdue');assert.ok(p.activeNap);assert.deepEqual(p.events,[]);assert.equal(p.bedtime,undefined);
});
test('updated expected wake resumes planning without ending the nap',()=>{
 const p=W.plan(sleeping('12:05','14:00'),s(),ms('13:45'));assert.ok(p.activeNap);assert.ok(p.events.length);assert.equal(p.anchor,ms('14:00'));
});
test('active actual start cannot be future while expected end may be',()=>{
 assert.throws(()=>W.validateDay(sleeping(),s(),ms('12:00')),/future start/);
 assert.equal(W.validateDay(sleeping(),s(),ms('12:46')).length,1);
 assert.throws(()=>W.validateDay(sleeping('12:05','12:00'),s(),ms('12:46')),/after/);
});
test('active naps cannot overlap actual history or coexist with another active nap',()=>{
 assert.throws(()=>W.validateDay({date,naps:[...day('11:00','12:15').naps,...sleeping().naps]},s(),ms('12:46')),/overlap/);
 assert.throws(()=>W.validateDay({date,naps:[...sleeping().naps,...sleeping('12:20','14:00').naps]},s(),ms('12:46')),/More than one/);
});
test('start-only OCR needs explicit active confirmation and uses preferred duration',()=>{
 const r=W.parseOCR('Start Time\nToday, 12:05 PM',ms('12:46'),tz,90);
 assert.equal(r.kind,'active');assert.equal(r.end,null);assert.equal(r.expectedEnd,at('13:35'));assert.equal(r.needsActiveConfirmation,true);
});
test('running timer OCR prioritizes explicit goal over preferred duration',()=>{
 const r=W.parseOCR('Timer running\nStart Time\nToday, 12:05 PM\nGoal\n1:30 PM',ms('12:46'),tz,90);
 assert.equal(r.expectedEnd,at('13:30'));assert.equal(r.needsActiveConfirmation,false);
});
test('unreadable end is not silently converted to an active nap',()=>{
 assert.ok(W.parseOCR('Start Time Today 12:05 PM\nEnd Time --',ms('12:46'),tz).error);
});
test('start-only future OCR is refused',()=>{
 assert.match(W.parseOCR('Start Time Today 1:05 PM',ms('12:46'),tz).error,/future/);
});
test('noon example fits exactly two further naps and all stated bounds',()=>{
 const p=W.plan(day(),s(),ms('12:00'));
 assert.equal(p.status,'fit');assert.equal(p.count,2);assert.equal(p.slack,0);
 assert.deepEqual(p.events.map(e=>e.minutes),[120,60,120,60,120]);
 assert.deepEqual(p.events.filter(e=>e.kind==='nap').map(e=>[W.parts(e.start,tz).time,W.parts(e.end,tz).time]),[['14:00','15:00'],['17:00','18:00']]);
 assert.equal(W.parts(p.bedtime,tz).time,'20:00');
});
test('at 1:30 wake, planner switches to one remaining nap and fits 8pm',()=>{
 const p=W.plan(day('11:00','13:30'),s(),ms('13:30'));assert.equal(p.status,'fit');assert.equal(p.deviation,0);assert.equal(p.count,1);
});
test('12:30 wake leaves a gap between legal one-nap and two-nap plans',()=>{
 const p=W.plan(day('11:00','12:30'),s(),ms('12:30'));assert.equal(p.status,'adjust');assert.equal(Math.abs(p.deviation),30);
});
test('late final wake chooses zero naps and respects bedtime',()=>{
 const p=W.plan(day('17:00','18:00'),s(),ms('18:00'));assert.equal(p.count,0);assert.equal(p.deviation,0);assert.deepEqual(p.events.map(e=>e.minutes),[120]);
});
test('current clock constrains next transition to now or later',()=>{
 const p=W.plan(day(),s(),ms('15:00'));assert.equal(p.overdue,true);assert.ok(p.events[0].end>=ms('15:00'));assert.match(p.message,/exceeded/);
});
test('long first nap remains actual and is never clipped',()=>{
 const d=day('08:00','11:30');const p=W.plan(d,s(),ms('11:30'));assert.equal(p.anchor,ms('11:30'));assert.equal(d.naps[0].start,at('08:00'));
});
test('morning wake starts first window',()=>{
 const p=W.plan({date,morning:at('06:15'),naps:[]},s(),ms('06:15'));assert.equal(p.original.min,60);assert.equal(p.original.max,90);
});
test('unknown morning and no naps produces no invented data',()=>assert.equal(W.plan({date,naps:[]},s(),ms('06:15')).status,'empty'));
test('past bedtime has no imaginary future schedule',()=>assert.equal(W.plan(day(),s(),ms('21:00')).status,'past'));
test('today override changes target without changing default',()=>{
 const d=day();d.bedtime='19:00';const p=W.plan(d,s(),ms('12:00'));assert.equal(p.count,1);assert.equal(p.deviation,0);
});
test('planner bounds checked across a grid of anchors and bedtimes',()=>{
 for(let h=8;h<=18;h++){for(const bed of ['18:30','19:00','20:00','21:00']){
  const settings=s();settings.bedtime=bed;const start=String(h-1).padStart(2,'0')+':00',end=String(h).padStart(2,'0')+':00';const p=W.plan(day(start,end),settings,ms(end));
  if(!p.events.length)continue;
  let prev=p.anchor;
  p.events.forEach((e,i)=>{assert.equal(e.start,prev);prev=e.end;const r=e.kind==='nap'?settings.nap:e.kind==='final'?settings.final:i===0?settings.second:settings.later;assert.ok(e.minutes>=r.min&&e.minutes<=r.max);});
  assert.equal(prev,p.bedtime);if(p.status==='fit')assert.equal(p.bedtime,p.target);
 }}
});
test('overlapping actual naps rejected',()=>assert.throws(()=>W.validateDay({date,naps:[...day().naps,{start:at('11:30'),end:at('12:30')}]},s(),ms('14:00')),/overlap/));
test('end before start rejected',()=>assert.throws(()=>W.validateDay(day('12:00','11:00'),s(),ms('14:00')),/after/));
test('future actual nap rejected',()=>assert.throws(()=>W.validateDay(day('12:00','13:00'),s(),ms('12:30')),/future/));
test('actual short nap accepted regardless of planned minimum',()=>assert.equal(W.validateDay(day('11:00','11:10'),s(),ms('12:00')).length,1));
test('morning after first nap rejected',()=>assert.throws(()=>W.validateDay({...day(),morning:at('11:30')},s(),ms('14:00')),/before morning/));
test('inverted settings rejected',()=>{const x=s();x.nap.min=100;assert.throws(()=>W.validateSettings(x),/minimum/);});
test('preferred outside range rejected',()=>{const x=s();x.nap.ideal=200;assert.throws(()=>W.validateSettings(x),/preferred/);});
test('labelled Today OCR parsed',()=>{
 const r=W.parseOCR('12:34\nStart Time\nToday, 11:00 AM\nEnd Time\nToday, 12:00 PM\nDuration\n1h 0m',ms('12:30'),tz);assert.equal(r.start,at('11:00'));assert.equal(r.end,at('12:00'));assert.deepEqual(r.messages,[]);
});
test('OCR arbitrary status-bar time alone is rejected',()=>assert.ok(W.parseOCR('12:34 Battery 100% 01:00:00',ms('13:00'),tz).error));
test('OCR repeated labels are rejected',()=>assert.ok(W.parseOCR('Start Time Today 11:00 AM End Time Today 12:00 PM Start Time',ms('13:00'),tz).error));
test('OCR yesterday date resolves correctly',()=>{const r=W.parseOCR('Start Time\nYesterday, 11:00 AM\nEnd Time\nYesterday, 12:00 PM',ms('13:00'),tz);assert.equal(r.date,'2026-10-04');});
test('OCR missing date explicitly asks for review',()=>{const r=W.parseOCR('Start Time 11:00 AM End Time 12:00 PM',ms('13:00'),tz);assert.equal(r.messages.length,1);});
test('OCR unfamiliar date format fails to manual input',()=>assert.ok(W.parseOCR('Start Time October 4, 2026, 11:00 AM End Time October 4, 2026, 12:00 PM',ms('13:00'),tz).error));
test('OCR midnight correctly rejects cross-date daytime import',()=>assert.ok(W.parseOCR('Start Time Yesterday, 11:30 PM End Time Today, 12:30 AM',ms('13:00'),tz).error));
test('OCR duration discrepancy is surfaced',()=>{const r=W.parseOCR('Start Time Today 11:00 AM End Time Today 12:00 PM Duration 2h 0m',ms('13:00'),tz);assert.match(r.messages[0],/duration/);});
test('invalid calendar date rejected',()=>assert.throws(()=>W.wall('2026-02-30','12:00',tz),/calendar/));
test('DST nonexistent clock rejected',()=>assert.throws(()=>W.wall('2026-03-08','02:30',tz),/does not exist/));
test('DST ambiguous clock rejected',()=>assert.throws(()=>W.wall('2026-11-01','01:30',tz),/occurs twice/));
test('household day at midnight is independent of UTC date',()=>{assert.equal(W.parts('2026-10-06T03:59:00Z',tz).date,'2026-10-05');assert.equal(W.parts('2026-10-06T04:00:00Z',tz).date,'2026-10-06');});
test('separate event records preserve concurrent additions',()=>{const e=(id,entity)=>({schema:1,id,entity,at:'2026-10-05T16:00:00Z',base:null,value:id});assert.equal(Object.keys(W.reduce([e('a','nap:a'),e('b','nap:b')]).latest).length,2);});
test('conflicting edits detected and a subsequent acknowledgement clears warning',()=>{const e=(id,base,value)=>({schema:1,id,entity:'nap:a',at:`2026-10-05T16:0${id}:00Z`,base,value});let r=W.reduce([e('1',null,'old'),e('2','1','a'),e('3','1','b')]);assert.deepEqual(r.conflicts,['nap:a']);r=W.reduce([e('1',null,'old'),e('2','1','a'),e('3','1','b'),e('4','3','b')]);assert.deepEqual(r.conflicts,[]);});
test('malformed shared event fails clearly',()=>assert.throws(()=>W.reduce([{junk:true}]),/unreadable/));
test('a delayed duplicate original import cannot undo a correction',()=>{
 const make=(id,base,at,value)=>({schema:1,id,entity:'nap:x',at,base,value});
 const r=W.reduce([make('a',null,'2026-10-05T16:00:00Z','original'),make('b','a','2026-10-05T16:01:00Z','corrected'),make('c',null,'2026-10-05T16:02:00Z','original')]);assert.equal(r.latest['nap:x'].value,'corrected');
});
