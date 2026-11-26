/* Shared forecast and validation engine; dates are civil dates, money is cents. */
const Budget = (() => {
  const DAY = 86400000;
  const date = s => new Date(s + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(+date(s)) && iso(date(s)) === s && s >= '2000-01-01' && s <= '2100-12-31';
  const add = (s, n) => iso(new Date(+date(s) + n * DAY));
  const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
  const cents = s => { if (!/^-?\d+(\.\d{1,2})?$/.test(String(s))) throw Error('Use an amount with at most two decimal places.'); const n = Math.round(Number(s)*100); if (!Number.isSafeInteger(n) || Math.abs(n)>1e12) throw Error('Amount is too large.'); return n; };
  const clone = x => JSON.parse(JSON.stringify(x));
  const requireValue = (ok,msg) => { if (!ok) throw Error(msg); };
  const monthDate = (y,m,day) => iso(new Date(Date.UTC(y,m,Math.min(day,new Date(Date.UTC(y,m+1,0)).getUTCDate()))));
  function installmentEnd(first, count) {
    requireValue(validDate(first),'Choose a valid first payment date.');
    requireValue(Number.isInteger(count)&&count>=1&&count<=600,'Enter 1–600 monthly payments.');
    const d=date(first),end=monthDate(d.getUTCFullYear(),d.getUTCMonth()+count-1,d.getUTCDate());
    requireValue(validDate(end),'Last payment is outside the supported date range.');
    return end;
  }
  const occurrenceRef = key => {
    const split = key.lastIndexOf('@');
    const [date, slot] = key.slice(split + 1).split('~');
    return {id:key.slice(0,split), date, slot};
  };
  const categories = {
    housing:'Housing', groceries:'Groceries', transportation:'Transportation',
    utilities:'Utilities', insurance:'Insurance', dining:'Dining',
    subscriptions:'Subscriptions', other:'Other', uncategorized:'Uncategorized'
  };
  const categoryExists = id => Object.hasOwn(categories,id);
  function validate(s) {
    requireValue(s && s.schema===1,'This is not a supported Budget Planner backup.');
    requireValue(Number.isSafeInteger(s.revision) && s.revision>=0 && s.revision<Number.MAX_SAFE_INTEGER,'Invalid data revision.');
    requireValue(s.balance && Number.isSafeInteger(s.balance.cents) && Math.abs(s.balance.cents)<=1e12 && validDate(s.balance.date),'Invalid starting balance or date.');
    if(s.balance.basis!==undefined)requireValue(s.balance.basis==='checking_snapshot','Invalid balance basis.');
    requireValue(Number.isSafeInteger(s.buffer) && s.buffer>=0 && s.buffer<=1e12,'Invalid balance buffer.');
    requireValue(Array.isArray(s.rules) && s.rules.length<=500,'Maximum 500 schedules.');
    const ids=new Set();
    for(const r of s.rules){
      requireValue(typeof r.id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(r.id) && !ids.has(r.id),'Duplicate or invalid schedule ID.'); ids.add(r.id);
      requireValue(typeof r.name==='string' && r.name.trim().length>0 && r.name.length<=100,'Enter a name, up to 100 characters.');
      requireValue(['income','bill','spending'].includes(r.kind),'Choose income, bill, or spending.');
      requireValue(Number.isSafeInteger(r.cents) && r.cents>0 && r.cents<=1e10,'Amounts must be positive and at most $100 million.');
      requireValue(validDate(r.start) && (!r.end || validDate(r.end) && r.end>=r.start),'Check the schedule dates.');
      requireValue(['once','weekly','biweekly','semimonthly','monthly','yearly'].includes(r.frequency),'Invalid repeat schedule.');
      requireValue(typeof r.estimated==='boolean','Missing estimate status.');
      if(r.category!==undefined)requireValue(categoryExists(r.category),'Choose a spending category.');
      if(r.cardPayoff!==undefined)requireValue(typeof r.cardPayoff==='boolean','Invalid card payoff setting.');
      if(r.installments!==undefined)requireValue(r.kind==='bill'&&r.frequency==='monthly'&&r.end===installmentEnd(r.start,r.installments),'Invalid financing schedule.');
      if(r.frequency==='semimonthly') requireValue(Array.isArray(r.days) && r.days.length===2 && r.days.every(n=>Number.isInteger(n)&&n>=1&&n<=31) && r.days[0]<r.days[1],'Choose two different month days, in order.');
    }
    requireValue(s.overrides && typeof s.overrides==='object' && !Array.isArray(s.overrides) && Object.keys(s.overrides).length<=10000,'Invalid payment changes.');
    for(const [key,o] of Object.entries(s.overrides)){
      const {id,date:original,slot}=occurrenceRef(key);
      requireValue(ids.has(id)&&validDate(original)&&(!slot||(/^(?:[1-9]|[12]\d|3[01])$/.test(slot)&&key===id+'@'+original+'~'+slot))&&o && typeof o==='object','Invalid payment reference.');
      if(o.checking!==undefined)requireValue(['pending','posted'].includes(o.checking)&&validDate(o.snapshotDate),'Invalid checking reconciliation.');
      requireValue(typeof o.skip==='boolean' && validDate(o.date) && Number.isSafeInteger(o.cents) && o.cents>=0 && o.cents<=1e10 && typeof o.confirmed==='boolean','Invalid payment change.');
    }
    if(s.integrations!==undefined){
      const i=s.integrations;requireValue(i&&Array.isArray(i.requests)&&i.requests.length<=100&&Array.isArray(i.inbox)&&i.inbox.length<=50,'Invalid integration metadata.');
      const seen=new Set();
      for(const r of i.requests){requireValue(r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=120&&!seen.has(r.id)&&typeof r.signature==='string'&&r.signature.length<=20000,'Invalid automation receipt.');seen.add(r.id);}
      seen.clear();for(const r of i.inbox){requireValue(r&&typeof r.id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(r.id)&&!seen.has(r.id)&&typeof r.text==='string'&&r.text.length<=8000&&typeof r.source==='string'&&r.source.length<=100&&typeof r.capturedAt==='string'&&Number.isFinite(Date.parse(r.capturedAt)),'Invalid captured-text item.');seen.add(r.id);}
    }
    if(s.budget!==undefined){
      const {goals,actual}=s.budget||{};
      requireValue(goals&&typeof goals==='object'&&!Array.isArray(goals),'Invalid category goals.');
      for(const [category,goal] of Object.entries(goals)){
        requireValue(categoryExists(category)&&category!=='uncategorized'&&Number.isSafeInteger(goal)&&goal>=0&&goal<=1e10,'Invalid monthly goal.');
      }
      requireValue(Array.isArray(actual)&&actual.length<=10000,'Invalid spending records.');
      const recordIDs=new Set(),linked=new Set();
      for(const record of actual){
        const {id,name,category,date:paid,cents,key}=record||{};
        requireValue(typeof id==='string'&&/^[a-z0-9_-]{1,100}$/.test(id)&&!recordIDs.has(id),'Duplicate or invalid spending record.');
        requireValue(typeof name==='string'&&name.trim()&&name.length<=100&&categoryExists(category)&&validDate(paid),'Check the spending name, category and posting date.');
        requireValue(Number.isSafeInteger(cents)&&cents>0&&cents<=1e10,'Enter a positive spending amount up to $100 million.');
        if(key!==undefined){
          requireValue(typeof key==='string'&&/^[a-zA-Z0-9_-]{1,100}@\d{4}-\d{2}-\d{2}(?:~\d{1,2})?$/.test(key)&&validDate(occurrenceRef(key).date)&&!linked.has(key),'This scheduled payment has already been recorded or is invalid.');
          linked.add(key);
        }
        recordIDs.add(id);
      }
    }
    return s;
  }
  function occurrenceDates(r, from, to) {
    const a=[], seen=new Set(),start=date(r.start), last=r.end && r.end<to?r.end:to;
    const push=(d,slot)=>{if(d>=r.start && d>=from && d<=last){a.push({date:d,key:r.id+'@'+d+(seen.has(d)?'~'+slot:'')});seen.add(d);}};
    if(r.frequency==='once'){push(r.start);return a;}
    if(r.frequency==='weekly'||r.frequency==='biweekly'){
      const step=r.frequency==='weekly'?7:14;
      let n=Math.max(0,Math.ceil((date(from)-start)/DAY/step));
      for(let d=add(r.start,n*step);d<=last;d=add(d,step))push(d);
    } else {
      const begin=date(from);let y=begin.getUTCFullYear(),m=begin.getUTCMonth();
      while(monthDate(y,m,1)<=last){
        if(r.frequency==='semimonthly') r.days.forEach(d=>push(monthDate(y,m,d),d));
        else if(r.frequency==='monthly'||m===start.getUTCMonth()) push(monthDate(y,m,start.getUTCDate()));
        if(++m===12){m=0;y++;}
      }
    }
    return a;
  }
  const occurrences = (r,from,to) => occurrenceDates(r,from,to).map(o=>o.date);
  const hasOccurrence = (r,key) => {
    const {date} = occurrenceRef(key);
    return validDate(date)&&occurrenceDates(r,date,date).some(o=>o.key===key);
  };
  function events(s,from,to){
    const a=[],adjustments=new Map();
    for(const key of Object.keys(s.overrides)){const id=occurrenceRef(key).id;if(!adjustments.has(id))adjustments.set(id,[]);adjustments.get(id).push(key);}
    for(const r of s.rules){
      const keys=new Set(occurrenceDates(r,from,to).map(o=>o.key));
      for(const key of adjustments.get(r.id)||[])keys.add(key);
      for(const key of keys){
        const original=occurrenceRef(key).date,o=s.overrides[key];
        // Ignore stale changes if the original occurrence no longer belongs to its schedule.
        if(!hasOccurrence(r,key))continue;
        const d=o?o.date:original;
        if(o?.skip || d<from || d>to)continue;
        const amount=o?o.cents:r.cents;
        a.push({key,id:r.id,date:d,original,name:r.name,kind:r.kind,category:r.category||'uncategorized',cardPayoff:!!r.cardPayoff,cents:amount*(r.kind==='income'?1:-1),estimated:o?.confirmed?false:r.estimated,changed:!!o});
      }
    }
    return a.sort((a,b)=>a.date.localeCompare(b.date)||b.cents-a.cents||a.key.localeCompare(b.key));
  }
  function checkingEvents(s){
    if(s.balance.basis!=='checking_snapshot')return [];
    return events(s,s.balance.date,s.balance.date).map(e=>{
      const o=s.overrides[e.key];
      return {...e, checking:o?.snapshotDate===s.balance.date?o.checking:null};
    });
  }
  function forecast(s,days,preview,from=s.balance.date){
    validate(s);requireValue(Number.isInteger(days)&&days>=1&&days<=366,'Forecast must cover 1–366 days.');
    requireValue(validDate(from)&&from>=s.balance.date,'Forecast must start on or after the verified balance.');
    const end=add(from,days);requireValue(validDate(end),'Forecast exceeds the supported date range.');
    if(preview)requireValue(typeof preview.enabled==='boolean'&&validDate(preview.date)&&Number.isSafeInteger(preview.cents)&&preview.cents>=0&&preview.cents<=1e10,'Invalid purchase preview.');
    const checking=checkingEvents(s),list=checking.filter(e=>e.checking==='pending').concat(events(s,add(s.balance.date,1),end)),byDay=new Map();
    for(const e of list){if(!byDay.has(e.date))byDay.set(e.date,[]);byDay.get(e.date).push(e);}
    const points=[];let base=s.balance.cents,scenario=base;
    const safe=n=>{requireValue(Number.isSafeInteger(n),'Projected balance exceeds the supported amount range.');return n;};
    base=safe(base+list.filter(e=>e.date<from).reduce((sum,e)=>safe(sum+e.cents),0));scenario=base;
    if(preview?.enabled&&preview.date>s.balance.date&&preview.date<from)scenario=safe(scenario-preview.cents);
    for(let i=0;i<=days;i++){
      const d=add(from,i),es=byDay.get(d)||[],net=es.reduce((sum,e)=>safe(sum+e.cents),0);
      base=safe(base+net);scenario=safe(scenario+net);
      if(preview?.enabled && d===preview.date && d>s.balance.date)scenario=safe(scenario-preview.cents);
      points.push({date:d,base,cents:scenario,events:es});
    }
    return {points,checking,unreviewedChecking:checking.filter(e=>!e.checking),events:list.filter(e=>e.date>=from),min:points.reduce((a,b)=>b.cents<a.cents?b:a),first:points.find(p=>p.cents<0),below:points.find(p=>p.cents<s.buffer),end:points.at(-1)};
  }
  function monthlyBudget(s,month,todayDate=today()){
    validate(s);
    requireValue(validDate(month)&&month.endsWith('-01'),'Choose a valid budget month.');
    const start=date(month),end=iso(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)));
    const budget=s.budget||{goals:{},actual:[]};
    const linked=new Set(budget.actual.map(e=>e.key).filter(Boolean));
    const actual=budget.actual.filter(e=>e.date>=month&&e.date<=end&&e.date<=todayDate)
      .sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name));
    const planned=events(s,month,end).filter(e=>e.kind!=='income'&&!e.cardPayoff&&e.cents<0&&!linked.has(e.key));
    const rows=Object.entries(categories).map(([id,label])=>({
      id,label,goal:budget.goals[id]??null,actual:0,planned:0,recorded:0
    }));
    const byID=new Map(rows.map(row=>[row.id,row]));
    for(const entry of actual){
      const row=byID.get(entry.category);
      row.actual+=entry.cents;
      row.recorded++;
    }
    for(const entry of planned)byID.get(entry.category).planned-=entry.cents;
    return {actual,planned,rows};
  }
  function seed(){return {schema:1,revision:0,sample:false,balance:{cents:0,date:today()},buffer:0,rules:[],overrides:{}};}
  return {date,iso,validDate,add,today,cents,clone,monthDate,installmentEnd,validate,occurrences,occurrenceRef,hasOccurrence,events,checkingEvents,forecast,categories,monthlyBudget,seed};
})();
if(typeof module!=='undefined')module.exports=Budget;

