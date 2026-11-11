const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../src/planning.js'),s=W.copy(W.defaults),date='2026-10-05',tz=s.timezone;
const at=t=>W.wall(date,t,tz),ms=t=>Date.parse(at(t));
const d=()=>({date,morning:at('07:00'),naps:[{entity:'first',start:at('08:15'),end:at('09:45')},{entity:'active',start:at('12:05'),end:null,expectedEnd:at('13:30')}],planning:{awake:[],pins:[]}});
const awake=(start='14:00',end='14:30',id='a')=>({id,label:'Appointment',start:at(start),end:at(end)});
const pin=(start='15:45',minutes=90,ordinal=3)=>({id:'p',ordinal,start:start?at(start):null,minutes,anchors:['first','active']});
test('appointment and pinned nap fit the example without altering actual sleep',()=>{
 const day=d();day.planning={awake:[awake()],pins:[pin()]};const before=JSON.stringify(day.naps);const p=W.plan(day,s,ms('12:46'));
 assert.equal(p.status,'fit');assert.equal(p.bedtime,ms('20:00'));assert.equal(JSON.stringify(day.naps),before);
 const nap=p.events.find(e=>e.kind==='nap');assert.equal(nap.start,ms('15:45'));assert.equal(nap.minutes,90);
});
test('start-only pin leaves duration automatic; duration-only pin leaves start automatic',()=>{
 for(const one of [pin('15:45',null),pin(null,60)]){const day=d();day.planning.pins=[one];const p=W.plan(day,s,ms('12:46'));assert.ok(p.events.length);const nap=p.events.find(e=>e.kind==='nap');if(one.start)assert.equal(nap.start,ms('15:45'));if(one.minutes)assert.equal(nap.minutes,60);}
});
test('future actual nap cannot be invented to satisfy a pin',()=>{
 const day=d();day.planning.pins=[pin('15:45',90)];W.plan(day,s,ms('12:46'));assert.equal(day.naps.length,2);assert.equal(day.naps[1].end,null);
});
test('impossible pin blocks forecasts without extending normal wake windows',()=>{
 const day=d();day.planning.pins=[pin('17:00',90)];const p=W.plan(day,s,ms('12:46'));assert.equal(p.status,'blocked');assert.deepEqual(p.events,[]);assert.equal(p.bedtime,undefined);assert.match(p.message,/pin/);
});
test('pin and appointment overlap cannot both be satisfied',()=>{
 const day=d();day.planning={awake:[awake('15:30','16:00')],pins:[pin('15:45',90)]};assert.equal(W.plan(day,s,ms('12:46')).status,'blocked');
});
test('appointment boundaries allow sleep ending at start or starting at end',()=>{
 for(const a of [awake('17:15','17:30'),awake('15:00','15:45')]){const day=d();day.planning={awake:[a],pins:[pin('15:45',90)]};assert.equal(W.plan(day,s,ms('12:46')).status,'fit');}
});
test('multiple overlapping appointment periods still prevent nap overlap',()=>{
 const day=d();day.planning.awake=[awake('14:00','14:30','a'),awake('14:15','15:00','b')];const p=W.plan(day,s,ms('12:46'));assert.equal(p.status,'fit');for(const n of p.events.filter(e=>e.kind==='nap'))for(const a of day.planning.awake)assert.ok(n.end<=Date.parse(a.start)||n.start>=Date.parse(a.end));
});
test('active expected wake conflicting with appointment pauses rather than fabricating wake',()=>{
 const day=d();day.planning.awake=[awake('13:00','13:45')];const p=W.plan(day,s,ms('12:46'));assert.equal(p.reason,'active-overlap');assert.equal(day.naps[1].expectedEnd,at('13:30'));assert.ok(p.activeNap);
});
test('recorded sleep overlapping an appointment remains actual and gives a note',()=>{
 const day=d();day.naps[1].end=at('13:30');delete day.naps[1].expectedEnd;day.planning.awake=[awake('12:30','13:00')];const p=W.plan(day,s,ms('13:40'));assert.notEqual(p.status,'blocked');assert.match(p.notes[0],/Actual times are preserved/);assert.equal(day.naps[1].end,at('13:30'));
});
test('a pin is retired when its real nap starts even if actual timing differs',()=>{
 const day=d();day.naps[1].end=at('13:20');delete day.naps[1].expectedEnd;day.planning.pins=[pin()];day.naps.push({entity:'real-third',start:at('15:30'),end:null,expectedEnd:at('16:30')});const p=W.plan(day,s,ms('15:45'));assert.equal(p.pins.length,0);assert.equal(p.anchor,ms('16:30'));
});
test('subsequent pins survive normal actual completion using stable actual-record identities',()=>{
 const day=d();day.planning.pins=[{...pin('18:00',60,4),id:'later'}];day.naps[1].end=at('13:00');delete day.naps[1].expectedEnd;day.naps.push({entity:'third',start:at('15:00'),end:at('16:00')});const p=W.plan(day,s,ms('16:00'));assert.notEqual(p.reason,'history');assert.equal(p.pins.length,1);assert.equal(p.events.find(e=>e.kind==='nap').start,ms('18:00'));
});
test('deleting or inserting earlier actual history requires reviewing pending pins',()=>{
 const day=d();day.planning.pins=[pin()];day.naps.shift();const p=W.plan(day,s,ms('12:46'));assert.equal(p.reason,'history');assert.deepEqual(p.events,[]);
});
test('backfilling earlier history cannot silently consume a future pin by changing the count',()=>{
 const day=d();day.planning.pins=[pin()];day.naps.unshift({entity:'backfill',start:at('07:10'),end:at('07:30')});const p=W.plan(day,s,ms('12:46'));assert.equal(p.reason,'history');assert.equal(p.pins.length,1);
});
test('a shared planning branch conflict pauses until explicit reconciliation',()=>{
 const day=d();day.planningConflict=true;const p=W.plan(day,s,ms('12:46'));assert.equal(p.reason,'concurrent-plans');assert.deepEqual(p.events,[]);assert.equal(day.naps[1].end,null);
});
test('an unfulfilled start pin in the past requires logging, moving or releasing',()=>{
 const day=d();day.naps[1].end=at('13:30');delete day.naps[1].expectedEnd;day.planning.pins=[pin()];const p=W.plan(day,s,ms('16:00'));assert.equal(p.reason,'expired-pin');assert.match(p.message,/Log the nap/);
});
test('changing nap settings does not silently coerce an existing duration pin',()=>{
 const day=d();day.planning.pins=[pin()];const settings=W.copy(s);settings.nap.max=80;assert.equal(W.plan(day,settings,ms('12:46')).status,'blocked');assert.equal(day.planning.pins[0].minutes,90);
});
test('an appointment after target forces an explicit bedtime deviation',()=>{
 const day=d();day.planning.awake=[awake('20:15','20:45')];const p=W.plan(day,s,ms('12:46'));assert.ok(p.bedtime>=ms('20:45'));assert.ok(p.deviation>=45);assert.equal(p.status,'adjust');
});
test('empty data and overdue active estimates preserve original fallback behavior',()=>{
 const empty={date,naps:[],planning:{awake:[awake()],pins:[]}};assert.equal(W.plan(empty,s,ms('12:46')).status,'empty');
 const day=d();day.planning.awake=[awake()];assert.equal(W.plan(day,s,ms('13:45')).status,'active-overdue');
});
test('invalid, duplicate and cross-date planning data are rejected',()=>{
 for(const v of [{awake:[awake('14:30','14:00')],pins:[]},{awake:[awake(),awake()],pins:[]},{awake:[{...awake(),end:W.wall('2026-10-06','14:30',tz)}],pins:[]},{awake:[],pins:[pin(null,null)]},{awake:[],pins:[pin(),pin()]}])assert.throws(()=>W.validatePlanning(v,date,s));
});
test('appointment planner preserves chronological order and all limits across a grid',()=>{
 for(const begin of ['14:00','14:30','15:00','15:30','16:00']){
  const day=d();const end=W.parts(ms(begin)+30*60000,tz).time;day.planning.awake=[awake(begin,end)];const p=W.plan(day,s,ms('12:46'));
  if(p.status==='blocked')continue;let cursor=p.anchor;
  for(const e of p.events){assert.equal(e.start,cursor);cursor=e.end;const r=e.kind==='nap'?W.napProfiles(s)[e.profile]:e.kind==='final'?s.final:s.later;assert.ok(e.minutes>=r.min&&e.minutes<=r.max);if(e.kind==='nap')assert.ok(e.end<=ms(begin)||e.start>=ms(end));}
  assert.equal(cursor,p.bedtime);assert.equal(JSON.stringify(day.naps),JSON.stringify(d().naps));
 }
});

test('the 7 AM rule uses the second range for the first wake only, in household time',()=>{
 const settings={...s,napTarget:2,napMax:2,first:{min:70,ideal:70,max:70},second:{min:125,ideal:125,max:125}};
 for(const [wake,first] of [['06:59',70],['07:00',125]]){
  const day={date,morning:at(wake),naps:[]};
  const p=W.plan(day,settings,ms('07:01'));
  assert.deepEqual(p.events.filter(e=>e.kind==='awake').map(e=>e.minutes),[first,125]);
 }
});
test('target is a preference and maximum includes recorded and active naps',()=>{
 const day=d(),p=W.plan(day,{...s,napTarget:1,napMax:2},ms('12:46'));
 assert.equal(p.count,0);assert.equal(p.totalNaps,2);assert.ok(p.bedtime<ms('20:00'));
 assert.equal(day.naps.length,2);
 const sample={date,morning:at('07:00'),naps:[]};
 const tied={...s,napTarget:2,napMax:3,later:{min:75,ideal:100,max:150},long:{min:120,ideal:150,max:200}};
 const options=W.alternatives(sample,tied,ms('07:00'),true);
 assert.equal(options[0].totalNaps,2);assert.equal(options[0].bedtime,ms('20:00'));
 assert.ok(options.some(o=>o.totalNaps===3));assert.ok(options.length<=3);
});
test('short and long overrides restrict the individual nap, including profile-only pins',()=>{
 const day={date,morning:at('07:00'),naps:[],planning:{awake:[],pins:[]}};
 const settings={...s,napTarget:2,napMax:2,short:{min:30,ideal:35,max:40},long:{min:100,ideal:105,max:110}};
 day.planning.pins=[{id:'p1',ordinal:1,start:null,minutes:null,profile:'short',anchors:[]},{id:'p2',ordinal:2,start:null,minutes:105,profile:'long',anchors:[]}];
 const p=W.plan(day,settings,ms('07:00')),naps=p.events.filter(e=>e.kind==='nap');
 assert.deepEqual(naps.map(n=>n.profile),['short','long']);
 assert.ok(naps[0].minutes>=30&&naps[0].minutes<=40);assert.equal(naps[1].minutes,105);
 day.planning.pins[1].minutes=111;
 assert.equal(W.plan(day,settings,ms('07:00')).status,'blocked');
 assert.throws(()=>W.validateSettings({...settings,napTarget:3}),/maximum/);
});
test('passes target time when a later bedtime is feasible and blocks impossible awake limits',()=>{
 const day={date,morning:at('19:00'),naps:[]};
 const settings={...s,napTarget:0,napMax:0};
 const p=W.plan(day,settings,ms('20:10'));
 assert.equal(p.bedtime,ms('21:00'));assert.equal(p.deviation,60);
 assert.equal(W.plan(day,settings,ms('22:01')).reason,'wake-limit');
});
test('daylight-saving changes use elapsed minutes and keep the schedule inside the household day',()=>{
 const dst='2026-03-08',morning=W.wall(dst,'01:30',tz),settings={...s,napTarget:1,napMax:1,first:{min:75,ideal:75,max:75}};
 const p=W.plan({date:dst,morning,naps:[]},settings,Date.parse(morning));
 const nap=p.events.find(e=>e.kind==='nap');
 assert.ok(nap);assert.equal(W.parts(nap.start,tz).time,'03:45');
 assert.equal((nap.start-Date.parse(morning))/60000,p.events[0].minutes);
 assert.equal(W.parts(p.bedtime,tz).date,dst);
});
