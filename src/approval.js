/* Approval snapshots store the selected timeline and the inputs used to review it. */
const WWApproval = (() => {
  const W=typeof WW!=='undefined'?WW:require('./planning.js');
  const minute=60000;
  const byOrdinal=plan=>plan.events.filter(e=>e.kind==='nap');
  function constraints(day,s){
    return {
      morning:day.morning||null,bedtime:day.bedtime||s.bedtime,planning:day.planning,
      timezone:s.timezone,counts:W.napCounts(s),profiles:W.napProfiles(s),
      first:s.first,second:s.second,later:s.later,final:s.final
    };
  }
  function basis(S){
    const {day,settings}=S;
    return {
      constraints:constraints(day,settings),
      naps:day.naps.map(n=>({entity:W.napIdentity(n),revision:n.revision,start:n.start,end:n.end,expectedEnd:n.expectedEnd||null}))
    };
  }
  function approvalHeads(records){
    const superseded=new Set(records.flatMap(r=>[r.base,...(r.value?.resolved||[])]));
    return records.filter(r=>!superseded.has(r.id)).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
  }
  const signature=S=>JSON.stringify([S.date,S.revisions,S.day.naps.map(n=>n.revision),S.approvalVersions?.map(v=>v.id)||[],S.conflicts]);
  function saveApproval(S,plan,generatedAt){
    const {anchor,target,bedtime,events,count,totalNaps,deviation}=plan;
    return {basis:basis(S),generatedAt,plan:{anchor,target,bedtime,events,count,totalNaps,deviation}};
  }
  function changes(S,approved){
    const current=basis(S),before=approved.basis,reasons=[];
    const keys={morning:'Morning wake changed.',bedtime:'The bedtime target changed.',planning:'Appointments or nap pins changed.',
      timezone:'The household timezone changed.',counts:'The daily nap target or maximum changed.',profiles:'Nap duration profiles changed.',
      first:'The first wake-window settings changed.',second:'The second wake-window settings changed.',
      later:'Later wake-window settings changed.',final:'The final wake-window settings changed.'};
    for(const [key,message] of Object.entries(keys)){
      if(JSON.stringify(before.constraints[key])!==JSON.stringify(current.constraints[key]))reasons.push(message);
    }
    const suggested=byOrdinal(approved.plan);
    const showDifference=(ordinal,label,value,planned)=>{
      if(!value||!planned)return;
      const delta=Date.parse(value)-new Date(planned).getTime();
      if(Math.abs(delta)>10*minute)reasons.push(`Nap ${ordinal} ${label} ${Math.round(Math.abs(delta)/minute)} minutes ${delta>0?'later':'earlier'} than approved.`);
    };
    for(let i=0;i<Math.max(before.naps.length,current.naps.length);i++){
      const baseline=before.naps[i],nap=current.naps[i],ordinal=i+1;
      if(baseline&&(!nap||baseline.entity!==nap.entity)){
        reasons.push(`The recorded nap history changed at nap ${ordinal}.`);
        continue;
      }
      const planned=suggested.find(e=>e.ordinal===ordinal);
      if(!baseline&&!planned){
        reasons.push(`Nap ${ordinal} was added beyond the approved schedule.`);
        continue;
      }
      showDifference(ordinal,'started',nap.start,baseline?.start||planned?.start);
      if(nap.end)showDifference(ordinal,'ended',nap.end,baseline?.end||baseline?.expectedEnd||planned?.end);
      else showDifference(ordinal,'is expected to end',nap.expectedEnd,baseline?.expectedEnd||planned?.end);
    }
    return reasons;
  }
  function overdue(S,approved,now){
    const next=byOrdinal(approved.plan).find(e=>e.ordinal>S.day.naps.length);
    if(next&&next.start<now)return `Nap ${next.ordinal} is overdue. Log it if it happened, or use Recalculate to review your options.`;
    const active=S.day.naps.find(n=>n.end===null);
    if(active&&Date.parse(active.expectedEnd)<=now)return 'Expected wake has passed. Update expected wake or record the actual wake.';
    return '';
  }
  function expired(plan,now){
    return plan.events.some(e=>e.kind==='nap'&&e.start<now||e.kind==='final'&&e.end<now);
  }
  W.approval={approvalHeads,signature,saveApproval,changes,overdue,expired};
  return W;
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WWApproval;
