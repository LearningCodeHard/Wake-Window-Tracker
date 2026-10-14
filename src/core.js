/* Wake Window V1 — pure scheduling, validation, and import functions. */
const WW = (() => {
  const defaults = {
    timezone: 'America/Indiana/Indianapolis', bedtime: '20:00',
    nap: {min: 60, ideal: 75, max: 90},
    first: {min: 60, ideal: 75, max: 90},
    second: {min: 120, ideal: 135, max: 150},
    later: {min: 120, ideal: 135, max: 150},
    final: {min: 120, ideal: 150, max: 180}
  };
  const copy = x => JSON.parse(JSON.stringify(x));
  const pad = n => String(n).padStart(2, '0');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function parts(value, tz) {
    const d = new Date(value);
    if (!Number.isFinite(+d)) throw Error('Invalid timestamp.');
    const p = {};
    new Intl.DateTimeFormat('en-US', {timeZone:tz, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).forEach(x => p[x.type] = x.value);
    return {date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}`};
  }
  function wall(date, time, tz) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Use a valid date and 24-hour time.');
    const target = Date.parse(`${date}T${time}:00Z`);
    if (!Number.isFinite(target) || new Date(target).toISOString().slice(0,10) !== date) throw Error('Invalid calendar date.');
    let guess = target;
    for (let i=0; i<4; i++) {
      const p = parts(guess,tz);
      const represented = Date.parse(`${p.date}T${p.time}:00Z`);
      guess += target-represented;
    }
    const p = parts(guess,tz);
    if (p.date !== date || p.time !== time) throw Error('This local time does not exist because the clocks change.');
    for (const delta of [-120,-90,-60,-30,30,60,90,120]) {
      const other=parts(guess+delta*60000,tz);
      if (other.date===date && other.time===time) throw Error('This local time occurs twice because the clocks change. V1 needs an unambiguous daytime entry.');
    }
    return new Date(guess).toISOString();
  }
  function validateSettings(s) {
    if (!s || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.bedtime)) throw Error('Enter a valid bedtime.');
    try { if(typeof s.timezone!=='string'||!s.timezone.trim())throw Error();parts(Date.now(),s.timezone); } catch { throw Error('Enter a valid IANA timezone, such as America/Indiana/Indianapolis.'); }
    for (const key of ['nap','first','second','later','final']) {
      const r=s[key];
      if (!r || !['min','ideal','max'].every(k=>Number.isInteger(r[k]) && r[k]>=1 && r[k]<=600) || r.min>r.ideal || r.ideal>r.max) throw Error(`${key}: use whole minutes with minimum ≤ preferred ≤ maximum (1–600).`);
    }
    return s;
  }
  function validateDay(day,s,now=Date.now()) {
    const naps=[...(day.naps||[])].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    let previous=day.morning ? Date.parse(day.morning) : -Infinity;
    if (day.morning && (!Number.isFinite(previous) || parts(previous,s.timezone).date!==day.date || previous>now)) throw Error('Morning wake must be on the selected day and not in the future.');
    let activeCount=0;
    for (const n of naps) {
      if(n.end===null){
        const a=Date.parse(n.start), b=Date.parse(n.expectedEnd);
        if(++activeCount>1)throw Error('More than one active nap was found. Cancel the extra active entry before planning.');
        if(!Number.isFinite(a)||a>now)throw Error('An active nap must have an actual start time, not a future start.');
        if(!Number.isFinite(b)||b<=a)throw Error('Expected wake must be after nap start.');
        if(parts(a,s.timezone).date!==day.date||parts(b,s.timezone).date!==day.date)throw Error('Keep the active nap and expected wake within the selected day.');
        if(a<previous)throw Error('Naps overlap, or a nap starts before morning wake. Correct the recorded times.');
        previous=Infinity;continue;
      }
      const a=Date.parse(n.start), b=Date.parse(n.end);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b<=a) throw Error('Nap end must be after nap start.');
      if (parts(a,s.timezone).date!==day.date || parts(b,s.timezone).date!==day.date) throw Error('V1 records daytime naps within one calendar day.');
      if (a<previous) throw Error('Naps overlap, or a nap starts before morning wake. Correct the recorded times.');
      if (b>now) throw Error('Actual nap times cannot be in the future.');
      previous=b;
    }
    return naps;
  }
  function allocate(segments,total) {
    const lo=segments.reduce((a,s)=>a+s.min,0), hi=segments.reduce((a,s)=>a+s.max,0);
    if(total<lo || total>hi) return null;
    // Convex box-constrained least squares, then integer-minute apportionment.
    const scale=s=>Math.max(15,s.max-s.min);
    let left=-1e6,right=1e6;
    for(let n=0;n<70;n++) {
      const m=(left+right)/2;
      const sum=segments.reduce((a,s)=>a+clamp(s.ideal+m*scale(s)*scale(s),s.min,s.max),0);
      if(sum<total) left=m; else right=m;
    }
    const vals=segments.map(s=>Math.floor(clamp(s.ideal+((left+right)/2)*scale(s)*scale(s),s.min,s.max)+1e-7));
    let remain=total-vals.reduce((a,b)=>a+b,0);
    while(remain>0) {
      let best=-1,cost=Infinity;
      segments.forEach((s,i)=>{if(vals[i]<s.max){const c=(2*(vals[i]-s.ideal)+1)/(scale(s)*scale(s));if(c<cost){cost=c;best=i;}}});
      if(best<0) throw Error('Schedule allocation failed.');
      vals[best]++; remain--;
    }
    const score=segments.reduce((a,s,i)=>a+Math.pow((vals[i]-s.ideal)/scale(s),2),0)/segments.length;
    return {vals,score};
  }
  function plan(day,s,now=Date.now()) {
    validateSettings(s);
    const all=validateDay(day,s,now),naps=all.filter(n=>n.end!==null),activeNap=all.find(n=>n.end===null)||null;
    const activeInfo=activeNap?{activeNap,expectedWake:Date.parse(activeNap.expectedEnd),sleepElapsed:Math.max(0,Math.floor((now-Date.parse(activeNap.start))/60000))}:{};
    const anchor=activeNap?Date.parse(activeNap.expectedEnd):naps.length ? Date.parse(naps[naps.length-1].end) : (day.morning ? Date.parse(day.morning) : null);
    if(anchor===null) return {status:'empty',events:[],message:'Enter morning wake or import a completed nap to plan the day.'};
    const target=Date.parse(wall(day.date,day.bedtime||s.bedtime,s.timezone));
    if(activeNap&&now>=anchor)return {status:'active-overdue',events:[],anchor,target,elapsed:0,...activeInfo,message:'Still marked asleep. The expected wake time has passed. Update it or record the actual wake to refresh the remaining plan.'};
    const elapsed=Math.max(0,Math.ceil((now-anchor)/60000));
    if(now>=target) return {status:'past',events:[],anchor,target,elapsed,...activeInfo,message:'The chosen bedtime has arrived. Actual records are kept; start a new day with a morning wake entry.'};
    const candidates=[];
    for(let count=0;count<=6;count++) {
      const seg=[];
      for(let i=0;i<count;i++) {
        const index=naps.length+(activeNap?1:0)+i;
        const w=index===0?s.first:(index===1?s.second:s.later);
        seg.push({...w,kind:'awake'}, {...s.nap,kind:'nap'});
      }
      seg.push({...s.final,kind:'final'});
      const original={...seg[0]};
      const overdue=elapsed>seg[0].max;
      seg[0].min=Math.max(seg[0].min,elapsed);
      seg[0].max=Math.max(seg[0].max,elapsed);
      const low=seg.reduce((a,x)=>a+x.min,0), high=seg.reduce((a,x)=>a+x.max,0);
      const wanted=Math.round((target-anchor)/60000),total=clamp(wanted,low,high);
      const a=allocate(seg,total);
      let cursor=anchor;
      const events=seg.map((x,i)=>{const e={kind:x.kind,start:cursor,end:cursor+a.vals[i]*60000,minutes:a.vals[i]};cursor=e.end;return e;});
      candidates.push({count,events,bedtime:cursor,target,anchor,elapsed,overdue,original,...activeInfo,
        deviation:Math.round((cursor-target)/60000),score:a.score,
        slack:Math.min(total-low,high-total),earliest:anchor+low*60000,latest:anchor+high*60000});
    }
    candidates.sort((a,b)=>Math.abs(a.deviation)-Math.abs(b.deviation) || (Number(a.overdue)-Number(b.overdue)) || a.score-b.score || a.count-b.count);
    const result=candidates[0];
    result.status=result.deviation ? 'adjust' : (result.overdue?'overdue':'fit');
    result.message=result.deviation ? `No schedule reaches your chosen bedtime within the remaining duration limits. The nearest plan is ${Math.abs(result.deviation)} minutes ${result.deviation>0?'later':'earlier'}.` : (result.slack===0?'This plan fits exactly at a boundary of your limits. Any change will need a fresh calculation.':'This plan fits your bedtime and duration limits.');
    if(result.overdue) result.message+=' The current wake window has already exceeded its maximum; the plan assumes the next transition happens now.';
    if(activeNap)result.message+=' Remaining times assume the expected wake; the actual wake will recalculate them.';
    return result;
  }
  function parseOCR(text,now,tz,preferredMinutes=defaults.nap.ideal) {
    let t=String(text||'').replace(/[\u00a0\u202f]/g,' ').replace(/\r/g,'').trim();
    if(!t) return {error:'No text was received. Use a screenshot showing Start Time and End Time, or enter the nap manually.'};
    // Saved Huckleberry sleep details have no Start/End labels. Only accept
    // the bounded Details section, never clock values from the day behind it.
    const lines=t.split('\n').map(line=>line.trim()).filter(Boolean);
    const details=lines.map((line,i)=>/^details$/i.test(line)?i:-1).filter(i=>i>=0);
    if(details.length){
      if(details.length!==1)return {error:'More than one Details section was found. Open one completed nap and try again.'};
      const tail=lines.slice(details[0]+1),stop=tail.findIndex(line=>/^(?:notes|edit|done)$/i.test(line));
      const block=stop<0?tail:tail.slice(0,stop);
      const sleep=block[0]&&block[0].match(/^.+?\s+slept\s+for\s+((?:\d+\s*h(?:ours?|rs?)?\s*)?(?:\d+\s*m(?:in(?:ute)?s?)?)?)$/i);
      if(block.length!==3||!sleep||!sleep[1].trim())return {error:'Could not read a single completed sleep Details entry. Open its date and time range, or enter the nap manually.'};
      const dateText=block[1].match(/^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
      const months={january:1,jan:1,february:2,feb:2,march:3,mar:3,april:4,apr:4,may:5,june:6,jun:6,july:7,jul:7,august:8,aug:8,september:9,sep:9,sept:9,october:10,oct:10,november:11,nov:11,december:12,dec:12};
      if(!dateText||!months[dateText[1].toLowerCase()])return {error:'The sleep Details date was not readable. Use its English month/day/year date, or enter the nap manually.'};
      const date=`${dateText[3]}-${pad(months[dateText[1].toLowerCase()])}-${pad(Number(dateText[2]))}`;
      const range=block[2].match(/^(\d{1,2}:[0-5]\d\s*[ap]\.?\s*m\.?)\s*[-\u2013\u2014]\s*(\d{1,2}:[0-5]\d\s*[ap]\.?\s*m\.?)$/i);
      if(!range)return {error:'The sleep Details time range needs a readable start and end with AM/PM. Enter or confirm the times manually.'};
      // Reuse the existing timezone, future/overnight checks and duration review.
      t=`Start Time\n${date}, ${range[1]}\nEnd Time\n${date}, ${range[2]}\nDuration\n${sleep[1]}`;
    }
    const labels=[...t.matchAll(/\b(start\s*time|end\s*time)\b\s*:?/gi)];
    const startOnly=labels.length===1&&/^start/i.test(labels[0][1]);
    if(!startOnly&&(labels.length!==2 || !/^start/i.test(labels[0][1]) || !/^end/i.test(labels[1][1]))) return {error:'Could not identify a single labeled Start Time and optional End Time. Enter or confirm the times manually.'};
    function read(block) {
      const clock=block.match(/\b(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([ap]\.?\s*m\.?)?/i);
      if(!clock) throw Error('A labeled time was not readable.');
      let h=Number(clock[1]);const suffix=(clock[3]||'').replace(/[.\s]/g,'').toLowerCase();
      if(suffix){if(h<1||h>12)throw Error('Invalid 12-hour clock value.');h=h%12+(suffix==='pm'?12:0);}else if(h>23)throw Error('Invalid hour.');
      const before=block.slice(0,clock.index),dateMatch=before.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      let date,assumed=false;
      if(/\byesterday\b/i.test(before)) {const noon=wall(parts(now,tz).date,'12:00',tz);date=parts(Date.parse(noon)-86400000,tz).date;}
      else if(/\btoday\b/i.test(before)) date=parts(now,tz).date;
      else if(dateMatch) date=dateMatch[1];
      else if(before.replace(/[\s,:]/g,'')==='') {date=parts(now,tz).date;assumed=true;}
      else throw Error('Unrecognized date text. V1 supports Today, Yesterday, or YYYY-MM-DD.');
      // Ambiguous 1–12 without AM/PM requires manual confirmation.
      if(!suffix && h>=1 && h<=12) assumed=true;
      return {iso:wall(date,`${pad(h)}:${clock[2]}`,tz),assumed};
    }
    try {
      const a=read(t.slice(labels[0].index+labels[0][0].length,startOnly?undefined:labels[1].index));
      if(startOnly){
        if(Date.parse(a.iso)>now)throw Error('The imported start time is in the future. Check the date and AM/PM.');
        const goal=t.match(/\b(?:goal(?:\s*time)?|target\s*wake(?:\s*time)?|expected\s*wake(?:\s*time)?)\s*:?\s*([^\n]*(?:\n[^\n]+)?)/i);
        const expectedEnd=goal?read(goal[1]).iso:new Date(Date.parse(a.iso)+preferredMinutes*60000).toISOString();
        if(Date.parse(expectedEnd)<=Date.parse(a.iso)||parts(expectedEnd,tz).date!==parts(a.iso,tz).date)throw Error('Check the expected wake time or enter it manually.');
        const running=/\b(?:running|in\s*progress|currently\s*sleeping|asleep)\b/i.test(t);
        const messages=[goal?'Expected wake extracted from the timer goal; please review.':'Expected wake uses your preferred nap duration; you can change it.'];
        if(!running)messages.push('No End Time was found. Confirm that this nap is still in progress.');
        if(a.assumed)messages.push('Check the date and AM/PM carefully.');
        return {kind:'active',start:a.iso,end:null,expectedEnd,estimateSource:goal?'goal':'preferred',date:parts(a.iso,tz).date,messages,needsActiveConfirmation:!running};
      }
      const b=read(t.slice(labels[1].index+labels[1][0].length));
      if(Date.parse(b.iso)<=Date.parse(a.iso)) throw Error('End time is not after start time. Check AM/PM and dates.');
      if(Date.parse(b.iso)>now) throw Error('The imported nap ends in the future. Check AM/PM and dates.');
      if(parts(a.iso,tz).date!==parts(b.iso,tz).date)throw Error('V1 imports daytime naps within one calendar day.');
      const messages=[];
      if(a.assumed||b.assumed) messages.push('A date or AM/PM marker was missing. Check both times carefully.');
      const duration=Math.round((Date.parse(b.iso)-Date.parse(a.iso))/60000);
      const dm=t.match(/\bduration\s*:?\s*(?:(\d+)\s*(?:h(?:ours?|rs?)?)\s*)?(?:(\d+)\s*(?:m(?:in(?:ute)?s?)?))\b/i);
      if(dm && (dm[1]||dm[2]) && Math.abs((Number(dm[1]||0)*60+Number(dm[2]||0))-duration)>2) messages.push('Displayed duration does not match the extracted start/end times.');
      return {start:a.iso,end:b.iso,date:parts(a.iso,tz).date,messages};
    } catch(e) {return {error:e.message};}
  }
  function napKey(start,end) {return `nap_${start.replace(/[^0-9]/g,'')}_${end===null?'active':end.replace(/[^0-9]/g,'')}`;}
  function reduce(records) {
    const groups={}, conflicts=[];
    for(const r of records) {if(r.schema!==1 || !r.entity || !r.id || !Number.isFinite(Date.parse(r.at))) throw Error('An unreadable event record was found. No records have been changed.');(groups[r.entity]||(groups[r.entity]=[])).push(r);}
    const latest={};
    for(const [entity,events] of Object.entries(groups)) {
      const byId=Object.fromEntries(events.map(e=>[e.id,e])),depths={};
      const depth=(e,seen=new Set())=>{if(depths[e.id]!==undefined)return depths[e.id];if(seen.has(e.id))throw Error('A cyclic revision history was found.');seen.add(e.id);return depths[e.id]=e.base?(byId[e.base]?depth(byId[e.base],seen)+1:1):0;};
      // A late duplicate original import must never replace a correction.
      events.sort((a,b)=>depth(a)-depth(b)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
      latest[entity]=events[events.length-1];
      const winner=latest[entity];
      // Competing branches at the same revision depth need review.
      const siblings=events.filter(e=>depth(e)===depth(winner));
      if(siblings.length>1 && new Set(siblings.map(e=>JSON.stringify([e.deleted,e.value]))).size>1) conflicts.push(entity);
    }
    return {latest,conflicts};
  }
  return {defaults,copy,pad,parts,wall,validateSettings,validateDay,allocate,plan,parseOCR,napKey,reduce};
})();
if(typeof module!=='undefined' && module.exports) module.exports=WW;
