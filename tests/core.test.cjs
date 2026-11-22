const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {
  today, yesterday, epoch, plan, previous, lock, source, manifest, launcherSource,
  createFiles, createApp, state, entry, disk, plain
} = require('./fixtures.cjs');

const { Budget: B, BudgetAutomation: A, detectedBalances, DASHBOARD } = createApp(createFiles());
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

test('pinned bytes, SHA-256 and WebView forecast implementation match', () => {
  assert.equal(Buffer.byteLength(source), manifest.bytes);
  assert.equal(hash(source), manifest.sha256);
  const nativeEngine = source.slice(source.indexOf('/* Shared forecast'), source.indexOf('/* Versioned command')).trim();
  const webEngine = DASHBOARD.split('<script>')[1].split('</script>')[0].trim();
  assert.equal(nativeEngine, webEngine);
});

test('daily projection adds exact cents and combines same-day income and bills', () => {
  const s = state({
    balance: {cents: 600001, date: yesterday},
    rules: [entry({id:'pay', kind:'income', cents:270003}), entry({cents:360005}), entry({id:'rent',cents:258002})]
  });
  const f = B.forecast(s, 3, undefined, today);
  assert.equal(f.points.length, 4);
  assert.equal(f.points[0].cents, 251997);
  assert.equal(f.end.cents, 251997);
  assert.equal(f.end.date, '2026-11-20');
  assert.equal(f.points[0].events.length, 3);
});

test('verified closing anchor excludes its own activity and carries intervening activity forward', () => {
  const s = state({balance:{cents:50000, date:'2026-11-14'},rules:[
    entry({id:'already-posted',start:'2026-11-14',cents:5000}),
    entry({id:'intervening',start:'2026-11-15',cents:11000}),
    entry({cents:33000})
  ]});
  const f = B.forecast(s, 7, undefined, today);
  assert.equal(f.points[0].cents, 6000);
  assert.equal(f.events.length, 1);
  assert.equal(A.command(s,{action:'SUMMARY',days:7},today).output.projectedTodayCents,6000);
});

test('weekly and biweekly recurrence stays on local calendar days across DST', () => {
  const week = entry({frequency:'weekly',start:'2026-10-25'});
  assert.deepEqual(plain(B.occurrences(week,'2026-10-25','2026-11-12')), ['2026-10-25','2026-11-01','2026-11-08']);
  assert.deepEqual(plain(B.occurrences({...week,frequency:'biweekly'},'2026-10-26','2026-11-25')), ['2026-11-08','2026-11-22']);
});

test('annual and semimonthly schedules handle leap years and their ordinary dates', () => {
  assert.deepEqual(plain(B.occurrences(entry({frequency:'yearly',start:'2024-02-29'}),'2025-01-01','2028-03-01')),
    ['2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
  assert.deepEqual(plain(B.occurrences(entry({frequency:'semimonthly',days:[1,15],start:'2026-01-01'}),'2026-02-01','2026-03-15')),
    ['2026-02-01','2026-02-15','2026-03-01','2026-03-15']);
});

test('six monthly installments from the 31st remain six payments', () => {
  const start = '2026-01-31';
  const end = B.installmentEnd(start,6);
  assert.equal(end,'2026-06-30');
  const r = entry({frequency:'monthly',start,end,installments:6,cents:12345});
  const s = state({balance:{date:'2026-01-01',cents:100000},rules:[r]});
  const f = B.forecast(s,250);
  assert.deepEqual(plain(f.events.map(e=>e.date)),['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31','2026-06-30']);
  assert.equal(f.end.cents,25930);
});

test('moving or skipping one installment affects one event and keeps the rest', () => {
  const r = entry({start:'2027-01-31',end:'2027-06-30',frequency:'monthly',installments:6,estimated:true});
  const s = state({rules:[r],overrides:{
    'bill@2027-01-31':{cents:10000,date:'2027-02-02',skip:false,confirmed:true},
    'bill@2027-04-30':{cents:10000,date:'2027-04-30',skip:true,confirmed:false}
  }});
  const f = B.forecast(s,300,undefined,today);
  assert.deepEqual(plain(f.events.map(e=>e.date)),['2027-02-02','2027-02-28','2027-03-31','2027-05-31','2027-06-30']);
  assert.equal(f.events[0].estimated,false);
  assert.equal(f.events[1].estimated,true);
});

test('purchase preview changes the scenario while preserving the baseline and plan', () => {
  const s = state({rules:[entry({cents:25001})],buffer:10000});
  const original = JSON.stringify(s);
  const f = B.forecast(s,5,{enabled:true,cents:31000,date:'2026-11-18'},today);
  assert.equal(f.points[0].base,24999);
  assert.equal(f.points[0].cents,24999);
  assert.equal(f.first.date,'2026-11-18');
  assert.equal(f.first.cents,-6001);
  assert.equal(f.end.base,24999);
  assert.equal(JSON.stringify(s),original);
});

test('checking command accepts a single formatted amount including overdrafts and rejects ambiguous text', () => {
  for (const [amount, cents] of [['$1,234.56',123456],['$0.00',0],['($53.24)',-5324],['$-2.04',-204],['-$50.00',-5000]]) {
    const result=A.command(state(),'CHECKING: '+amount,today);
    assert.deepEqual(plain(result.next.balance),{date:today,cents,basis:'checking_snapshot'});
  }
  for (const bad of ['$23.00 $47.00','$1,23.45','900.00','$1,234.5','Account balance: $2.00']) {
    assert.throws(()=>A.command(state(),'CHECKING: '+bad,today),/Pass one checking balance/);
  }
});

test('a valid checking Shortcut saves once and same-value repeats do not change the revision', async () => {
  const fm=createFiles(state()), app=createApp(fm);
  const p={action:'CHECKING',amount:'$1,234.56',format:'json'};
  const first=await app.run(p), retry=await app.run(p);
  assert.equal(first.revision,1);
  assert.equal(retry.alreadyApplied,true);
  assert.equal(retry.revision,1);
  assert.equal(disk(fm).balance.date,today);
  assert.equal(disk(fm,previous).balance.date,yesterday);
  assert.equal((await app.run({action:'FORECAST',days:2})).points[0].closingBalanceCents,null);
});

test('a checking snapshot exposes a due-today debit for reconciliation', async () => {
  const fm=createFiles(state({rules:[entry({cents:70000})]})), app=createApp(fm);
  const result=await app.run({action:'CHECKING',amount:'$500.00',format:'json'});
  const report=await app.run({action:'FORECAST',days:3});
  assert.equal(result.scheduledSameDay,1);
  assert.equal(report.lowestBalanceCents,50000);
  assert.equal(report.firstShortfall,null);
  assert.equal(report.points[0].transactions.length,0);
  assert.equal(report.unreviewedChecking[0].cents,-70000);
  assert.match(report.summary,/need posting review/);
});

test('semimonthly bills on the 30th and 31st remain distinct in a short month', () => {
  const r=entry({frequency:'semimonthly',days:[30,31],start:'2027-01-30',cents:10000});
  const s=state({balance:{cents:50000,date:'2027-01-29'},rules:[r]});
  B.validate(s);
  const f=B.forecast(s,61);
  assert.equal(f.events.filter(e=>e.date.startsWith('2027-01')).length,2);
  assert.equal(f.events.filter(e=>e.date.startsWith('2027-02')).length,2);
  assert.equal(f.events.filter(e=>e.date.startsWith('2027-03')).length,2);
  assert.equal(f.points.find(p=>p.date==='2027-02-28').cents,10000);
});

test('screenshot parser selects labeled values and leaves multiple accounts for review', () => {
  const raw='Checking balance\n$1,234.56\nSavings Balance: $432.10\nStatement balance $90.00\nAvailable credit $500.00\nPending balance $12.00';
  assert.deepEqual(plain(detectedBalances(raw)).map(x=>x.cents),[123456,43210]);
  assert.deepEqual(plain(detectedBalances('Checking balance $12.34 or $56.78')),[]);
});

test('read-only text, JSON, HTML and notification candidates leave the local plan unchanged',async()=>{
  const fm=createFiles(state({rules:[entry({start:'2026-11-18'})]})),app=createApp(fm);
  const before=fm.readString(plan);
  assert.match(await app.run('VIEW'),/Projected closing balance/);
  assert.match(await app.run('SUMMARY'),/Lowest:/);
  assert.equal((await app.run({action:'SUMMARY',format:'json'})).asOf,yesterday);
  assert.match(await app.run({action:'VIEW',format:'html'}),/Exact daily balances/);
  assert.equal((await app.run({action:'FORECAST',days:2})).points[1].transactions.length,1);
  const notice=await app.run({action:'NOTIFICATION_PLAN'});
  assert.equal(notice.items.length,1);
  assert.equal(notice.scheduled,false);
  assert.equal(fm.readString(plan),before);
});

test('automation receipts handle retries, reject changed payloads and stale revisions',async()=>{
  const fm=createFiles(state()),app=createApp(fm);
  const command={action:'ADD_ENTRY',requestId:'first',expectedRevision:0,entry:{
    kind:'bill',name:'Test financing',amount:'22.05',frequency:'monthly',start:'2026-12-31',installments:6
  }};
  assert.equal((await app.run(command)).revision,1);
  assert.equal((await app.run(command)).alreadyApplied,true);
  assert.equal(disk(fm).rules.length,1);
  assert.equal(disk(fm).rules[0].end,'2027-05-31');
  await assert.rejects(app.run({...command,entry:{...command.entry,amount:'29.11'}}),/different input/);
  await assert.rejects(app.run({...command,requestId:'second'}),/current expectedRevision/);
  assert.equal(disk(fm).revision,1);
});

test('repeated verified overwrites preserve the previous plan and clear the lock',async()=>{
  const fm=createFiles(state()),app=createApp(fm);
  await app.run('CHECKING: $600.00');
  await app.run('CHECKING: $650.00');
  await app.run('CHECKING: $750.00');
  assert.equal(disk(fm).revision,3);
  assert.equal(disk(fm).balance.cents,75000);
  assert.equal(disk(fm,previous).balance.cents,65000);
  assert.ok(!fm.fileExists(lock));
});

test('mock partial write is rolled back to the prior verified plan',async()=>{
  const fm=createFiles(state()),app=createApp(fm),original=fm.readString(plan),write=fm.writeString;
  let fail=true;
  fm.writeString=(file,content)=>{
    if(file===plan&&fail){
      fail=false;
      write(file,'{"revision":');
      throw Error('mock interrupted write');
    }
    write(file,content);
  };
  await assert.rejects(app.run('CHECKING: $725.00'),/previous plan was kept/);
  assert.equal(fm.readString(plan),original);
  assert.equal(fm.readString(previous),original);
  assert.ok(!fm.fileExists(lock));
});

test('a valid expired save lock allows later saves',async()=>{
  const fm=createFiles(state());
  fm.writeString(lock,JSON.stringify({token:'old',expires:epoch-1}));
  await createApp(fm).run('CHECKING: $715.00');
  assert.equal(disk(fm).revision,1);
});

test('a malformed legacy lock no longer prevents a save',async()=>{
  const fm=createFiles(state());
  fm.writeString(lock,'{"token":');
  await createApp(fm).run('CHECKING: $725.00');
  assert.equal(disk(fm).revision,1);
});
test('cleanup failure does not turn an already committed save into a false failure',async()=>{
  const fm=createFiles(state()),remove=fm.remove;
  fm.remove=file=>{
    if(file.includes('/pending-'))throw Error('mock cleanup denied');
    return remove(file);
  };
  await createApp(fm).run('CHECKING: $725.00');
  assert.equal(disk(fm).revision,1);
  assert.equal(fm.listContents('/documents/BudgetPlannerV1').filter(x=>x.startsWith('writer-')).length,0);
});
test('background budget data is not seeded implicitly and raw OCR must be reviewed',async()=>{
  const app=createApp(createFiles());
  await assert.rejects(app.run('SUMMARY'),/SETUP_REQUIRED/);
  await assert.rejects(app.run({action:'IMPORT_BALANCE',text:'Checking balance $10.00'}),/Run in App on/);
});

function launcherHarness() {
  const fm=createFiles(),keyData=new Map(),pages=new Map(),loaded=[];
  let counter=0;
  const api=vm.runInNewContext(launcherSource.split('\ntry{\n  const updater=')[0]+'\n({createBudgetUpdater,sha256})');
  function newUpdater(){
    return api.createBudgetUpdater({
      fm,
      keychain:{contains:key=>keyData.has(key),get:key=>keyData.get(key),set:(key,val)=>keyData.set(key,val)},
      request:url=>({
        response:{statusCode:200},
        async loadString(){
          const key=url.split('/budget-planner-test/')[1].split('?')[0];
          if(!pages.has(key))throw Error('mock offline');
          return pages.get(key);
        }
      }),
      bytes:s=>Buffer.from(s),uuid:()=>String(++counter),
      loadModule:file=>{
        const mod={exports:{}};
        vm.runInNewContext(fm.readString(file),{module:mod,hit:async input=>loaded.push(input)});
        return mod.exports;
      }
    });
  }
  function publish(text, sequence, version){
    const digest=hash(text),path='releases/'+digest+'.js';
    const next={...manifest,sequence,version,sha256:digest,bytes:Buffer.byteLength(text),path};
    pages.set(path,text);
    pages.set('manifest.json',JSON.stringify(next));
    return next;
  }
  return {fm,api,pages,newUpdater,publish,loaded};
}
const validModule='module.exports={run:async input=>hit(input)};';

test('launcher SHA-256 matches Node and supports updates, offline cache and rollback',async()=>{
  const h=launcherHarness();
  assert.equal(h.api.sha256(Buffer.from(source)),manifest.sha256);
  const first=h.publish(validModule+'// previous',4,'1.2.2'), updater=h.newUpdater();
  await updater.run('VIEW');
  h.publish(validModule,5,'1.3.0');
  await updater.run('SUMMARY');
  assert.match(updater.info(),/1\.3\.0/);
  h.pages.clear();
  await h.newUpdater().run('offline');
  assert.equal(updater.canRevert(),true);
  updater.revert();
  const reverted=h.newUpdater();
  assert.match(reverted.info(),/1\.2\.2.*updates paused/);
  await reverted.run('reverted');
  assert.deepEqual(h.loaded,['VIEW','SUMMARY','offline','reverted']);
  assert.ok(h.fm.fileExists('/library/BudgetPlannerReleasesV1/'+first.sha256+'.js'));
});

test('launcher rejects a checksum mismatch and continues running the verified cache',async()=>{
  const h=launcherHarness();
  h.publish(validModule,4,'1.2.2');
  const updater=h.newUpdater();
  await updater.run('cached');
  const corrupt=h.publish(validModule+'// new',5,'1.3.0');
  h.pages.set(corrupt.path,validModule+'// bad');
  await updater.run('fallback');
  assert.match(updater.info(),/1\.2\.2.*checksum mismatch/);
  assert.deepEqual(h.loaded,['cached','fallback']);
});

test('launcher rejects a valid-hash module that lacks run and continues with verified cache',async()=>{
  const h=launcherHarness();
  h.publish(validModule,4,'1.2.2');
  await h.newUpdater().run('cached');
  h.publish('module.exports={};',5,'1.3.0');
  const updater=h.newUpdater();
  await updater.run('still working');
  assert.match(updater.info(),/1\.2\.2.*Invalid release entry point/);
  assert.deepEqual(h.loaded,['cached','still working']);
});
test('actual v1.2.2 source can read the financing schema after rollback',async()=>{
  const prior=fs.readFileSync(require('node:path').join(__dirname,'../releases/866d239c15d165dbbede1b500a154ec44f0284e116073540244806e098ebbc94.js'),'utf8');
  const first='2026-12-31';
  const fm=createFiles(state({rules:[entry({start:first,end:B.installmentEnd(first,6),frequency:'monthly',installments:6})]}));
  await createApp(fm).run('CHECKING: $725.00');
  const report=await createApp(fm,{},prior,false).run({action:'FORECAST',days:365});
  assert.equal(report.ok,true);
  assert.equal(report.points.flatMap(p=>p.transactions).length,6);
  assert.equal(report.points[0].closingBalanceCents,72500);
  assert.equal(disk(fm).balance.basis,'checking_snapshot');
});

test('published launcher forwards the checking Shortcut and runs cached SUMMARY with GitHub offline',async()=>{
  const fm=createFiles(state()),keys=new Map(),requests=[];
  let online=true,output,completed;
  class Request {
    constructor(url){this.url=url;this.response={statusCode:200};}
    async loadString(){
      requests.push(this.url);
      if(!online)throw Error('mock offline');
      return this.url.includes('/manifest.json?')?JSON.stringify(manifest):source;
    }
  }
  async function run(input){
    output=undefined;completed=false;
    const script={setShortcutOutput:x=>{output=x;},complete:()=>{completed=true;}};
    const ctx=vm.createContext({
      FileManager:{local:()=>fm},
      Keychain:{contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v)},
      Request,Data:{fromString:s=>({getBytes:()=>Buffer.from(s)})},UUID:{string:()=> 'temp-module'},
      importModule(file){return createApp(fm,{Script:script},fm.readString(file),false);},
      args:{shortcutParameter:input},config:{runsInApp:false},Script:script
    });
    await vm.runInContext('(async()=>{\n'+launcherSource.replace('const TESTING=true','const TESTING=false')+'\n})()',ctx);
    assert.equal(completed,true);
    return output;
  }
  assert.match(await run('CHECKING: $1,234.56'),/Checking updated: \$1,234\.56/);
  online=false;
  assert.match(await run('SUMMARY'),/Checking forecast 2026-11-17: 1234\.56 USD/);
  assert.match(await run('UPDATE_STATUS'),/1\.[34]\.[01]/);
  assert.equal(disk(fm).revision,1);
  assert.equal(requests.length,3);
  assert.ok(requests[1].endsWith(manifest.path));
});

test('the second clamped semimonthly occurrence can be adjusted independently',async()=>{
  const fm=createFiles(state({rules:[entry({start:'2027-01-30',frequency:'semimonthly',days:[30,31]})]}));
  const app=createApp(fm);
  await app.run({action:'ADJUST_PAYMENT',expectedRevision:0,requestId:'clamped',
    eventKey:'bill@2027-02-28~31',amount:'30.00',date:'2027-03-01'});
  const f=await app.run({action:'FORECAST',days:110});
  assert.deepEqual(plain(f.points.find(x=>x.date==='2027-02-28').transactions.map(e=>e.cents)),[-10000]);
  assert.deepEqual(plain(f.points.find(x=>x.date==='2027-03-01').transactions.map(e=>e.cents)),[-3000]);
});

test('checking review includes pending entries once, ignores posted entries, and resets on a refreshed snapshot',async()=>{
  const fm=createFiles(state({
    balance:{cents:50000,date:today,basis:'checking_snapshot'},
    rules:[entry({cents:70000}),entry({id:'pay',kind:'income',cents:35000})],
    overrides:{
      ['bill@'+today]:{cents:70000,date:today,skip:false,confirmed:true,checking:'pending',snapshotDate:today},
      ['pay@'+today]:{cents:35000,date:today,skip:false,confirmed:true,checking:'posted',snapshotDate:today}
    }
  }));
  const app=createApp(fm),before=await app.run({action:'FORECAST',days:2});
  assert.equal(before.firstShortfall,today);
  assert.equal(before.points[0].snapshotBalanceCents,50000);
  assert.equal(before.points[0].closingBalanceCents,-20000);
  assert.equal(before.points[1].closingBalanceCents,-20000);
  await app.run('CHECKING: $525.00');
  const after=await app.run({action:'FORECAST',days:2});
  assert.equal(after.unreviewedChecking.length,2);
  assert.equal(after.points[0].closingBalanceCents,null);
});

test('capture fingerprint is UTF-8 compatible, supports legacy backups, and rejects conflicting retries',async()=>{
  const payload={action:'CAPTURE_TEXT',requestId:'capture-test',text:'Résumé 👋'};
  const first=createFiles(state()),app=createApp(first);
  await app.run(payload);
  const persisted=disk(first);
  assert.match(persisted.integrations.requests[0].signature,/^sha256:/);
  assert.equal((await app.run(payload)).alreadyApplied,true);
  const legacy=state({integrations:{requests:[{id:payload.requestId,signature:JSON.stringify({action:'CAPTURE_TEXT',text:payload.text})}],inbox:[]}});
  const old=createApp(createFiles(legacy));
  assert.equal((await old.run(payload)).alreadyApplied,true);
  await assert.rejects(app.run({...payload,text:'different'}),/different input/);
});

test('test launcher caches independently and never opens or updates the production plan',async()=>{
  const fm=createFiles(state()),keys=new Map(),production=fm.readString(plan);
  const code=launcherSource;
  const testPlan='/documents/BudgetPlannerTestV1/plan.json';
  fm.createDirectory('/documents/BudgetPlannerTestV1');
  fm.writeString(testPlan,production);
  let output;
  const ctx=vm.createContext({
    FileManager:{local:()=>fm},Keychain:{contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v)},
    Request:class{constructor(url){this.url=url;this.response={statusCode:200};}async loadString(){return this.url.includes('manifest.json?')?JSON.stringify(manifest):source;}},
    Data:{fromString:s=>({getBytes:()=>Buffer.from(s)})},UUID:{string:()=> 'temp'},
    importModule(file){
      assert.match(file,/BudgetPlannerTestReleasesV1/);
      return {run:async(input,options)=>{
        assert.equal(options.testing,true);
        const mod={exports:{}};
        vm.runInNewContext(fm.readString(file),{module:mod,Date:class extends Date{
          constructor(...args){super(...(args.length?args:[epoch]));}
          static now(){return epoch;}
        },FileManager:{local:()=>fm},config:{runsInApp:false},Script:{setShortcutOutput:x=>{output=x;}},console});
        await mod.exports.run(input,options);
      }};
    },args:{shortcutParameter:'CHECKING: $800.00'},config:{runsInApp:false},
    Script:{setShortcutOutput:x=>{output=x;},complete(){}}
  });
  await vm.runInContext('(async()=>{\n'+code+'\n})()',ctx);
  assert.match(output,/Checking updated/);
  assert.equal(disk(fm,testPlan).balance.cents,80000);
  assert.equal(fm.readString(plan),production);
  assert.ok([...keys.keys()].every(k=>k.endsWith(':test')));
});

if(manifest.version==='1.4.0'){
  test('month ends, actual posting dates, settlement and card payoff never double count',()=>{
    const s=state({
      rules:[
        entry({id:'grocery',start:'2026-11-03',category:'groceries',cents:19000}),
        entry({id:'next',start:'2026-11-30',category:'groceries',cents:17000}),
        entry({id:'card',start:'2026-11-29',category:'groceries',cents:100000,cardPayoff:true}),
        entry({id:'rent',start:'2026-12-01',category:'housing',cents:110000})
      ],
      budget:{goals:{groceries:40000},actual:[
        {id:'actual',name:'Market',category:'groceries',cents:20000,date:'2026-11-04',key:'grocery@2026-11-03'},
        {id:'extras',name:'Extra shopping',category:'groceries',cents:6000,date:today},
        {id:'prior',name:'Prior month',category:'groceries',cents:8000,date:'2026-10-31'}
      ]}
    });
    const budget=B.monthlyBudget(s,'2026-11-01',today);
    assert.deepEqual(plain(budget.rows.find(x=>x.id==='groceries')),
      {id:'groceries',label:'Groceries',goal:40000,actual:26000,planned:17000,recorded:2});
    assert.deepEqual(plain(budget.planned.map(x=>x.id)),['next']);
    assert.equal(B.monthlyBudget(s,'2026-10-01',today).rows.find(x=>x.id==='groceries').actual,8000);
    assert.ok(B.forecast(s,20).events.some(x=>x.id==='card'));
    assert.throws(()=>B.validate({...s,budget:{...s.budget,actual:[...s.budget.actual,
      {...s.budget.actual[0],id:'duplicate-link'}]}}),/already been recorded/);
  });
}
