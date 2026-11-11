/* Minute-resolution planner for wake windows, appointments and nap profiles. */
const WWPlanning = (() => {
  const W=typeof WW!=='undefined'?WW:require('./core.js');
  const minute=60000;
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
      if(p.profile!==undefined&&p.profile!==null&&!Object.prototype.hasOwnProperty.call(W.napProfiles(s),p.profile))throw Error('Choose a valid nap profile.');
      if(p.start===null&&p.minutes===null&&!p.profile)throw Error('Pin a start, duration or profile, or release the pin.');
    }
    return v;
  }
  function alternatives(day,s,now=Date.now(),compare=false){
    const data=validatePlanning(day.planning||{awake:[],pins:[]},day.date,s);
    const base=W.planningAnchor(day,s,now),actual=W.validateDay(day,s,now),countActual=actual.length;
    const notes=[];
    for(const a of data.awake){
      if(actual.some(n=>n.end!==null&&overlap(Date.parse(n.start),Date.parse(n.end),Date.parse(a.start),Date.parse(a.end))))
        notes.push(`Recorded sleep overlaps ${a.label||'an awake period'}. Actual times are preserved.`);
    }
    const changedHistory=p=>p.anchors.some((id,i)=>!actual[i]||identity(actual[i])!==id);
    const pins=data.pins.filter(p=>p.ordinal>countActual||changedHistory(p));
    const blocked=(message,reason,blocker)=>[{...base,status:'blocked',events:[],message,reason,notes,pins,blocker}];
    if(day.planningConflict)return blocked('Both parents edited the day plan. Review the saved versions and choose the appointments and pins to use.','concurrent-plans');
    if(pins.some(changedHistory))return blocked('Earlier nap history changed. Release the affected pins and pin the new suggestions if needed.','history');
    if(pins.some(p=>p.start!==null&&Date.parse(p.start)<now))return blocked('A pinned nap start has passed. Log the nap, move its start, or release the pin.','expired-pin');
    const activeAppointment=base.activeNap&&data.awake.find(a=>overlap(Date.parse(base.activeNap.start),base.expectedWake,Date.parse(a.start),Date.parse(a.end)));
    if(activeAppointment){
      notes.push('The current nap or its expected wake overlaps an awake period.');
      if(base.status!=='active-overdue')return blocked('The current nap estimate overlaps a keep-awake period. Update expected wake or move the appointment.','active-overlap',{appointment:activeAppointment});
    }
    if(base.status)return [{...base,notes,pins}];
    const {anchor,target,elapsed}=base;
    const horizon=Math.floor((Date.parse(W.wall(day.date,'23:59',s.timezone))-anchor)/minute);
    const relative=t=>(Date.parse(t)-anchor)/minute;
    const periods=data.awake.filter(a=>Date.parse(a.end)>Math.max(now,anchor)).map(a=>({...a,start:relative(a.start),end:relative(a.end)}));
    const minimumBed=Math.ceil(Math.max(0,...periods.map(a=>a.end)));
    const wanted=Math.round((target-anchor)/minute);
    const {max,target:napTarget}=W.napCounts(s),limit=Math.max(0,max-countActual);
    const required=Math.max(0,...pins.map(p=>p.ordinal-countActual));
    if(required>limit)return blocked(`Nap ${countActual+required} is pinned but the daily maximum is ${max}. Release the pin or raise the maximum.`,'pin-count');
    const profiles=W.napProfiles(s);
    const late=day.morning&&W.parts(day.morning,s.timezone).time>='07:00';
    const wakeRange=index=>index===0?(late?s.second:s.first):index===1?s.second:s.later;
    const cost=(r,v)=>((v-r.ideal)/Math.max(15,r.max-r.min))**2;
    const event=(kind,start,end)=>({kind,start:anchor+start*minute,end:anchor+end*minute,minutes:end-start});
    const rank=(a,b)=>Math.abs(a.deviation)-Math.abs(b.deviation)||a.targetGap-b.targetGap||a.score-b.score||a.count-b.count;
    // For a given cursor and nap count, future constraints are independent of earlier durations.
    // Keep the cheapest path to each cursor, retaining links for the winning timeline.
    function solve(preferred){
      let states=new Map([[0,{score:0}]]),results=[];
      function keep(map,end,score,previous,kind,start,details){
        if(!map.has(end)||map.get(end).score>score)map.set(end,{score,previous,event:{...event(kind,start,end),...details}});
      }
      for(let count=0;count<=limit&&states.size;count++){
        let best;
        if(count>=required){
          for(const [cursor,state] of states){
            const low=Math.max(cursor+s.final.min,minimumBed,count===0?elapsed:0);
            const high=Math.min(cursor+s.final.max,horizon);
            if(low>high)continue;
            const end=Math.max(low,Math.min(high,wanted));
            const score=(state.score+cost(s.final,end-cursor))/(2*count+1);
            const deviation=end-wanted;
            if(!best||Math.abs(deviation)<Math.abs(best.deviation)||Math.abs(deviation)===Math.abs(best.deviation)&&score<best.score)
              best={cursor,state,end,score,deviation};
          }
        }
        if(best){
          const events=[event('final',best.cursor,best.end)];
          for(let node=best.state;node.event;node=node.previous)events.push(node.event);
          const totalNaps=countActual+count;
          results.push({...base,count,totalNaps,targetGap:Math.abs(totalNaps-napTarget),events:events.reverse(),
            bedtime:anchor+best.end*minute,deviation:best.deviation,score:best.score,notes,pins,
            status:best.deviation?'adjust':'fit'});
        }
        if(count===limit)break;
        const ordinal=countActual+count+1,pin=pins.find(p=>p.ordinal===ordinal);
        const wake=wakeRange(ordinal-1),awakeStates=new Map();
        for(const [cursor,state] of states){
          const fixed=pin&&pin.start!==null?relative(pin.start)-cursor:null;
          const lo=Math.max(wake.min,count===0?elapsed:0,fixed??0),hi=Math.min(wake.max,fixed??horizon);
          for(let m=lo;Number.isInteger(m)&&m<=hi&&cursor+m<=horizon;m++)
            keep(awakeStates,cursor+m,state.score+cost(wake,m),state,'awake',cursor);
        }
        const next=new Map();
        const choices=pin?.profile?[pin.profile]:pin&&pin.minutes!==null?['standard']:Object.keys(profiles);
        for(const [cursor,state] of awakeStates){
          const nextAppointment=periods.filter(a=>a.end>cursor).reduce((first,a)=>Math.min(first,a.start),horizon);
          for(const profile of choices){
            const range=profiles[profile],fixed=pin?.minutes??null;
            const lo=Math.max(range.min,fixed??0),hi=Math.min(range.max,fixed??horizon,nextAppointment-cursor,horizon-cursor);
            for(let m=lo;m<=hi;m++)keep(next,cursor+m,state.score+cost(range,m)+(profile===preferred?0:1),
              state,'nap',cursor,{ordinal,profile,pinned:!!pin});
          }
        }
        states=next;
      }
      return results.sort(rank);
    }
    const standard=solve('standard');
    if(!standard.length){
      if(elapsed>Math.max(s.final.max,wakeRange(countActual).max))
        return blocked('The current wake window already exceeds your configured maximum. Log any missed nap or review the applicable wake-window limits in Settings.','wake-limit');
      for(const pin of pins){
        if(pin.start===null)continue;
        const appointment=data.awake.find(a=>Date.parse(a.start)<=Date.parse(pin.start)&&Date.parse(pin.start)<Date.parse(a.end));
        if(appointment)return blocked('A pinned nap starts during an awake period.','pins',{pin,appointment});
      }
      if(pins.length)return blocked('No schedule fits the saved nap pins within the wake windows, nap profiles or appointments. Move or release a pin, or review its duration profile.','pins');
      if(periods.length)return blocked(`No schedule fits around ${periods.map(a=>a.label||'the keep-awake period').join(', ')} within your limits. Review the appointment times or nap and wake-window settings.`,'appointments');
      return blocked('No bedtime fits the remaining wake-window limits today. Review the recorded wake time, nap allowance or final wake-window settings.','day-end');
    }
    const best=standard[0],selected=[best];
    if(compare){
      const variants=standard.slice(1).concat(solve('long').slice(0,1),solve('short').slice(0,1));
      const diverse=(a,b)=>a.count!==b.count||Math.abs(a.bedtime-b.bedtime)>=15*minute||
        a.events.some((e,i)=>e.kind==='nap'&&Math.abs(e.minutes-b.events[i].minutes)>=15);
      // Include a different count when feasible, then the strongest distinct remaining option.
      const differentCount=standard.find(p=>p.count!==best.count);
      if(differentCount)selected.push(differentCount);
      for(const p of variants.sort(rank)){
        if(selected.length===3)break;
        if(selected.every(q=>diverse(p,q)))selected.push(p);
      }
      selected.sort((a,b)=>a===best?-1:b===best?1:rank(a,b));
    }
    return selected.map(p=>({...p,message:(p.deviation
      ?`The closest bedtime for this option is ${Math.abs(p.deviation)} minutes ${p.deviation>0?'later':'earlier'} than target.`
      :'This plan fits the bedtime target.')+(base.activeNap?' Remaining times use the expected wake.':'')}));
  }
  const plan=(day,s,now)=>alternatives(day,s,now)[0];
  W.validatePlanning=validatePlanning;W.napIdentity=identity;W.plan=plan;W.alternatives=alternatives;
  return W;
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WWPlanning;
