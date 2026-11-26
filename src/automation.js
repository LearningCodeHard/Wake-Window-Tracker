/* Versioned command boundary shared by Shortcuts and future import/notification adapters. */
const BudgetAutomation=(()=>{
  const B=Budget,fail=m=>{throw Error(m);};
  const actions=['SUMMARY','FORECAST','VIEW','UPDATE_BALANCE','ADD_ENTRY','ADJUST_PAYMENT','CAPTURE_TEXT','INBOX','NOTIFICATION_PLAN','IMPORT_BALANCE','CHECKING'];
  function parse(value){
    if(value===undefined||value===null||value==='')return {action:'SUMMARY'};
    let p=value;
    if(typeof p==='string'){const t=p.trim();if(t.startsWith('{')){try{p=JSON.parse(t);}catch(e){fail('Shortcut input must be valid JSON.');}}else if(/^CHECKING:/i.test(t))p={action:'CHECKING',amount:t.slice(9).trim()};else p={action:t.toUpperCase()};}
    if(!p||typeof p!=='object'||Array.isArray(p))fail('Pass a command name or a Shortcut dictionary.');
    p=B.clone(p);p.action=String(p.action||(typeof p.text==='string'?'CAPTURE_TEXT':'SUMMARY')).toUpperCase();
    if(!actions.includes(p.action))fail('Unknown action. Use '+actions.join(', ')+'.');
    if(p.apiVersion!==undefined&&p.apiVersion!==1)fail('Unsupported automation API version.');
    if(p.format!==undefined&&!['text','json'].includes(p.format)&&!(p.action==='VIEW'&&p.format==='html'))fail('format must be text or json (VIEW also accepts html).');
    if(p.days!==undefined&&(!Number.isInteger(p.days)||p.days<1||p.days>365))fail('days must be an integer from 1 to 365.');
    return p;
  }
  const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,k)=>(o[k]=x[k],o),{}):x);
  const captureReceipt=signature=>'sha256:'+sha256(
    Array.from(encodeURIComponent(signature).matchAll(/%([0-9a-f]{2})|([^%])/gi),
      match=>match[1]?parseInt(match[1],16):match[2].charCodeAt(0))
  );
  function redactCaptureReceipts(s){
    for(const receipt of s.integrations?.requests||[]){
      if(receipt.signature.startsWith('sha256:'))continue;
      let saved;
      try{saved=JSON.parse(receipt.signature);}catch(_){continue;}
      if(saved?.action==='CAPTURE_TEXT')receipt.signature=captureReceipt(receipt.signature);
    }
    return s;
  }
  function command(s,p,now=B.today()){
    B.validate(s);p=parse(p);const start=now>s.balance.date?now:s.balance.date,days=p.days||90;
    const report=()=>{const f=B.forecast(s,days,undefined,start);return {apiVersion:1,ok:true,action:p.action,revision:s.revision,asOf:s.balance.date,balanceBasis:s.balance.basis||'closing',startingBalanceCents:s.balance.cents,forecastStart:start,through:f.end.date,projectedTodayCents:f.points[0].cents,endingBalanceCents:f.end.cents,lowestBalanceCents:f.min.cents,lowestDate:f.min.date,firstShortfall:f.first?.date||null,bufferCents:s.buffer,unreviewedChecking:f.unreviewedChecking,pendingCaptures:s.integrations?.inbox.length||0,summary:(s.balance.basis==='checking_snapshot'&&start===s.balance.date?'Checking forecast ':'Projected closing balance ')+start+': '+(f.points[0].cents/100).toFixed(2)+' USD. Lowest: '+(f.min.cents/100).toFixed(2)+' USD on '+f.min.date+'. Ending: '+(f.end.cents/100).toFixed(2)+' USD on '+f.end.date+'. '+(s.balance.basis==='checking_snapshot'?'Checking snapshot dated '+s.balance.date+'. '+(f.unreviewedChecking.length?f.unreviewedChecking.length+' same-day items still need posting review.':'Pending items marked for that date are included.'):'Verified balance dated '+s.balance.date+'.'),...(p.action==='FORECAST'?{points:f.points.map(x=>({date:x.date,closingBalanceCents:s.balance.basis==='checking_snapshot'&&x.date===s.balance.date&&!x.events.length?null:x.cents,...(s.balance.basis==='checking_snapshot'&&x.date===s.balance.date?{snapshotBalanceCents:s.balance.cents}:{}),transactions:x.events}))}:{})};};
    if(['SUMMARY','FORECAST','VIEW'].includes(p.action))return {output:report()};
    if(p.action==='INBOX')return {output:{apiVersion:1,ok:true,action:p.action,revision:s.revision,inbox:B.clone(s.integrations?.inbox||[])}};
    if(p.action==='NOTIFICATION_PLAN'){
      const f=B.forecast(s,Math.min(days,30),undefined,start),items=f.events.filter(e=>e.date>now).slice(0,50).map(e=>({id:'budget-due:'+e.key,date:e.date,title:'Budget Planner',body:'A scheduled '+(e.kind==='income'?'deposit':'payment')+' is due. Review your planner.',eventKey:e.key}));
      return {output:{apiVersion:1,ok:true,action:p.action,revision:s.revision,enabled:false,scheduled:false,items,summary:'Notification candidates only; no notifications were scheduled.'}};
    }
    // Trusted Shortcut supplies one already-extracted USD balance. This is a replacement, not a transaction.
    if(p.action==='CHECKING'){
      const amount=typeof p.amount==='string'?p.amount.trim():'';
      const exact=/^(?:-?\$|\$-)(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\.\d{2}$/;
      const normalized=amount.replace(/^\(\$(.+)\)$/, (_, value) => '-$'+value);
      if(!exact.test(normalized))fail('Pass one checking balance like CHECKING: $1,234.56.');
      if(!B.validDate(now)||s.balance.date>now)fail('Today is earlier than the saved balance date. Check the phone date.');
      const cents=B.cents(normalized.replace(/[$,]/g,''));
      const same=s.balance.basis==='checking_snapshot'&&s.balance.cents===cents&&s.balance.date===now&&!s.sample;
      const next=same?undefined:B.clone(s);
      if(next){
        for(const override of Object.values(next.overrides)){
          if(override.snapshotDate!==now)continue;
          delete override.snapshotDate;
          delete override.checking;
        }
        next.balance={date:now,cents,basis:'checking_snapshot'};next.sample=false;B.validate(next);B.forecast(next,365,undefined,now);}
      const scheduledSameDay=B.events(s,now,now).length;
      const amountLabel=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
      return {next,output:{apiVersion:1,ok:true,action:p.action,alreadyApplied:same,revision:s.revision+(same?0:1),asOf:now,balanceCents:cents,balanceBasis:'checking_snapshot',scheduledSameDay,summary:(same?'Checking already up to date: ':'Checking updated: ')+amountLabel+' on '+now+'.'+(scheduledSameDay?' Review today’s '+scheduledSameDay+' scheduled '+(scheduledSameDay===1?'entry':'entries')+'; mark each as posted or pending.':'')}};
    }
    if(typeof p.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(p.requestId))fail('Write actions require a unique requestId (1–80 letters, digits, _ or -).');
    const body=B.clone(p);delete body.requestId;delete body.expectedRevision;delete body.format;const signature=canonical(body);
    if(signature.length>20000)fail('Shortcut input is too large.');
    const old=s.integrations?.requests.find(r=>r.id===p.requestId);
    if(old){if(old.signature!==signature&&(p.action!=='CAPTURE_TEXT'||old.signature!==captureReceipt(signature)))fail('requestId was already used for different input.');return {output:{apiVersion:1,ok:true,action:p.action,alreadyApplied:true,revision:s.revision,summary:'This request was already applied.'}};}
    if(p.action!=='CAPTURE_TEXT'&&p.expectedRevision!==s.revision)fail('Supply the current expectedRevision from SUMMARY before changing financial data.');
    if(p.expectedRevision!==undefined&&p.expectedRevision!==s.revision)fail('Stale expectedRevision. Read SUMMARY again before updating.');
    const next=B.clone(s);next.integrations=next.integrations||{requests:[],inbox:[]};
    if(p.action==='UPDATE_BALANCE'){
      if(p.basis!=='closing'||!B.validDate(p.date)||p.date>now)fail('Provide basis:"closing" and a date on or before today.');
      next.balance={cents:B.cents(p.amount),date:p.date};next.sample=false;
    }else if(p.action==='ADD_ENTRY'){
      const e=p.entry;if(!e||typeof e!=='object')fail('Provide an entry dictionary.');
      const id='auto_'+p.requestId;if(next.rules.some(r=>r.id===id))fail('An entry for this request already exists.');
      const r={id,name:e.name,kind:e.kind,cents:B.cents(e.amount),start:e.start,frequency:e.frequency||'once',estimated:e.estimated===true};if(e.installments!==undefined){r.installments=e.installments;r.end=B.installmentEnd(r.start,r.installments);if(e.end!==undefined&&e.end!==r.end)fail('Last due date must match the installment count.');}else if(e.end)r.end=e.end;if(r.frequency==='semimonthly')r.days=e.days;if(e.category!==undefined)r.category=e.category;if(e.cardPayoff!==undefined)r.cardPayoff=e.cardPayoff;next.rules.push(r);next.sample=false;
    }else if(p.action==='ADJUST_PAYMENT'){
      const key=p.eventKey;if(typeof key!=='string')fail('Provide eventKey from FORECAST.');
      const {id,date:original}=B.occurrenceRef(key),r=next.rules.find(r=>r.id===id);
      if(!r||!B.hasOccurrence(r,key))fail('Payment no longer belongs to its schedule.');
      if(p.skip!==undefined&&typeof p.skip!=='boolean'||p.confirmed!==undefined&&typeof p.confirmed!=='boolean')fail('skip and confirmed must be booleans.');
      next.overrides[key]={...next.overrides[key],date:p.date||original,cents:B.cents(p.amount),skip:p.skip===true,confirmed:p.confirmed===true};next.sample=false;
    }else if(p.action==='CAPTURE_TEXT'){
      if(typeof p.text!=='string'||!p.text.trim()||p.text.length>8000)fail('Captured text must contain 1–8,000 characters.');
      if(p.source!==undefined&&(typeof p.source!=='string'||p.source.length>100))fail('Invalid capture source.');
      const id='capture_'+p.requestId,existing=next.integrations.inbox.find(i=>i.id===id);
      if(existing){if(existing.text!==p.text)fail('Capture ID was used for different text.');return {output:{apiVersion:1,ok:true,action:p.action,alreadyApplied:true,revision:s.revision}};}
      if(next.integrations.inbox.length>=50)fail('Review or dismiss pending captured text before adding more.');
      next.integrations.inbox.push({id,text:p.text,source:p.source||'Shortcut',capturedAt:new Date().toISOString()});
    }
    next.integrations.requests.push({id:p.requestId,signature:p.action==='CAPTURE_TEXT'?captureReceipt(signature):signature});next.integrations.requests=next.integrations.requests.slice(-100);B.validate(next);
    B.forecast(next,365,undefined,now>next.balance.date?now:next.balance.date);
    return {next,output:{apiVersion:1,ok:true,action:p.action,alreadyApplied:false,revision:s.revision+1,summary:p.action==='CAPTURE_TEXT'?'Text captured for review. No financial values were changed.':'Budget updated.'}};
  }
  function snapshot(s,p,now=B.today()){
    const f=B.forecast(s,p.days||90,undefined,now>s.balance.date?now:s.balance.date),esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
    const pts=f.points,w=340,h=180,min=Math.min(0,...pts.map(x=>x.cents)),max=Math.max(0,...pts.map(x=>x.cents)),pad=Math.max(100,(max-min)*.1),x=i=>55+i/(pts.length-1)*273,y=n=>12+(max+pad-n)/(max-min+2*pad)*135;
    const path=pts.map((p,i)=>i?'H'+x(i)+'V'+y(p.cents):'M'+x(i)+','+y(p.cents)).join(' ');
    const d=B.date(now),count=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(),offset=(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).getUTCDay()+6)%7;
    const calendar='<div class="cal"><strong>'+esc(d.toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'}))+'</strong><div class="grid">'+['M','T','W','T','F','S','S'].map(s=>'<span>'+s+'</span>').join('')+'<span></span>'.repeat(offset)+Array.from({length:count},(_,i)=>'<span class="'+(i+1===d.getUTCDate()?'today':'')+'">'+(i+1)+'</span>').join('')+'</div></div>';
    return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>:root{--bg:#f5f0e8;--panel:#fffcf7;--ink:#382f25;--soft:#756653;--line:#dfd3c3;--accent:#855923}@media(prefers-color-scheme:dark){:root{--bg:#201d19;--panel:#2b2721;--ink:#f1e8da;--soft:#c6b69d;--line:#4b4134;--accent:#e9ba77}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,sans-serif;padding:18px}h1{font-size:24px;margin:0}.top{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;margin:20px 0}.balance{font:36px Georgia}.cal{width:140px;font-size:10px;text-align:center}.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.today{background:var(--accent);color:var(--bg);border-radius:4px}.panel{padding:15px;border:1px solid var(--line);border-radius:14px;background:var(--panel);margin:14px 0}.row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line);padding:9px 0;overflow-wrap:anywhere}.row>span:first-child{min-width:0}small{color:var(--soft)}svg{display:block;width:100%;height:auto}svg text{fill:var(--soft);font-size:10px}details{margin:15px 0}summary{min-height:44px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 3px;text-align:left;border-bottom:1px solid var(--line)}td:last-child{text-align:right}</style></head><body><small>BUDGET PLANNER · SHORTCUT VIEW</small><h1>Your money, ahead.</h1><div class="top"><div><small>'+(s.balance.basis==='checking_snapshot'?'Checking snapshot':'Verified closing balance')+'</small><div class="balance">'+money(s.balance.cents)+'</div><small>'+s.balance.date+'</small></div>'+calendar+'</div>'+(s.balance.basis==='checking_snapshot'?'<small>'+f.unreviewedChecking.length+' same-day items still need posting review.</small>':'')+'<section class="panel"><strong>Balance outlook</strong><p><small>'+f.points[0].date+' through '+f.end.date+'</small></p><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Daily balance projection"><line x1="55" x2="328" y1="'+y(0)+'" y2="'+y(0)+'" stroke="var(--line)"/><path d="'+path+'" fill="none" stroke="var(--accent)" stroke-width="2.5"/><text x="50" y="'+(y(0)+4)+'" text-anchor="end">$0</text><text x="55" y="173">'+f.points[0].date+'</text><text x="328" y="173" text-anchor="end">'+f.end.date+'</text></svg><div class="row"><span>Lowest · '+f.min.date+'</span><strong>'+money(f.min.cents)+'</strong></div><div class="row"><span>Ending balance</span><strong>'+money(f.end.cents)+'</strong></div></section><section class="panel"><strong>Coming up</strong>'+f.events.slice(0,10).map(e=>'<div class="row"><span>'+esc(e.name)+'<br><small>'+e.date+'</small></span><span>'+money(e.cents)+'</span></div>').join('')+'</section><details><summary>Exact daily balances</summary><table><tr><th>Date</th><th>Balance</th></tr>'+pts.map(p=>'<tr><td>'+p.date+'</td><td>'+money(p.cents)+'</td></tr>').join('')+'</table></details><small>Read-only Shortcut snapshot. Open Budget Planner in Scriptable for editing and interactive chart inspection.</small></body></html>';
  }
  return {parse,command,snapshot,redactCaptureReceipts};
})();
if(typeof module!=='undefined')module.exports=BudgetAutomation;

