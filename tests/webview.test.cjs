const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {
  today,yesterday,epoch,plan,previous,createFiles,createApp,state,entry,disk,plain
}=require('./fixtures.cjs');

function attrs(text) {
  const items=[...text.matchAll(/([a-z][\w-]*)(?:="([^"]*)")?/gi)];
  return Object.fromEntries(items.map(([,name,value])=>[name,value??'']));
}
function buildPage(html){
  const elements=new Map(),timers=new Map(),handlers=new Map();
  const body=html.split('<body>')[1].split('<script>')[0];
  let nextTimer=0;
  function element(tag,attributes={}){
    const listeners=new Map();
    const node={
      tag,attributes,value:attributes.value??'',checked:'checked' in attributes,
      hidden:'hidden' in attributes,disabled:'disabled' in attributes,style:{},clientWidth:390,clientHeight:220,
      dataset:Object.fromEntries(Object.entries(attributes).filter(([key])=>key.startsWith('data-')).map(([k,v])=>[k.slice(5),v])),
      getAttribute(name){return this.attributes[name]??null;},
      setAttribute(name,value){this.attributes[name]=String(value);},
      get validity(){return {valid:true};},
      closest(){return this;},
      addEventListener(event,handler){listeners.set(event,handler);},
      async dispatch(event){
        const payload={target:this,preventDefault(){}};
        await listeners.get(event)?.(payload);
        await this['on'+event]?.(payload);
        if(event==='click'&&tag==='button')await handlers.get('click')?.(payload);
      },
      focus(){},
      insertAdjacentHTML(position,html){
        const fields=get('edit-form').elements, old={...fields};
        const saved=this.innerHTML;
        this.innerHTML=position==='afterbegin'?html+saved:saved+html;
        Object.assign(get('edit-form').elements,old);
      },
      showModal(){this.open=true;},
      close(){this.open=false;},
      textContent:'',
      get innerHTML(){return this.rendered??'';},
      set innerHTML(markup){
        this.rendered=markup;
        if(attributes.id!=='editor-fields')return;
        const form=get('edit-form');
        for(const id of this.childIds||[])elements.delete(id);
        this.childIds=[];
        for(const [,tag,props] of markup.matchAll(/<([a-z][\w-]*)\b([^>]*?)>/gi)){
          const attributes=attrs(props);
          if(attributes.id){
            elements.set(attributes.id,element(tag,attributes));
            this.childIds.push(attributes.id);
          }
        }
        form.elements={};
        const fields=markup.matchAll(/<(input|select)\b([^>]*?)>/gi);
        for(const [,type,properties] of fields){
          const fieldAttrs=attrs(properties);
          if(fieldAttrs.name)form.elements[fieldAttrs.name]=element(type,fieldAttrs);
        }
        for(const [,props,choices] of markup.matchAll(/<select\b([^>]*?)>(.*?)<\/select>/gis)){
          const name=attrs(props).name;
          const selected=choices.match(/<option value="([^"]*)"[^>]*\bselected\b/);
          const first=choices.match(/<option value="([^"]*)"/);
          if(name)form.elements[name].value=selected?.[1]??first?.[1]??'';
        }
      }
    };
    return node;
  }
  const nodes=[...body.matchAll(/<([a-z][\w-]*)\b([^>]*?)>/gi)].map(([,tag,raw])=>element(tag,attrs(raw)));
  for(const node of nodes)if(node.attributes.id)elements.set(node.attributes.id,node);
  const get=id=>elements.get(id);
  class BrowserDate extends Date {
    constructor(...args){super(...(args.length?args:[epoch]));}
    static now(){return epoch;}
  }
  const env={
    Date:BrowserDate,
    document:{
      getElementById:get,
      querySelector(selector){
        return selector.startsWith('#')?get(selector.slice(1)):
          nodes.find(n=>n.attributes.class?.split(' ').includes(selector.slice(1)));
      },
      addEventListener:(name,handler)=>handlers.set(name,handler),
      querySelectorAll(selector){
        if(selector==='.dialog-status')return nodes.filter(n=>n.attributes.class==='dialog-status');
        const base=nodes.concat(Object.values(get('edit-form').elements||{}));
        if(selector==='[data-days]')return base.filter(n=>n.dataset.days!==undefined);
        if(selector==='button,input,select,textarea')return base.filter(n=>['button','input','select','textarea'].includes(n.tag));
        throw Error('Unexpected selector '+selector);
      }
    },
    ResizeObserver:class{observe(){}},
    addEventListener(){},
    confirm:()=>true,
    alert(message){throw Error(message);},
    setTimeout(cb,delay){timers.set(++nextTimer,{cb,delay});return nextTimer;},
    clearTimeout:id=>timers.delete(id)
  };
  env.window=env;
  const context=vm.createContext(env);
  for(const [,js] of html.matchAll(/<script>(.*?)<\/script>/gs))vm.runInContext(js,context);
  return {
    evaluate:js=>vm.runInContext(js,context),
    model:env.BudgetApp,get,
    click:id=>get(id).dispatch('click'),
    submit:()=>get('edit-form').dispatch('submit'),
    field:name=>get('edit-form').elements[name],
    delegated:dataset=>handlers.get('click')({target:{closest:()=>({dataset})}}),
    expire(){
      for(const [id,timer] of [...timers]){timers.delete(id);timer.cb();}
    }
  };
}

async function until(condition){
  const end=Date.now()+3500;
  while(!condition()){
    if(Date.now()>end)throw Error('Mock WebView did not reach expected state');
    await new Promise(resolve=>setTimeout(resolve,5));
  }
}

async function open(t,fm,options={}){
  let page,close,failure,fault=options.replyFault;
  const presentation=new Promise(resolve=>{close=resolve;});
  const shared=[],alerts=[];
  const app=createApp(fm,{
    config:{runsInApp:true},
    WebView:class{
      async loadHTML(html){page=buildPage(html);}
      present(){return presentation;}
      async evaluateJavaScript(js){if(fault&&js.startsWith('window.budgetReply('))throw Error('mock reply failure');return page.evaluate(js);}
    },
    Timer:{schedule:(delay,repeat,cb)=>setTimeout(cb,5)},
    DocumentPicker:{open:async()=>options.picked||[]},
    ShareSheet:{present:async files=>shared.push(...files)},
    Alert:class{
      addAction(){}
      addCancelAction(){}
      addDestructiveAction(){}
      async presentAlert(){alerts.push(this.title);return options.alertChoice??-1;}
    },
    console:{log(){}}
  });
  const running=app.run(options.input||'OPEN').catch(e=>{failure=e;});
  t.after(async()=>{close();await running;if(failure)throw failure;});
  await until(()=>page?.model||failure);
  if(failure)throw failure;
  return {page,shared,alerts,clearReplyFault:()=>{fault=false;}};
}

test('dashboard renders today, initial projection, selected date and Ledger',async t=>{
  const fm=createFiles(state({rules:[entry()]}));
  const {page}=await open(t,fm);
  assert.match(page.get('calendar').innerHTML,/aria-current="date">17/);
  assert.match(page.get('readout').innerHTML,/\$400/);
  await page.click('tab-ledger');
  assert.match(page.get('ledger-events').innerHTML,/Test bill/);
  await page.click('tab-horizon');
  page.model.inspect('2026-11-18');
  assert.match(page.get('readout').innerHTML,/Nov 18/);
});

test('buffer settings save repeatedly through the released WebView bridge',async t=>{
  const fm=createFiles(state());
  const {page}=await open(t,fm);
  for(const amount of ['125.05','200.00']){
    await page.click('settings');
    page.get('buffer').value=amount;
    await page.click('save-buffer');
    assert.match(page.get('status').textContent,/Saved on this iPhone/);
  }
  assert.equal(disk(fm).revision,2);
  assert.equal(disk(fm).buffer,20000);
  assert.equal(disk(fm,previous).buffer,12505);
});

test('financing editor creates and edits a schedule and the forecast honors its count',async t=>{
  const fm=createFiles(state());
  const {page}=await open(t,fm);
  await page.click('manage');
  await page.click('add-financing');
  page.field('name').value='Synthetic financing';
  page.field('start').value='2026-12-31';
  page.field('amount').value='33.43';
  await page.field('start').dispatch('input');
  assert.match(page.get('financing-end').textContent,/May 31, 2027/);
  await page.submit();
  assert.equal(disk(fm).rules[0].installments,6);
  await page.delegated({days:'365'});
  const dates=()=>plain(page.model.getResult().events).map(e=>e.date);
  assert.deepEqual(dates(),['2026-12-31','2027-01-31','2027-02-28','2027-03-31','2027-04-30','2027-05-31']);
  const id=disk(fm).rules[0].id;
  await page.click('manage');
  await page.delegated({rule:id});
  page.field('installments').value='4';
  await page.submit();
  assert.deepEqual(dates(),['2026-12-31','2027-01-31','2027-02-28','2027-03-31']);
});

test('OCR review leaves the previously saved balance untouched when dismissed',async t=>{
  const fm=createFiles(state());
  const {page}=await open(t,fm,{input:{action:'IMPORT_BALANCE',text:'Checking Balance\n$1,234.56\nStatement balance $80.00'}});
  assert.equal(page.get('editor-title').textContent,'Review screenshot balance');
  assert.equal(page.field('amount').value,'1234.56');
  assert.equal(page.field('verified').checked,false);
  await page.click('close-editor');
  assert.equal(disk(fm).revision,0);
});

test('OCR review requires confirmation and saves the selected amount without the raw OCR',async t=>{
  const fm=createFiles(state());
  const {page}=await open(t,fm,{input:{action:'IMPORT_BALANCE',text:'Checking Balance $1,234.56\nSavings Balance $5,678.00'}});
  assert.equal(page.field('amount').value,'');
  page.field('candidate').value='0';
  await page.field('candidate').dispatch('change');
  page.field('date').value=yesterday;
  await page.submit();
  assert.equal(disk(fm).revision,0);
  assert.match(page.get('form-error').textContent,/Confirm the verified closing balance/);
  page.field('verified').checked=true;
  await page.submit();
  assert.deepEqual(disk(fm).balance,{date:yesterday,cents:123456});
  assert.doesNotMatch(fm.readString(plan),/Savings Balance|5,678/);
});

test('Horizon requires reconciliation and recalculates after a same-day debit is marked pending',async t=>{
  const fm=createFiles(state({rules:[entry({cents:70000})]}));
  await createApp(fm).run('CHECKING: $500.00');
  const {page}=await open(t,fm);
  assert.match(page.get('outlook-warning').innerHTML,/Review same-day/);
  assert.match(page.get('banner').innerHTML,/1 same-day items need review/);
  await page.delegated({event:'bill@'+today});
  page.field('checking').value='pending';
  await page.submit();
  assert.match(page.get('outlook-warning').innerHTML,/Shortfall on Nov 17/);
  assert.equal(disk(fm).balance.cents,50000);
});

test('old dashboard rejects a save after a separate Shortcut updated the plan',async t=>{
  const fm=createFiles(state());
  const {page}=await open(t,fm);
  await createApp(fm).run('CHECKING: $780.00');
  await page.click('settings');
  page.get('buffer').value='100.00';
  await page.click('save-buffer');
  assert.match(page.get('status').textContent,/The plan changed in another session/);
  assert.equal(disk(fm).balance.cents,78000);
  assert.equal(disk(fm).buffer,0);
  assert.equal(page.get('close-settings').disabled,false);
});

test('lost save confirmation exposes reload and reloads the committed revision',async t=>{
  const fm=createFiles(state());
  const {page,clearReplyFault}=await open(t,fm,{replyFault:true});
  await page.click('settings');
  page.get('buffer').value='123.45';
  const pending=page.click('save-buffer');
  await until(()=>disk(fm).revision===1);
  assert.equal(page.get('close-settings').disabled,false);
  page.expire();
  await pending;
  assert.match(page.get('status').textContent,/Reload saved data before editing again/);
  await page.click('close-settings');
  clearReplyFault();
  await page.click('reload-saved');
  assert.match(page.get('status').textContent,/Reloaded saved data/);
  assert.equal(page.model.getState().buffer,12345);
  assert.equal(disk(fm).revision,1);
});

test('export and confirmed restore work with simulated picker and share sheet',async t=>{
  const fm=createFiles(state()),from='/tmp/synthetic-restore.json';
  fm.writeString(from,JSON.stringify(state({revision:7,buffer:12345})));
  const {page,shared}=await open(t,fm,{picked:[from],alertChoice:0});
  await page.click('settings');
  await page.click('export');
  assert.equal(shared.length,1);
  assert.equal(disk(fm,shared[0]).buffer,0);
  await page.click('restore');
  assert.equal(disk(fm).buffer,12345);
  assert.equal(disk(fm).revision,1);
  assert.equal(disk(fm,previous).buffer,0);
});

test('dismissing captured text removes it from the plan and backup while retaining a fingerprint',async t=>{
  const raw='SYNTHETIC_CAPTURE_TO_DISMISS',fm=createFiles(state());
  await createApp(fm).run({action:'CAPTURE_TEXT',requestId:'dismiss-me',text:raw});
  const {page,shared}=await open(t,fm);
  await page.click('settings');
  await page.click('captures');
  await page.delegated({dismiss:'capture_dismiss-me'});
  await until(()=>disk(fm).integrations.inbox.length===0);
  assert.match(disk(fm).integrations.requests[0].signature,/^sha256:[a-f0-9]{64}$/);
  assert.ok(!fm.readString(previous).includes(raw));
  await until(()=>page.model.getState().integrations.inbox.length===0);
  await page.click('close-inbox');
  await page.click('settings');
  await page.click('export');
  assert.ok(!fm.readString(shared[0]).includes(raw));
});

test('confirmed recovery restores the prior plan and preserves the unreadable file',async t=>{
  const fm=createFiles(state()),unreadable='{"revision":';
  fm.writeString(previous,JSON.stringify(state({revision:3,buffer:12345})));
  fm.writeString(plan,unreadable);
  const {alerts}=await open(t,fm,{alertChoice:0});
  assert.match(alerts[0],/Recover previous saved plan/);
  assert.equal(disk(fm).revision,3);
  assert.equal(disk(fm).buffer,12345);
  assert.ok([...fm.files.entries()].some(([file,contents])=>file.includes('/unreadable-')&&contents===unreadable));
});

test('Manage entries preserves the list and scroll position through two saves and cancel',async t=>{
  const fm=createFiles(state({rules:[entry({id:'one'}),entry({id:'two'})]}));
  const {page}=await open(t,fm);
  await page.click('manage');
  page.get('manager').scrollTop=174;
  for(const [id,amount] of [['one','75.50'],['two','90.25']]){
    await page.delegated({rule:id});
    assert.equal(page.get('manager').open,false);
    page.field('amount').value=amount;
    await page.submit();
    assert.equal(page.get('manager').open,true);
    assert.equal(page.get('editor').open,false);
    assert.equal(page.get('manager').scrollTop,174);
  }
  await page.delegated({rule:'one'});
  page.field('amount').value='0';
  await page.submit();
  assert.equal(page.get('editor').open,true);
  await page.click('close-editor');
  assert.equal(page.get('manager').open,true);
  assert.deepEqual(disk(fm).rules.map(r=>r.cents),[7550,9025]);
  assert.equal(disk(fm).revision,2);
});

if(require('./fixtures.cjs').manifest.version==='1.4.0'){
  test('bill presets fill editable names and categories, while Custom accepts a new name',async t=>{
    const fm=createFiles(state());
    const {page}=await open(t,fm);
    await page.click('add-bill');
    page.field('preset').value='2';
    await page.field('preset').dispatch('change');
    assert.equal(page.field('name').value,'Groceries');
    assert.equal(page.field('category').value,'groceries');
    page.field('name').value='Weekly groceries';
    page.field('amount').value='85.25';
    await page.submit();
    assert.equal(disk(fm).rules[0].name,'Weekly groceries');
    assert.equal(disk(fm).rules[0].category,'groceries');
    await page.click('add-bill');
    page.field('preset').value='';
    await page.field('preset').dispatch('change');
    assert.equal(page.field('name').value,'');
    page.field('name').value='Music lessons';
    page.field('category').value='other';
    page.field('amount').value='50';
    await page.submit();
    assert.equal(disk(fm).rules[1].name,'Music lessons');
  });

  test('Budgets saves monthly goals, records and edits payments, and updates the over/under amount',async t=>{
    const fm=createFiles(state({rules:[
      entry({id:'grocery',category:'groceries',cents:27000}),
      entry({id:'next',start:'2026-11-22',category:'groceries',cents:17000})
    ]}));
    const {page}=await open(t,fm);
    await page.click('tab-budgets');
    assert.equal(page.get('budgets').hidden,false);
    assert.match(page.get('budget-categories').innerHTML,/No records/);
    await page.delegated({budgetGoal:'groceries'});
    page.field('amount').value='400';
    await page.submit();
    assert.match(page.get('budget-categories').innerHTML,/\$40 over projected/);
    await page.delegated({budgetPay:'grocery@'+today});
    page.field('amount').value='200';
    await page.submit();
    assert.doesNotMatch(page.get('budget-planned').innerHTML,/grocery@/);
    assert.match(page.get('budget-categories').innerHTML,/\$30 under projected/);
    await page.click('log-spending');
    page.field('name').value='More groceries';
    page.field('category').value='groceries';
    page.field('amount').value='60';
    await page.submit();
    assert.match(page.get('budget-categories').innerHTML,/\$30 over projected/);
    const actual=disk(fm).budget.actual;
    await page.delegated({budgetEdit:actual[1].id});
    page.field('amount').value='30';
    await page.submit();
    assert.match(page.get('budget-categories').innerHTML,/At goal projected/);
    assert.equal(disk(fm).budget.actual[0].key,'grocery@'+today);
  });
}
