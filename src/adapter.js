/* Scriptable adapter. All shared changes are separate immutable event files. */
async function runWakeWindow(runtime={}) {
  const testChannel=runtime.channel==='test';
  const BOOKMARK=testChannel?'WakeWindowTestShared':'WakeWindowShared';
  const input=Object.prototype.hasOwnProperty.call(runtime,'input')?runtime.input:args.shortcutParameter;
  const demo=(testChannel&&runtime.mode!=='folder')||(typeof input==='string' && input.trim().toUpperCase()==='DEMO');
  const fm=FileManager.iCloud();
  let root=null,date=null,demoNow=Date.parse('2026-10-05T16:00:00.000Z'),demoRecords=[];
  let snapshot,lastSavedAt=null,commandSaveConfirmed=false;
  const uuid=()=>UUID.string();
  const now=()=>demo?demoNow:Date.now();
  const safeJSON=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const device=()=>{const key='ww_device_v1';if(!Keychain.contains(key))Keychain.set(key,uuid());return Keychain.get(key);};
  function record(entity,value,base,deleted=false){return {schema:1,id:uuid(),entity,value,base:base||null,deleted,at:new Date().toISOString(),device:demo?'demo':device()};}
  const path=(a,b)=>fm.joinPath(a,b);
  function dir(name){const p=path(root,name);if(!fm.fileExists(p))fm.createDirectory(p,true);return p;}
  async function readFile(p){await fm.downloadFileFromiCloud(p);return JSON.parse(fm.readString(p));}
  async function readRecords(selectedDate){
    if(demo)return demoRecords.filter(r=>r.entity==='settings'||r.entity.includes(selectedDate));
    const configPath=dir('settings'),eventPath=dir('events');
    const paths=fm.listContents(configPath).filter(n=>n.endsWith('.json')).map(n=>path(configPath,n)).concat(fm.listContents(eventPath).filter(n=>n.startsWith(selectedDate+'__')&&n.endsWith('.json')).map(n=>path(eventPath,n)));
    const all=[];for(const p of paths){try{all.push(await readFile(p));}catch(e){throw Error(`Could not read a shared record (${fm.fileName(p,true)}). Open the shared folder in Files, let iCloud download it, and retry. ${e.message}`);}}
    return all;
  }
  async function readProbes(){if(demo)return [];const p=dir('checks'),out=[];for(const f of fm.listContents(p).filter(n=>n.endsWith('.json'))){out.push(await readFile(path(p,f)));}return out.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,20);}
  async function load(selectedDate,imported=null){
    const records=await readRecords(selectedDate),reduced=WW.reduce(records);
    const get=e=>reduced.latest[e];
    const settings=get('settings')&&!get('settings').deleted?get('settings').value:WW.copy(WW.defaults);WW.validateSettings(settings);
    const morning=get('morning:'+selectedDate),bed=get('bedtime:'+selectedDate),planning=get('planning:'+selectedDate);
    const planningData=planning&&!planning.deleted?planning.value:{awake:[],pins:[]};WW.validatePlanning(planningData,selectedDate,settings);
    const planningConflict=reduced.conflicts.includes('planning:'+selectedDate);
    const versions=records.filter(r=>r.entity==='planning:'+selectedDate&&!r.deleted);
    const ancestors=new Set(versions.map(r=>r.base).filter(Boolean));
    const planningVersions=planningConflict?versions.filter(r=>!ancestors.has(r.id)).map(r=>({id:r.id,at:r.at,value:r.value})):[];
    for(const v of planningVersions)WW.validatePlanning(v.value,selectedDate,settings);
    const naps=Object.entries(reduced.latest).filter(([k,r])=>k.startsWith('nap:'+selectedDate+':')&&!r.deleted).map(([entity,r])=>({...r.value,entity,revision:r.id})).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    // Distinct imports of identical times display once, even after delayed sync.
    const seen=new Set(),unique=naps.filter(n=>{const k=WW.napKey(n.start,n.end);if(seen.has(k))return false;seen.add(k);return true;});
    snapshot={mode:demo?'demo':'live',release:{version:runtime.version||APP_VERSION,channel:runtime.channel||'manual',status:runtime.status||'',updates:typeof runtime.updates==='function',updateInfo:typeof runtime.updateInfo==='function'?runtime.updateInfo():null},now:now(),date:selectedDate,settings,
      day:{date:selectedDate,morning:morning&&!morning.deleted?morning.value:null,bedtime:bed&&!bed.deleted?bed.value:null,naps:unique,planning:WW.copy(planningData),planningConflict},planningVersions,
      revisions:{settings:get('settings')?get('settings').id:null,morning:morning?morning.id:null,bedtime:bed?bed.id:null,planning:planning?planning.id:null},
      conflicts:reduced.conflicts,checkedAt:Date.now(),lastSavedAt,warnings:[],probes:await readProbes(),imported};
    if(!get('settings'))snapshot.warnings.push('Using starter settings. Review and save your preferred ranges in Settings.');
    if(unique.length&&!snapshot.day.morning)snapshot.warnings.push('Morning wake is not logged. The earlier part of the day may be incomplete.');
    date=selectedDate;return snapshot;
  }
  async function writeEvent(entity,value,base,selectedDate,deleted=false){
    const reduced=WW.reduce(await readRecords(selectedDate)),current=reduced.latest[entity];
    if((current?current.id:null)!==(base||null))throw Error('This entry changed since you opened it. Refresh, review the other edit, and try again.');
    const r=record(entity,value,base,deleted);
    if(demo)demoRecords.push(r);
    else{const folder=dir(entity==='settings'?'settings':'events');const filename=(entity==='settings'?'settings':selectedDate)+'__'+r.id+'.json';const p=path(folder,filename);fm.writeString(p,JSON.stringify(r));const check=await readFile(p);if(check.id!==r.id)throw Error('The local save could not be confirmed. Refresh before retrying.');}
    lastSavedAt=Date.now();commandSaveConfirmed=true;
  }
  async function process(cmd){
    commandSaveConfirmed=false;
    const d=cmd.data||{};let message='';const action=cmd.action;
    if(action==='updates'){
      if(typeof runtime.updates!=='function')throw Error('Open update settings from the installed launcher.');
      return {message:await runtime.updates()};
    }
    if(action==='updateControl'){
      if(typeof runtime.updateAction!=='function'||typeof runtime.updateInfo!=='function')throw Error('Replace the installed launcher with version 1.0.3 to use these controls.');
      const message=await runtime.updateAction(d.id);
      return {message,updateInfo:runtime.updateInfo()};
    }
    if(action==='load'){const requested=d.date||date;if(!/^\d{4}-\d{2}-\d{2}$/.test(requested))throw Error('Choose a date.');WW.wall(requested,'12:00',snapshot.settings.timezone);return {snapshot:await load(requested)};}
    if(action==='advance'){if(!demo)throw Error('Only available in the demo.');demoNow+=90*60000;return {snapshot:await load(date),message:'Demo clock advanced 90 minutes.'};}
    if(action==='probe'){
      if(demo)throw Error('Run the live script to test shared files.');const label=String(d.label||'').trim();if(!label||label.length>50)throw Error('Use a phone label of 1–50 characters.');const r={label,at:new Date().toISOString(),code:uuid().slice(0,8)},p=path(dir('checks'),uuid()+'.json');fm.writeString(p,JSON.stringify(r));const saved=await readFile(p);if(saved.code!==r.code)throw Error('The local check save could not be confirmed.');lastSavedAt=Date.now();commandSaveConfirmed=true;return {snapshot:await load(date),message:'Test record saved on this phone. Check it from the other phone.'};
    }
    const selectedDate=d.date||date;
    const fresh=await load(selectedDate);const s=fresh.settings;
    if(['awakePeriod','removeAwake','pinNap','releasePin','resetPlanning','resolvePlanning'].includes(action)){
      const planning=WW.copy(fresh.day.planning),base=fresh.revisions.planning;
      if((d.base||null)!==base)throw Error('The day plan changed since you opened it. Refresh and review the other parent’s change.');
      if(action==='awakePeriod'){
        const a={id:d.id||uuid(),label:String(d.label||'').trim(),start:WW.wall(selectedDate,d.start,s.timezone),end:WW.wall(selectedDate,d.end,s.timezone)};
        const index=planning.awake.findIndex(x=>x.id===a.id);
        if(d.id&&index<0)throw Error('This awake period was removed. Refresh before editing.');
        if(index>=0)planning.awake[index]=a;else planning.awake.push(a);
        message='Awake period saved on this phone. The remaining plan recalculated.';
      }else if(action==='removeAwake'){
        if(!planning.awake.some(x=>x.id===d.id))throw Error('Select a saved awake period.');planning.awake=planning.awake.filter(x=>x.id!==d.id);message='Awake period removed.';
      }else if(action==='pinNap'){
        const actual=WW.validateDay(fresh.day,s,now()),ordinal=Number(d.ordinal);
        if(!Number.isInteger(ordinal)||ordinal<=actual.length||ordinal>actual.length+6)throw Error('Pin one of the next six suggested naps, not an actual record.');
        const start=d.start?WW.wall(selectedDate,d.start,s.timezone):null,minutes=d.minutes===null||d.minutes===''?null:Number(d.minutes);
        if(start!==null&&Date.parse(start)<now())throw Error('A new pinned start must be now or in the future.');
        if(minutes!==null&&(!Number.isInteger(minutes)||minutes<s.nap.min||minutes>s.nap.max))throw Error('Pinned duration must stay within the configured nap minimum and maximum.');
        const index=planning.pins.findIndex(x=>x.ordinal===ordinal);
        const p={id:index>=0?planning.pins[index].id:uuid(),ordinal,start,minutes,anchors:actual.map(WW.napIdentity)};
        if(index>=0)planning.pins[index]=p;else planning.pins.push(p);message='Nap pin saved on this phone. Review the recalculated plan.';
        planning.pins=planning.pins.filter(x=>x.ordinal>actual.length||x.anchors.some((id,i)=>!actual[i]||WW.napIdentity(actual[i])!==id));
      }else if(action==='releasePin'){
        if(!planning.pins.some(x=>x.id===d.id))throw Error('Select a saved nap pin.');planning.pins=planning.pins.filter(x=>x.id!==d.id);message='Nap pin released.';
      }else if(action==='resolvePlanning'){
        const chosen=fresh.planningVersions.find(v=>v.id===d.version);
        if(!chosen)throw Error('That conflicting plan is no longer available. Refresh and review again.');
        planning.awake=WW.copy(chosen.value.awake);planning.pins=WW.copy(chosen.value.pins);message='Selected planning version saved. Actual sleep was preserved.';
      }else{
        planning.awake=[];planning.pins=[];message='Awake periods and nap pins cleared. Actual sleep and settings were preserved.';
      }
      WW.validatePlanning(planning,selectedDate,s);
      await writeEvent('planning:'+selectedDate,planning,base,selectedDate);
    }else if(action==='settings'){
      WW.validateSettings(d.settings);
      const hasEvents=demo?demoRecords.some(r=>r.entity!=='settings'):fm.listContents(dir('events')).some(n=>n.endsWith('.json'));
      if(d.settings.timezone!==s.timezone && hasEvents)throw Error('Change timezone before adding entries. V1 keeps a fixed household timezone for existing records.');
      await writeEvent('settings',d.settings,d.base,selectedDate);message='Shared defaults saved on this phone.';
    }else if(action==='bedtime'){
      WW.wall(selectedDate,d.time,s.timezone);await writeEvent('bedtime:'+selectedDate,d.time,d.base,selectedDate);message='Bedtime updated and schedule recalculated.';
    }else if(action==='morning'){
      const iso=d.time?WW.wall(selectedDate,d.time,s.timezone):null;WW.validateDay({...fresh.day,morning:iso},s,now());await writeEvent('morning:'+selectedDate,iso,d.base,selectedDate,!iso);message='Morning wake updated.';
    }else if(action==='activeNap'){
      const start=WW.wall(selectedDate,d.start,s.timezone),expectedEnd=WW.wall(selectedDate,d.expectedEnd,s.timezone);
      const key='nap:'+selectedDate+':'+WW.napKey(start,null),entity=d.entity||key;
      if(!entity.startsWith('nap:'+selectedDate+':'))throw Error('An active nap must stay on its original date.');
      const reduced=WW.reduce(await readRecords(selectedDate)),old=reduced.latest[entity];
      if(!d.entity&&fresh.day.naps.some(n=>n.end!==null&&n.start===start))return {snapshot:fresh,message:'A completed nap already has this start time. No active nap was added.'};
      if(old&&!old.deleted&&old.value.end!==null)throw Error('This nap is already completed. Refresh to view its actual wake time.');
      if(!d.entity&&old&&!old.deleted)return {snapshot:fresh,message:'This active nap is already recorded. Tap it to change the expected wake.'};
      if(!d.entity&&old&&old.deleted&&d.imported)return {snapshot:fresh,message:'This active nap was cancelled. No duplicate was added.'};
      const base=d.entity?d.base:(old?old.id:null);
      WW.validateDay({...fresh.day,naps:fresh.day.naps.filter(n=>n.entity!==entity).concat({start,end:null,expectedEnd})},s,now());
      await writeEvent(entity,{start,end:null,expectedEnd},base,selectedDate);message='Nap in progress saved. Remaining times use the expected wake.';
    }else if(action==='nap'){
      const start=WW.wall(selectedDate,d.start,s.timezone),end=WW.wall(selectedDate,d.end,s.timezone);
      const active=fresh.day.naps.find(n=>n.end===null&&n.start===start);
      const key='nap:'+selectedDate+':'+WW.napKey(start,end),entity=d.entity||(active?active.entity:key);
      if(d.entity && !d.entity.startsWith('nap:'+selectedDate+':'))throw Error('To move a nap to another date, delete it from the old date and add it on the correct date.');
      const reduced=WW.reduce(await readRecords(selectedDate));
      if(!d.entity&&d.imported&&Object.values(reduced.latest).some(r=>r.entity==='nap:'+selectedDate+':'+WW.napKey(start,null)&&r.deleted))return {snapshot:fresh,message:'This nap was deleted or cancelled. No duplicate was added.'};
      const old=reduced.latest[key];let base=d.base;
      if(!d.entity&&active)base=active.revision;
      if(!d.entity&&!active && old && old.deleted && !d.imported)base=old.id;
      else if(!d.entity&&!active && (old || fresh.day.naps.some(n=>n.start===start&&n.end===end))) return {snapshot:fresh,message:'This nap was already imported (or deleted). No duplicate was added.'};
      WW.validateDay({...fresh.day,naps:fresh.day.naps.filter(n=>n.entity!==entity).concat({start,end})},s,now());
      await writeEvent(entity,{start,end},base,selectedDate);message=active?'Actual wake saved. The same nap is now completed and the day recalculated.':'Nap saved on this phone. Schedule recalculated.';
    }else if(action==='deleteNap'){
      if(!d.entity||!d.entity.startsWith('nap:'+selectedDate+':'))throw Error('Select a recorded nap.');await writeEvent(d.entity,null,d.base,selectedDate,true);message='Nap removed from the displayed day.';
    }else throw Error('Unknown dashboard action.');
    return {snapshot:await load(selectedDate),message};
  }
  if(demo){
    date='2026-10-05';demoRecords=[record('settings',WW.copy(WW.defaults),null),record('nap:'+date+':sample',{start:'2026-10-05T15:00:00.000Z',end:'2026-10-05T16:00:00.000Z'},null)];
  }else{
    if(!fm.bookmarkExists(BOOKMARK))throw Error('Create a Scriptable File Bookmark named '+BOOKMARK+' for the '+(testChannel?'separate test':'shared family')+' iCloud folder. Enable Run in App on the Shortcut’s Run Script action.');
    root=fm.bookmarkedPath(BOOKMARK);if(!fm.fileExists(root)||!fm.isDirectory(root))throw Error('The '+BOOKMARK+' bookmark must point to a folder. Open that folder in Files and try again.');
    if(testChannel){
      if(!fm.bookmarkExists('WakeWindowShared'))throw Error('Configure the production bookmark first so the test folder can be checked for isolation.');
      const normalize=p=>p.replace(/^\/private\/var\//,'/var/').replace(/\/+$/,'').normalize('NFC');
      const production=normalize(fm.bookmarkedPath('WakeWindowShared')),testing=normalize(root);
      if(testing===production||testing.startsWith(production+'/')||production.startsWith(testing+'/'))throw Error('Test and production folders must be separate, with neither inside the other. Choose a separate sibling folder.');
    }
    // Read settings first to determine the household date.
    const configs=[];for(const f of fm.listContents(dir('settings')).filter(f=>f.endsWith('.json')))configs.push(await readFile(path(dir('settings'),f)));
    const latest=WW.reduce(configs).latest.settings;const s=latest?latest.value:WW.copy(WW.defaults);date=WW.parts(now(),s.timezone).date;
  }
  await load(date);
  let imported=null;
  if(!demo && input!=null && String(input).trim() && String(input).trim().toUpperCase()!=='OPEN'){
    imported=WW.parseOCR(typeof input==='object'?JSON.stringify(input):String(input),now(),snapshot.settings.timezone,snapshot.settings.nap.ideal);
    if(imported.date)date=imported.date;
    await load(date,imported);
  }
  const web=new WebView();await web.loadHTML(HTML_TEMPLATE.replace('__STATE__',safeJSON(snapshot)));
  // WKWebView also inspects the immediate evaluation result in callback mode.
  // An assignment of completion returns a FUNCTION and fails on real iPhones.
  // Keep both the immediate result and callback payload explicitly serializable.
  const waitForCommand = `(function(){
    const finish=completion;
    const send=function(command){finish(JSON.stringify(command));};
    if(window.__queue.length){send(window.__queue.shift());}
    else{window.__waiter=send;}
    return null;
  })(); null;`;
  let closed=false,bridgeError=null;
  async function handleButtons(){
    while(!closed){
      const payload=await web.evaluateJavaScript(waitForCommand,true);
      if(closed)return;
      if(typeof payload!=='string')throw Error('The dashboard connection returned no command. Close the dashboard and run it again.');
      const command=JSON.parse(payload);
      if(!command||!command.action)throw Error('The dashboard sent an invalid command.');
      let response;
      try{response={id:command.id,...await process(command),saveConfirmed:commandSaveConfirmed};}catch(e){response={id:command.id,error:e.message,lastSavedAt,saveConfirmed:commandSaveConfirmed};}
      if(closed)return;
      await web.evaluateJavaScript(`window.receive(${safeJSON(response)}); null;`,false);
    }
  }
  // Keep the script's main lifetime tied to presentation, even while a button
  // callback is pending. A pending callback must not prevent clean dismissal.
  const buttons=handleButtons().catch(async e=>{
    if(closed)return;
    bridgeError=e;
    try{await web.evaluateJavaScript(`connectionStopped(${safeJSON('Dashboard connection stopped. Close and reopen. '+e.message)}); null;`,false);}catch(_){}
  });
  try{await web.present(false);}finally{closed=true;}
  if(bridgeError)throw bridgeError;
  Script.complete();
}
try { await runWakeWindow(); } catch(e) { const a=new Alert();a.title='Wake Window';a.message=e.message;a.addAction('OK');await a.presentAlert();Script.complete(); }
