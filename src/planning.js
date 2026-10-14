/* V2 planning constraints. The original automatic planner remains the baseline. */
const WWPlanning = (() => {
  const W=typeof WW!=='undefined'?WW:require('./core.js');
  const automatic=W.plan, minute=60000;
  const identity=n=>n.entity||n.start;
  const overlap=(a,b,c,d)=>a<d&&b>c;
  function validatePlanning(v,date,s){
    if(!v||!Array.isArray(v.awake)||!Array.isArray(v.pins)||v.awake.length>12||v.pins.length>6)throw Error('Planning data must contain up to 12 awake periods and 6 nap pins.');
    const ids=new Set(),ordinals=new Set();
    for(const x of [...v.awake,...v.pins]){if(!x||typeof x.id!=='string'||!x.id||x.id.length>100||ids.has(x.id))throw Error('Each planning entry needs a unique ID.');ids.add(x.id);}
    for(const a of v.awake){
      if(typeof a.label!=='string'||a.label.length>80)throw Error('Use an appointment label of at most 80 characters.');
      if(!Number.isFinite(Date.parse(a.start))||!Number.isFinite(Date.parse(a.end))||Date.parse(a.end)<=Date.parse(a.start))throw Error('Awake period end must be after start.');
      if(W.parts(a.start,s.timezone).date!==date||W.parts(a.end,s.timezone).date!==date)throw Error('Keep an awake period within its selected day.');
    }
    for(const p of v.pins){
      if(!Number.isInteger(p.ordinal)||p.ordinal<1||p.ordinal>50||ordinals.has(p.ordinal))throw Error('Only one pin is allowed per nap number.');ordinals.add(p.ordinal);
      if(!Array.isArray(p.anchors)||p.anchors.some(x=>typeof x!=='string')||p.anchors.length>=p.ordinal)throw Error('Nap pin history is invalid.');
      if(p.start!==null&&(!Number.isFinite(Date.parse(p.start))||W.parts(p.start,s.timezone).date!==date))throw Error('A pinned start must be on its selected day.');
      if(p.minutes!==null&&(!Number.isInteger(p.minutes)||p.minutes<1||p.minutes>600))throw Error('Pinned duration must be whole minutes between 1 and 600.');
      if(p.start===null&&p.minutes===null)throw Error('Pin a start or duration, or release the pin.');
    }
    return v;
  }
  function plan(day,s,now=Date.now()){
    const data=validatePlanning(day.planning||{awake:[],pins:[]},day.date,s);
    const base=automatic(day,s,now),actual=W.validateDay(day,s,now),countActual=actual.length;
    const notes=[];
    for(const period of data.awake){
      if(actual.some(n=>n.end!==null&&overlap(Date.parse(n.start),Date.parse(n.end),Date.parse(period.start),Date.parse(period.end))))notes.push(`Recorded sleep overlaps ${period.label||'an awake period'}. Actual times are preserved.`);
    }
    const changedHistory=p=>p.anchors.some((id,i)=>!actual[i]||identity(actual[i])!==id);
    const pins=data.pins.filter(p=>p.ordinal>countActual||changedHistory(p));
    const awake=data.awake.filter(a=>Date.parse(a.end)>Math.max(now,base.anchor||0));
    const blocked=(message,reason)=>({...base,status:'blocked',events:[],bedtime:undefined,count:undefined,message,reason,notes,pins});
    if(day.planningConflict)return blocked('Both parents edited the day plan before their changes arrived. Review the saved versions and explicitly choose one before planning continues.','concurrent-plans');
    if(pins.some(changedHistory))return blocked('Earlier nap history changed. Release the affected saved pins, then pin the new suggestions if needed.','history');
    if(pins.some(p=>p.start!==null&&Date.parse(p.start)<now))return blocked('A pinned nap start has passed without a matching actual nap. Log the nap, move its start, or release the pin.','expired-pin');
    if(base.activeNap&&data.awake.some(a=>overlap(Date.parse(base.activeNap.start),Date.parse(base.activeNap.expectedEnd),Date.parse(a.start),Date.parse(a.end)))){
      notes.push('The current nap or its expected wake overlaps an awake period.');
      if(base.status!=='active-overdue')return blocked('The current nap estimate overlaps a keep-awake period. Update expected wake or adjust the appointment; no actual sleep has been changed.','active-overlap');
    }
    if(['empty','past','active-overdue'].includes(base.status))return {...base,notes,pins};
    if(!awake.length&&!pins.length)return {...base,notes,pins};
    const anchor=base.anchor,target=base.target;
    const horizon=Math.floor((Date.parse(W.wall(day.date,'23:59',s.timezone))-anchor)/minute);
    if(horizon<0)return blocked('No daytime planning space remains.','day-end');
    const relative=t=>Math.round((Date.parse(t)-anchor)/minute);
    const periods=awake.map(a=>({start:relative(a.start),end:relative(a.end)}));
    const minimumBed=Math.max(0,...periods.map(a=>a.end));
    const wanted=Math.round((target-anchor)/minute),elapsed=Math.max(0,Math.ceil((now-anchor)/minute));
    const required=pins.length?Math.max(...pins.map(p=>p.ordinal-countActual)):0;
    if(required>6)return blocked('A pin is beyond the six remaining naps supported by this planner. Release or review it.','pin-range');
    const cost=(r,v)=>Math.pow((v-r.ideal)/Math.max(15,r.max-r.min),2);
    const range=(r,first)=>({...r,min:first?Math.max(r.min,elapsed):r.min,max:first?Math.max(r.max,elapsed):r.max});
    let states=new Map([[0,{score:0,events:[]}]]),best=null;
    function keep(map,end,state){const old=map.get(end);if(!old||state.score<old.score)map.set(end,state);}
    const makeEvent=(kind,start,end)=>({kind,start:anchor+start*minute,end:anchor+end*minute,minutes:end-start});
    for(let count=0;count<=6;count++){
      if(count>=required){
        const r=range(s.final,count===0);
        for(const [cursor,state] of states){
          // The best terminal time for this state is its nearest legal bedtime.
          const low=Math.max(cursor+r.min,minimumBed),high=Math.min(cursor+r.max,horizon);
          if(low>high)continue;
          const end=Math.max(low,Math.min(high,wanted)),duration=end-cursor;
          const candidate={...base,count,events:state.events.concat(makeEvent('final',cursor,end)),bedtime:anchor+end*minute,deviation:end-wanted,score:(state.score+cost(s.final,duration))/(2*count+1),slack:Math.min(end-low,high-end),notes,pins};
          if(!best||Math.abs(candidate.deviation)<Math.abs(best.deviation)||Math.abs(candidate.deviation)===Math.abs(best.deviation)&&(candidate.score<best.score||candidate.score===best.score&&count<best.count))best=candidate;
        }
      }
      if(count===6||!states.size)break;
      const ordinal=countActual+count+1,pin=pins.find(p=>p.ordinal===ordinal);
      const windowIndex=countActual+count;
      const ordinary=windowIndex===0?s.first:windowIndex===1?s.second:s.later;
      const r=range(ordinary,count===0),awakeStates=new Map();
      for(const [cursor,state] of states){
        const fixed=pin&&pin.start!==null?relative(pin.start)-cursor:null;
        const lo=fixed===null?r.min:fixed,hi=fixed===null?r.max:fixed;
        if(lo<r.min||hi>r.max)continue;
        for(let minutes=lo;minutes<=hi&&cursor+minutes<=horizon;minutes++){
          const end=cursor+minutes;
          keep(awakeStates,end,{score:state.score+cost(ordinary,minutes),events:state.events.concat(makeEvent('awake',cursor,end))});
        }
      }
      const next=new Map(),napRange=s.nap;
      const lo=pin&&pin.minutes!==null?pin.minutes:napRange.min,hi=pin&&pin.minutes!==null?pin.minutes:napRange.max;
      if(lo<napRange.min||hi>napRange.max){states=next;continue;}
      for(const [cursor,state] of awakeStates){
        for(let minutes=lo;minutes<=hi&&cursor+minutes<=horizon;minutes++){
          const end=cursor+minutes;if(periods.some(a=>overlap(cursor,end,a.start,a.end)))continue;
          const event={...makeEvent('nap',cursor,end),ordinal,pinned:!!pin};
          keep(next,end,{score:state.score+cost(napRange,minutes),events:state.events.concat(event)});
        }
      }
      states=next;
    }
    if(!best){
      const reason=pins.length?'pins':'appointments';
      return blocked(`No schedule fits the ${pins.length?'saved nap pins and ':''}awake periods within your duration limits. ${pins.length?'Move or release a pin; review the awake period or nap-duration limits.':'Review the awake period, shorten its interval if appropriate, or explicitly adjust your wake/nap limits.'}` ,reason);
    }
    const first=best.events[0],firstRange=best.count===0?s.final:countActual===0?s.first:countActual===1?s.second:s.later;
    best.original={...firstRange};best.overdue=elapsed>firstRange.max;
    best.status=best.deviation?'adjust':best.overdue?'overdue':'fit';
    best.message=best.deviation?`The nearest plan respecting your awake periods and pins reaches bedtime ${Math.abs(best.deviation)} minutes ${best.deviation>0?'later':'earlier'}. Change bedtime, review a pin, or adjust an awake period to get closer.`:'This plan fits your bedtime, awake periods and saved nap pins.';
    if(best.overdue)best.message+=' The current wake window has already exceeded its maximum; the next transition is planned for now.';
    if(base.activeNap)best.message+=' Remaining times use the expected wake until the actual wake is recorded.';
    return best;
  }
  W.validatePlanning=validatePlanning;W.napIdentity=identity;W.plan=plan;
  return W;
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WWPlanning;
