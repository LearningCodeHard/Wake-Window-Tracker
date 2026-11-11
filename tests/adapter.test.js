const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const W=require('../src/core.js');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const source=fs.readFileSync(require('node:path').join(__dirname,'../Wake_Window_V2.js'),'utf8');
const fixed=Date.parse('2026-10-05T16:00:00.000Z');
class FixedDate extends Date{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}}
function shared(){return {files:new Map(),dirs:new Set(['/shared']),serial:0};}
async function run(store,commands=[],input='OPEN',runtime=null){
 let snap,responses=[],alerts=[],finished=false,close,presented=false,dismissed=false;
 const manager={joinPath:(a,b)=>a+'/'+b,bookmarkExists:()=>true,bookmarkedPath:()=>'/shared',fileExists:p=>store.dirs.has(p)||store.files.has(p),isDirectory:p=>store.dirs.has(p),createDirectory:p=>store.dirs.add(p),listContents:p=>[...store.files.keys()].filter(f=>f.startsWith(p+'/')&&!f.slice(p.length+1).includes('/')).map(f=>f.slice(p.length+1)),downloadFileFromiCloud:async()=>{},readString:p=>{if(!store.files.has(p))throw Error('missing');return store.files.get(p);},writeString:(p,s)=>store.files.set(p,s),fileName:p=>p.split('/').pop()};
 class WebView{
  async loadHTML(s){snap=JSON.parse(s.match(/let S=(.*?), pending=\{\}, seq=0/)[1]);}
  async present(){await Promise.resolve();presented=true;return new Promise(r=>close=()=>{dismissed=true;r();});}
  async evaluateJavaScript(code,useCallback){
   let value,complete=false;
   const window={__queue:[],__waiter:null,receive(r){responses.push(r);if(r.snapshot)snap=r.snapshot;}};
   const result=vm.runInNewContext(code,{window,completion:r=>{complete=true;value=r;}});
   if(typeof result==='function'||(result&&typeof result.then==='function'))throw Error('JavaScript execution returned a result of an unsupported type');
   if(!useCallback)return result;
   if(complete)return value;
   return new Promise((resolve,reject)=>setImmediate(()=>{
    try{
     assert.ok(presented,'presentation must start before user action');
     if(!commands.length){close();return;} // native callback stays pending on close
     const c=commands.shift();window.__waiter(typeof c==='function'?c(snap):c);
     assert.ok(complete,'queued user action must complete the native callback');resolve(value);
    }catch(e){reject(e);}
   }));
  }
 }
 class Alert{addAction(){}async presentAlert(){alerts.push(this.message);}}
 if(store.bookmarks){manager.bookmarkExists=n=>Object.prototype.hasOwnProperty.call(store.bookmarks,n);manager.bookmarkedPath=n=>store.bookmarks[n];}
 let code=source;
 if(runtime){const m=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../channels/'+runtime.channel+'.json'),'utf8'));code=fs.readFileSync(require('node:path').join(__dirname,'../'+m.path),'utf8')+'\nawait module.exports.run(runtime);';}
 const fn=new AsyncFunction('args','FileManager','UUID','Keychain','WebView','Script','Alert','Date','module','runtime',code);
 await fn({shortcutParameter:input},{iCloud:()=>manager},{string:()=>String(++store.serial).padStart(8,'0')},{contains:()=>true,get:()=> 'test-device'},WebView,{complete:()=>{assert.ok(dismissed,'script must stay alive until dashboard dismissal');finished=true;}},Alert,FixedDate,{exports:{}},runtime);
 return {snap,responses,alerts,finished,presented,dismissed};
}
const command=(id,action,data)=>({id,action,data});
test('test module defaults to demo and does not read or write family records',async()=>{
 const store=shared();store.bookmarks={WakeWindowShared:'/shared',WakeWindowTestShared:'/testing'};
 const r=await run(store,[command(1,'morning',{date:'2026-10-05',time:'07:00',base:null})],'OPEN',{channel:'test',version:'2.0.1',input:'OPEN'});
 assert.equal(r.snap.mode,'demo');assert.equal(r.snap.release.channel,'test');assert.equal(store.files.size,0);assert.equal(store.dirs.size,1);
});
test('test module defaults to demo even when an import shortcut sends real text',async()=>{
 const r=await run(shared(),[],'OPEN',{channel:'test',version:'2.0.1',input:'Start Time 11:00 AM End Time 12:00 PM'});assert.equal(r.snap.mode,'demo');assert.equal(r.snap.imported,null);
});
test('test module rejects identical production and test folders before shared writes',async()=>{
 const store=shared();store.bookmarks={WakeWindowShared:'/shared',WakeWindowTestShared:'/shared'};
 await assert.rejects(run(store,[],'OPEN',{channel:'test',mode:'folder',input:'OPEN'}),/must be separate/);assert.equal(store.files.size,0);
});
test('test module rejects nesting in either direction and normalized aliases',async()=>{
 for(const [production,testing] of [['/shared','/shared/test'],['/shared/live','/shared'],['/var/family/','/private/var/family']]){
  const store=shared();store.dirs.add(testing);store.bookmarks={WakeWindowShared:production,WakeWindowTestShared:testing};
  await assert.rejects(run(store,[],'OPEN',{channel:'test',mode:'folder',input:'OPEN'}),/must be separate/);assert.equal(store.files.size,0);
 }
});
test('test folder requires production bookmark for comparison',async()=>{
 const store=shared();store.dirs.add('/testing');store.bookmarks={WakeWindowTestShared:'/testing'};
 await assert.rejects(run(store,[],'OPEN',{channel:'test',mode:'folder',input:'OPEN'}),/production bookmark first/);
});
test('separate test folder persists test events without family writes',async()=>{
 const store=shared();store.dirs.add('/testing');store.bookmarks={WakeWindowShared:'/shared',WakeWindowTestShared:'/testing'};
 const r=await run(store,[command(1,'morning',{date:'2026-10-05',time:'07:00',base:null})],'OPEN',{channel:'test',mode:'folder',input:'OPEN',version:'2.0.1'});
 assert.equal(r.snap.mode,'live');assert.ok(store.files.size);assert.ok([...store.files.keys()].every(p=>p.startsWith('/testing/')));assert.equal(r.snap.release.channel,'test');
});
test('production baseline module retains shared storage and import review',async()=>{
 const store=shared();const r=await run(store,[],'OPEN',{channel:'production',version:'1.1.3+launcher.1',input:'Start Time 11:00 AM End Time 12:00 PM'});
 assert.equal(r.snap.release.channel,'production');assert.ok(r.snap.imported);assert.equal(store.files.size,0);
});
test('production baseline update menu returns without prematurely completing script',async()=>{
 let opened=0;const r=await run(shared(),[command(1,'updates')],'OPEN',{channel:'production',version:'1.1.3+launcher.1',input:'OPEN',updates:async()=>{opened++;return 'Reopen to apply';}});
 assert.equal(opened,1);assert.equal(r.responses[0].message,'Reopen to apply');assert.ok(r.dismissed);
});
test('candidate module update menu retains current release and data snapshot',async()=>{
 let opened=0;const r=await run(shared(),[command(1,'updates'),command(2,'load',{date:'2026-10-05'})],'OPEN',{channel:'test',version:'2.0.1',input:'OPEN',updates:async()=>{opened++;return 'Reopen to apply';}});
 assert.equal(opened,1);assert.equal(r.snap.release.version,'2.0.1');assert.ok(r.dismissed);
});
test('awake periods persist across phones separately from actual naps',async()=>{
 const store=shared(),date='2026-10-05';await run(store,[command(1,'awakePeriod',{date,base:null,label:'Doctor',start:'14:00',end:'14:30'})]);const r=await run(store);
 assert.equal(r.snap.day.planning.awake.length,1);assert.equal(r.snap.day.planning.awake[0].label,'Doctor');assert.equal(r.snap.day.naps.length,0);assert.ok(r.snap.lastSavedAt===null);assert.ok(r.snap.revisions.planning);
});
test('stale appointment edits and resets do not overwrite the other parent',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'awakePeriod',{date,base:null,label:'Doctor',start:'14:00',end:'14:30'}),s=>command(2,'awakePeriod',{date,base:'stale',id:s.day.planning.awake[0].id,label:'Changed',start:'14:00',end:'15:00'}),command(3,'resetPlanning',{date,base:null})]);
 assert.equal(r.snap.day.planning.awake[0].label,'Doctor');assert.match(r.responses[1].error,/changed/);assert.match(r.responses[2].error,/changed/);assert.equal(store.files.size,1);
});
test('appointment edit and removal preserve revision history',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'awakePeriod',{date,base:null,label:'Doctor',start:'14:00',end:'14:30'}),s=>command(2,'awakePeriod',{date,base:s.revisions.planning,id:s.day.planning.awake[0].id,label:'Doctor',start:'14:00',end:'14:45'}),s=>command(3,'removeAwake',{date,base:s.revisions.planning,id:s.day.planning.awake[0].id})]);
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.planning.awake.length,0);assert.equal(store.files.size,3);
});
test('pin start and duration save separately from completed sleep',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'nap',{date,start:'10:00',end:'11:00'}),command(2,'pinNap',{date,base:null,ordinal:2,start:'13:00',minutes:60})]);
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.naps.length,1);assert.equal(r.snap.day.planning.pins[0].minutes,60);assert.equal(r.snap.day.planning.pins[0].anchors[0],r.snap.day.naps[0].entity);assert.ok(r.snap.lastSavedAt);
});
test('bad duration, expired start and actual nap pins are refused without a planning write',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'nap',{date,start:'10:00',end:'11:00'}),command(2,'pinNap',{date,base:null,ordinal:2,start:'13:00',minutes:10}),command(3,'pinNap',{date,base:null,ordinal:2,start:'11:30',minutes:null}),command(4,'pinNap',{date,base:null,ordinal:1,start:'13:00',minutes:60})]);
 assert.equal(store.files.size,1);assert.equal(r.snap.day.planning.pins.length,0);assert.match(r.responses[1].error,/minimum/);assert.match(r.responses[2].error,/future/);assert.match(r.responses[3].error,/actual/);
});
test('clear planning is one revision and preserves actuals, morning, bedtime and defaults',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'morning',{date,time:'07:00',base:null}),command(2,'nap',{date,start:'10:00',end:'11:00'}),command(3,'bedtime',{date,time:'19:30',base:null}),command(4,'awakePeriod',{date,base:null,label:'Doctor',start:'14:00',end:'14:30'}),s=>command(5,'pinNap',{date,base:s.revisions.planning,ordinal:2,start:'13:00',minutes:60}),s=>command(6,'resetPlanning',{date,base:s.revisions.planning})]);
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.planning.awake.length,0);assert.equal(r.snap.day.planning.pins.length,0);assert.equal(r.snap.day.naps.length,1);assert.ok(r.snap.day.morning);assert.equal(r.snap.day.bedtime,'19:30');assert.equal(r.snap.settings.bedtime,'20:00');assert.equal(store.files.size,6);
});
test('releasing one pin keeps the appointment and other planning inputs',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'awakePeriod',{date,base:null,label:'Doctor',start:'14:00',end:'14:30'}),s=>command(2,'pinNap',{date,base:s.revisions.planning,ordinal:1,start:'13:00',minutes:null}),s=>command(3,'releasePin',{date,base:s.revisions.planning,id:s.day.planning.pins[0].id})]);assert.equal(r.snap.day.planning.awake.length,1);assert.equal(r.snap.day.planning.pins.length,0);
});
test('planning data stays separate for different days',async()=>{
 const store=shared();const r=await run(store,[command(1,'awakePeriod',{date:'2026-10-04',base:null,label:'Old',start:'14:00',end:'14:30'}),command(2,'load',{date:'2026-10-05'})]);assert.equal(r.snap.day.planning.awake.length,0);
});
test('late concurrent planning branches are shown for review and an explicit choice resolves them',async()=>{
 const store=shared(),date='2026-10-05';const first=await run(store,[command(1,'awakePeriod',{date,base:null,label:'Original',start:'14:00',end:'14:30'})]);
 const base=first.snap.revisions.planning,id=first.snap.day.planning.awake[0].id;
 await run(store,[command(1,'awakePeriod',{date,base,id,label:'Parent A',start:'14:00',end:'14:45'})]);
 const record={schema:1,id:'offline-B',base,entity:'planning:'+date,at:'2026-10-05T16:01:00.000Z',deleted:false,device:'B',value:{awake:[{id,label:'Parent B',start:W.wall(date,'15:00',W.defaults.timezone),end:W.wall(date,'15:30',W.defaults.timezone)}],pins:[]}};
 store.files.set('/shared/events/'+date+'__offline-B.json',JSON.stringify(record));
 const conflict=await run(store);assert.equal(conflict.snap.day.planningConflict,true);assert.equal(conflict.snap.planningVersions.length,2);
 const version=conflict.snap.planningVersions.find(v=>v.value.awake[0].label==='Parent A');
 const r=await run(store,[command(1,'resolvePlanning',{date,base:conflict.snap.revisions.planning,version:version.id})]);
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.planningConflict,false);assert.equal(r.snap.day.planning.awake[0].label,'Parent A');assert.equal(r.snap.day.naps.length,0);assert.equal(store.files.size,4);
});
const detailsInput=fs.readFileSync(require('node:path').join(__dirname,'huckleberry-details.txt'),'utf8').replace('Sunday, October 11, 2026','Monday, October 5, 2026');
test('Details import is reviewed without saving and uses its explicit historical date',async()=>{
 const store=shared(),r=await run(store,[],detailsInput.replace('Monday, October 5, 2026','Sunday, October 4, 2026'));
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.date,'2026-10-04');assert.equal(r.snap.imported.date,'2026-10-04');assert.equal(W.parts(r.snap.imported.start,W.defaults.timezone).time,'09:46');assert.equal(store.files.size,0);
});
test('saving Details completes the matching active nap and duplicate replay is suppressed',async()=>{
 const store=shared(),date='2026-10-05';await run(store,[command(1,'activeNap',{date,start:'09:46',expectedEnd:'11:15'})]);
 const r=await run(store,[s=>{assert.ok(s.imported.end);return command(1,'nap',{date:s.imported.date,start:'09:46',end:'11:43',imported:true});},command(2,'nap',{date,start:'09:46',end:'11:43',imported:true})],detailsInput);
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.naps.length,1);assert.equal(store.files.size,2);assert.match(r.responses[1].message,/duplicate/);
 const nap=r.snap.day.naps[0];assert.equal(W.parts(nap.end,W.defaults.timezone).time,'11:43');assert.equal(nap.expectedEnd,undefined);
 const p=W.plan(r.snap.day,r.snap.settings,fixed);assert.equal(p.anchor,Date.parse(nap.end));assert.equal(p.elapsed,17);
 const other=await run(store);assert.equal(other.snap.day.naps.length,1);assert.equal(other.snap.day.naps[0].end,nap.end);
});
test('Details creates a completed nap when no active record exists and reimport adds nothing',async()=>{
 const store=shared(),data={date:'2026-10-05',start:'09:46',end:'11:43',imported:true};
 const r=await run(store,[command(1,'nap',data),command(2,'nap',data)],detailsInput);
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.naps.length,1);assert.equal(store.files.size,1);
});
test('invalid Details leaves shared records untouched and offers manual fallback',async()=>{
 const store=shared(),r=await run(store,[],detailsInput.replace('9:46 AM - 11:43 AM','9:46 AM - --'));
 assert.ok(r.snap.imported.error);assert.equal(store.files.size,0);
});
test('active nap persists across simulated phones with an estimate separate from actual end',async()=>{
 const store=shared();await run(store,[command(1,'activeNap',{date:'2026-10-05',start:'11:15',expectedEnd:'13:00'})]);
 const r=await run(store);assert.equal(r.snap.day.naps.length,1);assert.equal(r.snap.day.naps[0].end,null);assert.equal(W.parts(r.snap.day.naps[0].expectedEnd,W.defaults.timezone).time,'13:00');
});
test('ending an active nap and repeated completion import keep one nap and its revision history',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'activeNap',{date,start:'11:15',expectedEnd:'13:00'}),command(2,'nap',{date,start:'11:15',end:'11:50',imported:true}),command(3,'nap',{date,start:'11:15',end:'11:50',imported:true})]);
 assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.naps.length,1);assert.ok(r.snap.day.naps[0].end);assert.equal(r.snap.day.naps[0].expectedEnd,undefined);assert.equal(store.files.size,2);
});
test('active estimate edits update the same entity; stale edits and second active starts are refused',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'activeNap',{date,start:'11:15',expectedEnd:'13:00'}),s=>command(2,'activeNap',{date,start:'11:15',expectedEnd:'13:30',entity:s.day.naps[0].entity,base:s.day.naps[0].revision}),s=>command(3,'activeNap',{date,start:'11:15',expectedEnd:'14:00',entity:s.day.naps[0].entity,base:'stale'}),command(4,'activeNap',{date,start:'11:30',expectedEnd:'14:00'})]);
 assert.equal(r.snap.day.naps.length,1);assert.equal(W.parts(r.snap.day.naps[0].expectedEnd,W.defaults.timezone).time,'13:30');assert.match(r.responses[2].error,/changed/);assert.match(r.responses[3].error,/More than one/);
});
test('duplicate active import and delayed start screenshot cannot reopen a completed nap',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'activeNap',{date,start:'11:15',expectedEnd:'13:00'}),command(2,'activeNap',{date,start:'11:15',expectedEnd:'13:00',imported:true}),command(3,'nap',{date,start:'11:15',end:'11:50'}),command(4,'activeNap',{date,start:'11:15',expectedEnd:'13:00',imported:true})]);
 assert.equal(r.snap.day.naps.length,1);assert.ok(r.snap.day.naps[0].end);assert.equal(store.files.size,2);assert.match(r.responses[3].message,/completed/);
});
test('cancelled active nap stays cancelled on OCR replay',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'activeNap',{date,start:'11:15',expectedEnd:'13:00'}),s=>command(2,'deleteNap',{date,entity:s.day.naps[0].entity,base:s.day.naps[0].revision}),command(3,'activeNap',{date,start:'11:15',expectedEnd:'13:00',imported:true})]);assert.equal(r.snap.day.naps.length,0);
});
test('deleted completed nap that began as active is not revived by completion OCR',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'activeNap',{date,start:'11:15',expectedEnd:'13:00'}),command(2,'nap',{date,start:'11:15',end:'11:50'}),s=>command(3,'deleteNap',{date,entity:s.day.naps[0].entity,base:s.day.naps[0].revision}),command(4,'nap',{date,start:'11:15',end:'11:50',imported:true})]);assert.equal(r.snap.day.naps.length,0);assert.equal(store.files.size,3);
});
test('completed naps still reject future actual ends',async()=>{
 const r=await run(shared(),[command(1,'nap',{date:'2026-10-05',start:'11:15',end:'13:00'})]);assert.match(r.responses[0].error,/future/);
});
test('start-only OCR offers an estimate for review without saving',async()=>{
 const store=shared(),r=await run(store,[],'Running\nStart Time\nToday, 11:15 AM');assert.equal(r.snap.imported.kind,'active');assert.equal(W.parts(r.snap.imported.expectedEnd,W.defaults.timezone).time,'12:30');assert.equal(store.files.size,0);
});
test('packaged demo renders without touching shared storage',async()=>{const store=shared();const r=await run(store,[],'DEMO');assert.deepEqual(r.alerts,[]);assert.equal(r.snap.mode,'demo');assert.equal(r.snap.day.naps.length,1);assert.equal(store.files.size,0);assert.ok(r.finished);});
test('live manual entry and duplicate OCR produce one nap',async()=>{
 const store=shared();const data={date:'2026-10-05',start:'10:00',end:'11:00',base:null};
 const r=await run(store,[command(1,'nap',data),command(2,'nap',{...data,imported:true})]);assert.deepEqual(r.alerts,[]);assert.equal(r.snap.day.naps.length,1);assert.match(r.responses[1].message,/duplicate/);assert.equal(store.files.size,1);
});
test('phone B reads the nap added by phone A',async()=>{
 const store=shared();await run(store,[command(1,'nap',{date:'2026-10-05',start:'10:00',end:'11:00'})]);const r=await run(store);assert.equal(r.snap.day.naps.length,1);assert.equal(W.parts(r.snap.day.naps[0].end,W.defaults.timezone).time,'11:00');
});
test('two phone checks do not create fake naps',async()=>{
 const store=shared();await run(store,[command(1,'probe',{label:'Phone A'})]);const r=await run(store,[command(1,'probe',{label:'Phone B'})]);assert.equal(r.snap.probes.length,2);assert.equal(r.snap.day.naps.length,0);
});
test('edit, delete, suppressed reimport, and explicit manual restore',async()=>{
 const store=shared(),date='2026-10-05';
 const r=await run(store,[command(1,'nap',{date,start:'10:00',end:'11:00'}),s=>command(2,'nap',{date,start:'10:00',end:'11:30',entity:s.day.naps[0].entity,base:s.day.naps[0].revision}),s=>command(3,'deleteNap',{date,entity:s.day.naps[0].entity,base:s.day.naps[0].revision}),command(4,'nap',{date,start:'10:00',end:'11:00',imported:true}),command(5,'nap',{date,start:'10:00',end:'11:00',imported:false})]);
 assert.deepEqual(r.alerts,[]);assert.equal(r.responses[1].snapshot.day.naps[0].end,W.wall(date,'11:30',W.defaults.timezone));assert.equal(r.responses[2].snapshot.day.naps.length,0);assert.equal(r.responses[3].snapshot.day.naps.length,0);assert.equal(r.snap.day.naps.length,1);
});
test('stale edit is rejected and existing record retained',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'nap',{date,start:'10:00',end:'11:00'}),s=>command(2,'nap',{date,start:'10:00',end:'11:30',entity:s.day.naps[0].entity,base:'stale'})]);assert.match(r.responses[1].error,/changed/);assert.equal(store.files.size,1);
});
test('overlap is rejected without adding another event',async()=>{
 const store=shared(),date='2026-10-05';const r=await run(store,[command(1,'nap',{date,start:'10:00',end:'11:00'}),command(2,'nap',{date,start:'10:30',end:'11:30'})]);assert.match(r.responses[1].error,/overlap/);assert.equal(store.files.size,1);
});
test('shared settings can be saved then read by the other phone',async()=>{
 const store=shared(),settings=W.copy(W.defaults);settings.bedtime='19:30';await run(store,[command(1,'settings',{settings,base:null})]);const r=await run(store);assert.equal(r.snap.settings.bedtime,'19:30');
});
test('daily bedtime does not overwrite shared default bedtime',async()=>{
 const store=shared();const r=await run(store,[command(1,'bedtime',{date:'2026-10-05',time:'19:30',base:null})]);assert.equal(r.snap.day.bedtime,'19:30');assert.equal(r.snap.settings.bedtime,'20:00');
});
test('OCR is offered for review and never saved before confirmation',async()=>{
 const store=shared();const r=await run(store,[],'Start Time\nToday, 10:00 AM\nEnd Time\nToday, 11:00 AM');assert.ok(r.snap.imported.start);assert.equal(r.snap.day.naps.length,0);assert.equal(store.files.size,0);
});
test('unrecognized OCR offers manual fallback without touching records',async()=>{
 const store=shared();const r=await run(store,[],'Battery 90% 12:00');assert.ok(r.snap.imported.error);assert.equal(store.files.size,0);
});
test('old-day records remain distinct from today',async()=>{
 const store=shared();const r=await run(store,[command(1,'nap',{date:'2026-10-04',start:'10:00',end:'11:00'}),command(2,'load',{date:'2026-10-05'})]);assert.equal(r.snap.day.naps.length,0);assert.equal(store.files.size,1);
});

test('candidate routes direct updater actions without shared reads or sleep writes and returns refreshed control labels',async()=>{
 const store=shared();let paused=false;const info=()=>({actions:[{id:paused?'resume':'pause',label:paused?'Resume Automatic Updates':'Pause Automatic Updates',enabled:true}],status:'Up to date'});
 const r=await run(store,[command(1,'updateControl',{id:'pause'})],'OPEN',{channel:'test',version:'2.0.5',updateInfo:info,updateAction:async id=>{assert.equal(id,'pause');paused=true;return 'Preference saved';}});assert.equal(r.responses[0].updateInfo.actions[0].id,'resume');assert.equal(r.responses[0].saveConfirmed,false);assert.equal(r.snap.day.naps.length,1);assert.equal(store.files.size,0);
});
test('older launchers run the candidate but unsupported direct controls fail without modifying sleep data',async()=>{
 const store=shared();const r=await run(store,[command(1,'updateControl',{id:'pause'})],'OPEN',{channel:'test',version:'2.0.5',updates:async()=>{throw Error('must not open nested menu');}});assert.equal(r.snap.release.updateInfo,null);assert.match(r.responses[0].error,/launcher.*1.0.3/);assert.equal(store.files.size,0);
});

const planner=require('../src/approval.js');
const testFolder={channel:'test',mode:'folder',input:'OPEN'};
function separateTest(){
 const store=shared();store.dirs.add('/testing');store.bookmarks={WakeWindowShared:'/shared',WakeWindowTestShared:'/testing'};
 return store;
}
const approve=(s,id=2)=>command(id,'approvePlan',{date:s.date,signature:planner.approval.signature(s),generatedAt:s.now,compare:false,index:0});
test('TEST approvals persist across reloads and material changes require a new explicit approval',async()=>{
 const store=separateTest(),date='2026-10-05';
 const initial=await run(store,[command(1,'morning',{date,time:'09:45',base:null}),approve],'OPEN',testFolder);
 assert.ok(initial.snap.approved);assert.equal(initial.responses[1].saveConfirmed,true);
 const phoneB=await run(store,[],'OPEN',testFolder);
 assert.equal(JSON.stringify(phoneB.snap.approved),JSON.stringify(initial.snap.approved));
 const revised=await run(store,[command(1,'bedtime',{date,time:'20:30',base:null}),s=>approve(s)],'OPEN',testFolder);
 assert.equal(JSON.stringify(revised.responses[0].snapshot.approved),JSON.stringify(initial.snap.approved));
 assert.match(planner.approval.changes(revised.responses[0].snapshot,initial.snap.approved).join(),/bedtime target/);
 assert.notEqual(revised.snap.revisions.approval,initial.snap.revisions.approval);
 assert.ok([...store.files.keys()].every(p=>p.startsWith('/testing/')));
});
test('approval protects against a stale preview and explicitly resolves simultaneous approvals',async()=>{
 const store=separateTest(),date='2026-10-05';
 const r=await run(store,[command(1,'morning',{date,time:'09:45',base:null}),approve],'OPEN',testFolder);
 const previous=r.snap,record=[...store.files.values()].map(JSON.parse).find(x=>x.entity==='approval:'+date);
 const sibling={...record,id:'competing-approval',value:{...record.value,generatedAt:record.value.generatedAt-1}};
 store.files.set('/testing/events/'+date+'__competing-approval.json',JSON.stringify(sibling));
 const conflict=await run(store,[approve.bind(null,previous),s=>command(3,'resolveApproval',{date,version:record.id,signature:planner.approval.signature(s)})],'OPEN',testFolder);
 assert.match(conflict.responses[0].error,/changed/);
 assert.equal(conflict.responses[1].saveConfirmed,true);
 assert.equal(conflict.snap.approvalVersions.length,0);
 assert.equal(JSON.stringify(conflict.snap.approved.plan),JSON.stringify(record.value.plan));
 assert.equal(conflict.snap.approved.resolved.length,2);
 assert.ok([...store.files.values()].map(JSON.parse).some(r=>r.id===sibling.id));
});
test('approval tracks strict 10-minute tolerance for starts, finishes and an active nap baseline',()=>{
 const date='2026-10-05',settings=planner.copy(planner.defaults);
 const at=t=>planner.wall(date,t,settings.timezone),now=Date.parse(at('07:00'));
 const S={date,settings,day:{date,morning:at('07:00'),naps:[]}};
 const plan=planner.plan(S.day,settings,now),approved=planner.approval.saveApproval(S,plan,now);
 const event=plan.events.find(e=>e.kind==='nap'),iso=t=>new Date(t).toISOString();
 S.day.naps=[{entity:'n1',revision:'1',start:iso(event.start+10*60000),end:iso(event.end+10*60000)}];
 assert.deepEqual(planner.approval.changes(S,approved),[]);
 S.day.naps[0].end=iso(event.end+11*60000);
 assert.deepEqual(planner.approval.changes(S,approved),['Nap 1 ended 11 minutes later than approved.']);
 S.day.naps[0].start=iso(event.start-11*60000);
 assert.match(planner.approval.changes(S,approved)[0],/started 11 minutes earlier/);
 S.day.naps[0]={entity:'n1',revision:'2',start:iso(event.start),end:null,expectedEnd:iso(event.end)};
 const activeTime=event.start+5*60000;
 const active=planner.approval.saveApproval(S,planner.plan(S.day,settings,activeTime),activeTime);
 S.day.naps[0].end=iso(event.end-11*60000);
 assert.match(planner.approval.changes(S,active)[0],/ended 11 minutes earlier/);
});

test('quick nap counts preserve shared settings, validate the range and reject a stale edit',async()=>{
 const store=shared(),settings=W.copy(W.defaults);settings.bedtime='19:30';settings.final.ideal=155;
 const saved=await run(store,[command(1,'settings',{settings,base:null})]);
 const base=saved.snap.revisions.settings;
 const r=await run(store,[
  command(2,'napCounts',{napTarget:5,napMax:3,base}),
  command(3,'napCounts',{napTarget:2,napMax:4,base}),
  command(4,'napCounts',{napTarget:1,napMax:2,base})
 ]);
 assert.match(r.responses[0].error,/target at or below maximum/);
 assert.match(r.responses[2].error,/changed since you opened it/);
 assert.equal(r.snap.settings.napTarget,2);assert.equal(r.snap.settings.napMax,4);
 assert.equal(r.snap.settings.bedtime,'19:30');assert.equal(r.snap.settings.final.ideal,155);
 assert.equal(store.files.size,2);
});
