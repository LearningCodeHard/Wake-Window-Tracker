function detectedBalances(text){
  if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('Provide 1–8,000 characters from Extract Text from Image.');
  const lines=text.replace(/[−–]/g,'-').replace(/\u00a0/g,' ').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const label=/\b(?:(?:current|closing|posted|ledger|available|account|checking|savings)\s+)?balance\b/i;
  const ignore=/\b(?:credit|statement|minimum|payment|pending|previous|prior|remaining|original|total|combined|average|beginning|opening|outstanding|loan|reward)\b|balance\s+(?:due|transfer)/i;
  const dollars=/\(?\s*(?:[-+]\s*\$\s*|\$\s*[-+]?\s*)\d+(?:,\d{3})*(?:\.\d{2})?(?![\d.,])\s*\)?/g;
  const exact=/^(?:\(\s*)?(?:[-+]\s*\$?\s*|\$\s*[-+]?\s*)?\d+(?:,\d{3})*(?:\.\d{2})?(?:\s*\))?$/;
  const out=[],seen=new Set();
  for(let i=0;i<lines.length&&out.length<12;i++){
    const l=lines[i],m=l.match(label);if(!m||ignore.test(l)||(l.match(/\bbalance\b/gi)||[]).length!==1)continue;
    const tagged=l.match(dollars)||[];
    let val=null;
    if(tagged.length===1)val=tagged[0];
    else if(tagged.length===0){
      const tail=l.slice(m.index+m[0].length).trim().replace(/^[:=]\s*/,'');
      const possible=tail||lines[i+1]||'';
      if(exact.test(possible)&&/\.\d{2}\s*\)?$/.test(possible))val=possible;
    }
    if(!val)continue;
    const compact=val.replace(/[$,\s]/g,'');
    if(compact.startsWith('(')!==compact.endsWith(')'))continue;
    const normalized=compact.replace(/^\((\d+(?:\.\d+)?)\)$/,'-$1').replace(/^\+/,'');
    let cents;try{cents=Budget.cents(normalized);}catch(_){continue;}
    const key=m[0].toLowerCase()+':'+cents;if(seen.has(key))continue;seen.add(key);
    out.push({label:m[0],cents});
  }
  return out;
}
// Runtime adapters: local persistence, in-app editing, and UI-free Shortcut commands.
async function runBudgetPlanner(raw, options = {}) {
  const inApp=!!config.runsInApp, fm=FileManager.local(),root=fm.joinPath(fm.documentsDirectory(),options.testing?'BudgetPlannerTestV1':'BudgetPlannerV1');
  if(!fm.fileExists(root))fm.createDirectory(root,true);
  const path=fm.joinPath(root,'plan.json'),backup=fm.joinPath(root,'previous-plan.json'),lock=fm.joinPath(root,'writer-lock.json');
  const pause=ms=>new Promise(resolve=>Timer.schedule(ms,false,resolve));
  const removeQuietly=file=>{try{if(fm.fileExists(file))fm.remove(file);}catch(e){console.log('Budget Planner cleanup: '+e.message);}};
  const marker=/^writer-(\d+)-(\d+)-([a-z0-9]+)$/;
  const tickets=()=>fm.listContents(root).flatMap(name=>{
    const parts=name.match(marker);
    if(!parts||Number(parts[1])<=Date.now())return [];
    return [{name, order:Number(parts[2]), token:parts[3]}];
  });

  // Each writer publishes an intent, then an ordered ticket. File names are unique.
  // Equal ticket numbers are ordered by token. No writer overwrites another's lock.
  async function withWriter(work){
    const token=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
    const expires=Date.now()+30000;
    const intent=fm.joinPath(root,'writer-'+expires+'-0-'+token);
    let ready;
    try{
      for(const name of fm.listContents(root)){
        const parts=name.match(marker);
        if(parts&&Number(parts[1])<=Date.now())removeQuietly(fm.joinPath(root,name));
      }
      let oldLock;
      if(fm.fileExists(lock)){
        try{oldLock=JSON.parse(fm.readString(lock));}catch(_){}
        if(oldLock?.token&&oldLock.expires>Date.now())throw Error('Another budget save is in progress. Retry after it finishes.');
      }
      fm.writeString(intent,'');
      const order=tickets().reduce((high,t)=>Math.max(high,t.order),0)+1;
      ready=fm.joinPath(root,'writer-'+expires+'-'+order+'-'+token);
      fm.writeString(ready,'');
      removeQuietly(intent);
      const owns=()=>Date.now()<expires&&fm.fileExists(ready);
      for(let attempt=0;attempt<40;attempt++){
        const current=tickets(),numbered=new Set(current.filter(t=>t.order).map(t=>t.token));
        const blocked=current.some(t=>t.token!==token&&(
          t.order ? t.order<order||t.order===order&&t.token<token : !numbered.has(t.token)
        ));
        if(!blocked&&owns()){
          return work(owns,token);
        }
        await pause(150);
      }
      throw Error('Another budget save is in progress. Retry after it finishes.');
    }finally{
      removeQuietly(intent);
      if(ready)removeQuietly(ready);
    }
  }
  const read=p=>Budget.validate(JSON.parse(fm.readString(p)));
  const scriptSafe=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const open=inApp&&(raw===undefined||raw===null||raw===''||String(raw).toUpperCase()==='OPEN');
  const p=open?null:BudgetAutomation.parse(typeof raw==='string'&&raw.toUpperCase()==='OPEN'?'VIEW':raw);
  const importing=p?.action==='IMPORT_BALANCE';
  if(importing&&!inApp)throw Error('IMPORT_BALANCE needs Run in App on so you can review the closing balance.');
  const imported=importing?detectedBalances(p.text):null,wantsApp=open||importing;let state;
  const show=async(title,message)=>{const a=new Alert();a.title=title;a.message=message;a.addAction('OK');await a.presentAlert();};
  if(fm.fileExists(path)){
    try{state=read(path);}catch(e){
      if(!wantsApp||!fm.fileExists(backup))throw Error('The saved plan cannot be read. Open Scriptable to recover a previous version; the existing file was preserved.');
      read(backup);const a=new Alert();a.title='Recover previous saved plan?';a.message='The current file cannot be read. Recover the previous version? The unreadable file will be preserved.';a.addAction('Recover');a.addCancelAction('Cancel');if(await a.presentAlert()<0)return;
      state=await withWriter(owns=>{
        try{return read(path);}catch(_){}
        const file=fm.joinPath(root,'unreadable-'+Date.now()+'.json');
        fm.writeString(file,fm.readString(path));
        if(!owns())throw Error('Recovery timed out. Try again.');
        fm.writeString(path,JSON.stringify(read(backup)));return read(path);
      });
    }
  }else if(!wantsApp)throw Error('SETUP_REQUIRED: Run Budget Planner in Scriptable once before using background commands.');
  else state=await withWriter(owns=>{
    if(fm.fileExists(path))return read(path);
    const initial=fm.fileExists(backup)?read(backup):Budget.seed();
    if(!owns())throw Error('Setup timed out. Try again.');
    fm.writeString(path,JSON.stringify(initial));
    return read(path);
  });
  async function save(next,revision,deadline=Infinity){
    return withWriter((own,token)=>{
      if(Date.now()>deadline)throw Error('That save timed out before writing. Try again.');
      const stage=fm.joinPath(root,'pending-'+token+'.json');
      try{
        const original=fm.readString(path),disk=Budget.validate(JSON.parse(original));if(disk.revision!==revision)throw Error('The plan changed in another session. Reopen this dashboard or read SUMMARY again before saving.');
        const checked=BudgetAutomation.redactCaptureReceipts(Budget.validate(Budget.clone(next)));checked.revision=disk.revision+1;
        if(checked.balance.date>Budget.today())throw Error('A starting balance cannot be dated in the future.');
        Budget.forecast(checked,366,undefined,Budget.today()>checked.balance.date?Budget.today():checked.balance.date);
        const data=JSON.stringify(checked);fm.writeString(stage,data);if(JSON.stringify(read(stage))!==data)throw Error('The staged plan could not be verified.');
        if(!own()||fm.readString(path)!==original)throw Error('The plan changed while this save was staged. No change applied.');
        const prior=BudgetAutomation.redactCaptureReceipts(Budget.clone(disk));
        if(prior.integrations&&checked.integrations){
          const remaining=new Set(checked.integrations.inbox.map(item=>item.id));
          prior.integrations.inbox=prior.integrations.inbox.filter(item=>remaining.has(item.id));
        }
        const backupData=JSON.stringify(prior);
        fm.writeString(backup,backupData);
        if(fm.readString(backup)!==backupData)throw Error('Could not verify the previous-plan backup. No change applied.');
        if(!own()||fm.readString(path)!==original)throw Error('The plan changed while the backup was prepared. No change applied.');
        // On iOS move() may refuse to replace an existing destination. writeString supports overwrite.
        try{
          fm.writeString(path,fm.readString(stage));
          const verified=read(path);
          if(JSON.stringify(verified)!==data)throw Error('Save verification failed.');
          state=verified;return verified;
        }catch(e){
          if(!own())throw Error('The save could not be confirmed. Reload saved data before retrying.');
          let current;try{current=fm.readString(path);}catch(_){}
          if(current===data){state=read(path);return state;}
          if(current!==original){
            // Do not overwrite a different valid plan that may belong to another writer.
            let valid=false;try{Budget.validate(JSON.parse(current));valid=true;}catch(_){}
            if(valid)throw Error('The plan changed during saving. Reload saved data before retrying.');
            try{
              fm.writeString(path,original);
              if(fm.readString(path)!==original)throw Error('Restored data did not verify.');
            }catch(_){throw Error('Save failed. A verified backup is available. Reopen the planner to recover it.');}
          }
          throw Error('Save failed; your previous plan was kept. '+(e.message||String(e)));
        }
      }finally{removeQuietly(stage);}
    });
  }
  if(!wantsApp){
    const applied=BudgetAutomation.command(state,p);if(applied.next){state=await save(applied.next,state.revision);applied.output.revision=state.revision;}
    // Background Shortcuts consume a returned value; presentation is the caller's job.
    const asText=p.format==='text'||(['SUMMARY','VIEW','CHECKING'].includes(p.action)&&p.format===undefined);
    const output=p.format==='html'?BudgetAutomation.snapshot(state,p):asText?(applied.output.summary||JSON.stringify(applied.output)):applied.output;
    Script.setShortcutOutput(output);
    return;
  }
  const web=new WebView();web.shouldAllowRequest=request=>request.url==='about:blank'||request.url.startsWith('data:');
  await web.loadHTML(DASHBOARD.replace('/*INITIAL_STATE*/',()=>scriptSafe(state)).replace('/*BALANCE_IMPORT*/',()=>scriptSafe(imported)));
  let closed=false;
  const presentation=web.present(false).then(()=>{closed=true;});
  async function pump(){
    let pending=null;
    while(!closed){
      await pause(300);if(closed)return;
      if(pending){
        try{await web.evaluateJavaScript('window.budgetReply('+JSON.stringify(pending.id)+','+scriptSafe(pending.response)+')',false);pending=null;}
        catch(e){if(!closed)console.log('Retrying dashboard reply: '+e.message);}
        continue;
      }
      let command;
      try{command=JSON.parse(await web.evaluateJavaScript('JSON.stringify(window.budgetTake())',false));}
      catch(e){if(!closed)console.log('Retrying dashboard bridge: '+e.message);continue;}
      if(closed||!command)continue;
      if(Date.now()>command.expiresAt)continue;
      let response;
    try{
      if(command.action==='save')response={ok:true,state:await save(command.payload.state,command.payload.revision,command.expiresAt)};
      else if(command.action==='reload'){state=read(path);response={ok:true,state};}
      else if(command.action==='export'){
        const output=fm.joinPath(fm.temporaryDirectory(),'Budget_Planner_Backup_'+Budget.today()+'.json');fm.writeString(output,JSON.stringify(BudgetAutomation.redactCaptureReceipts(read(path)),null,2));await ShareSheet.present([output]);response={ok:true};
      }else if(command.action==='restore'){
        const files=await DocumentPicker.open(['public.json']);if(!files.length)response={ok:true};
        else{const cloud=FileManager.iCloud();if(cloud.isFileStoredIniCloud(files[0]))await cloud.downloadFileFromiCloud(files[0]);
          const restored=Budget.validate(JSON.parse(fm.readString(files[0]))),a=new Alert();a.title='Replace this budget?';a.message='Restore this backup? The current plan will be retained as the previous saved version.';a.addDestructiveAction('Restore backup');a.addCancelAction('Cancel');response=await a.presentAlert()<0?{ok:true}:{ok:true,state:await save(restored,command.payload.revision)};
        }
      }else throw Error('Unknown dashboard action.');
    }catch(e){response={ok:false,error:e.message||String(e)};}
    pending={id:command.id,response};
  }}
  const bridge=pump();await Promise.race([presentation,bridge]);if(!closed)await presentation;
}
module.exports={run:runBudgetPlanner};
