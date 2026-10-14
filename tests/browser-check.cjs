const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({...process.env.WAKE_PREVIEW_BROWSER?{executablePath:process.env.WAKE_PREVIEW_BROWSER}:{},headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(fs.readFileSync(path.join(__dirname,'preview.html'),'utf8'));
 await page.evaluate(()=>{
  const at=t=>WW.wall(S.date,t,S.settings.timezone);
  S.now=Date.parse(at('12:46'));S.day.morning=at('07:00');S.day.naps=[{entity:'first',revision:'r1',start:at('08:15'),end:at('09:45')},{entity:'active',revision:'r2',start:at('12:05'),end:null,expectedEnd:at('13:30')}];S.day.planning={awake:[{id:'a',label:'Appointment',start:at('14:00'),end:at('14:30')}],pins:[{id:'p',ordinal:3,start:at('15:45'),minutes:90,anchors:['first','active']}]};S.revisions.planning='plan-r1';render();
 });
 const results=[];
 function inspect(){
  const rgb=s=>s.match(/[\d.]+/g).map(Number).slice(0,3),lum=c=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
  const result=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while(n=walker.nextNode()){
   const text=n.textContent.trim(),el=n.parentElement;if(!text||['SCRIPT','STYLE'].includes(el.tagName)||!el.getClientRects().length)continue;
   let bg=el;while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;
   if(!bg)continue;const a=lum(rgb(getComputedStyle(el).color)),b=lum(rgb(getComputedStyle(bg).backgroundColor));result.push({text,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color:getComputedStyle(el).color});
  }
  return {text:result,overflow:document.documentElement.scrollWidth>innerWidth,fields:[...document.querySelectorAll('.sheet input:not([type=hidden]),.sheet select')].filter(el=>el.getClientRects().length).map(el=>({id:el.id,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))};
 }
 for(const width of [320,390,736])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const r=await page.evaluate(inspect);assert.equal(r.overflow,false);for(const t of r.text){assert.ok(t.ratio>=4.5,JSON.stringify({width,theme,...t}));if(theme==='light')assert.notEqual(t.color,'rgb(255, 255, 255)');}
  results.push({width,theme,minContrast:Math.min(...r.text.map(x=>x.ratio)).toFixed(2)});
  for(const open of ['awakeSheet()','pinSheet(3)','settingsSheet()','napSheet()','activeNapSheet(1)']){
   await page.evaluate(code=>eval(code),open);const sheet=await page.evaluate(inspect);assert.equal(sheet.overflow,false);for(const f of sheet.fields){assert.ok(f.left>=0&&f.right<=width,JSON.stringify({width,open,...f}));}
   await page.evaluate(()=>closeSheet());
  }
  if(width===390)await page.screenshot({path:path.join(__dirname,'v2-'+theme+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:390,height:1000});
 await page.evaluate(()=>{awakeSheet('a');});
 assert.equal(await page.locator('#awakeStartHour').inputValue(),'2');assert.equal(await page.locator('#awakeEndMinute').inputValue(),'30');
 await page.locator('#awakeEndMinute').selectOption('45');await page.locator('#modal button.save').click();
 const command=await page.evaluate(()=>window.__queue.shift());assert.equal(command.action,'awakePeriod');assert.equal(command.data.end,'14:45');assert.equal(command.data.base,'plan-r1');
 await page.evaluate(id=>receive({id,error:'Simulated stale plan'}),command.id);assert.match(await page.locator('#modalError').textContent(),/stale/);assert.equal(await page.locator('#awakeEndMinute').inputValue(),'45');await page.evaluate(()=>closeSheet());
 await page.evaluate(()=>{S.day.planning.pins[0].start=WW.wall(S.date,'17:00',S.settings.timezone);render();});
 assert.equal(await page.locator('#guidance').isVisible(),true);assert.match(await page.locator('#guidanceText').textContent(),/No schedule/);assert.equal(await page.locator('#timeline').textContent().then(t=>t.includes('Suggested nap')),false);
 await page.evaluate(()=>{S.day.planning.pins=[];S.day.naps[1].end=WW.wall(S.date,'13:20',S.settings.timezone);delete S.day.naps[1].expectedEnd;S.now=Date.parse(WW.wall(S.date,'13:30',S.settings.timezone));render();});
 assert.match(await page.locator('#currentState').textContent(),/Awake · 10m/);assert.deepEqual(errors,[]);
 await browser.close();console.log(JSON.stringify({renderChecks:results,timeSelectors:'all visible',staleEdit:'kept draft',conflict:'no invented nap',actualWake:'recalculated',pageErrors:errors},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
