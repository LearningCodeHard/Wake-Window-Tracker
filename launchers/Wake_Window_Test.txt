// Variables used by Scriptable.
// icon-color: orange; icon-glyph: moon;
// Wake Window launcher 1
const CONFIG={"repository": "LearningCodeHard/Wake-Window-Tracker", "basePath": "", "downloadMode": "public", "channel": "test"};
/* Embedded into both installed launchers. No remote dependencies. */
function sha256(bytes) {
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],b=Array.from(bytes),bits=b.length*8;
  b.push(128);while(b.length%64!==56)b.push(0);
  const high=Math.floor(bits/4294967296),low=bits>>>0;
  for(const n of [high,low])for(let shift=24;shift>=0;shift-=8)b.push((n>>>shift)&255);
  const rr=(n,s)=>(n>>>s)|(n<<(32-s)),w=new Array(64);
  for(let off=0;off<b.length;off+=64){
    for(let i=0;i<16;i++)w[i]=(b[off+4*i]<<24)|(b[off+4*i+1]<<16)|(b[off+4*i+2]<<8)|b[off+4*i+3];
    for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];w[i]=(w[i-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[i-7]+(rr(c,17)^rr(c,19)^(c>>>10)))|0;}
    let [a,c,d,e,f,g,j,l]=h;
    for(let i=0;i<64;i++){const t1=(l+(rr(f,6)^rr(f,11)^rr(f,25))+((f&g)^(~f&j))+k[i]+w[i])|0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&c)^(a&d)^(c&d)))|0;l=j;j=g;g=f;f=(e+t1)|0;e=d;d=c;c=a;a=(t1+t2)|0;}
    [a,c,d,e,f,g,j,l].forEach((n,i)=>h[i]=(h[i]+n)|0);
  }
  return h.map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
}
function createUpdater(config,env) {
  const {fm,keychain,request,decode,bytes,loadModule,alert,uuid}=env;
  const identity=config.repository+'/'+config.basePath,channel=config.channel;
  const publicDownloads=config.downloadMode==='public';
  if(!['production','test'].includes(channel))throw Error('Invalid release channel.');
  const key='wake-window:'+identity+':'+channel,stateKey=key+':state',tokenKey='wake-window:'+config.repository+':github-token';
  const cache=fm.joinPath(fm.libraryDirectory(),'WakeWindowReleases/'+encodeURIComponent(identity)+'/'+channel);
  if(!fm.fileExists(cache))fm.createDirectory(cache,true);
  const initial=()=>({schema:1,active:null,previous:null,blocked:[],sequence:0,paused:false,testMode:'demo'});
  let state=initial(),status='';
  if(keychain.contains(stateKey)){
    state=JSON.parse(keychain.get(stateKey));
    if(state.schema!==1||!Array.isArray(state.blocked)||!Number.isSafeInteger(state.sequence)||!['demo','folder'].includes(state.testMode))throw Error('Update settings are unreadable. Keep the cached files and reinstall the launcher or restore its settings.');
  }
  function save(next){keychain.set(stateKey,JSON.stringify(next));state=next;}
  const file=r=>fm.joinPath(cache,r.sha256+'.js');
  function valid(r){try{return !!r&&fm.fileExists(file(r))&&sha256(bytes(fm.readString(file(r))))===r.sha256;}catch(_){return false;}}
  function validate(m){
    if(!m||m.schema!==1||m.channel!==channel||m.dataSchema!==1||m.minLauncher!==1||!Number.isSafeInteger(m.sequence)||m.sequence<1||typeof m.version!=='string'||!/^[0-9A-Za-z.+-]{1,50}$/.test(m.version)||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>500000||!/^[a-f0-9]{64}$/.test(m.sha256)||m.path!=='releases/'+m.sha256+'.js')throw Error('Release manifest is incompatible or invalid.');
    return m;
  }
  async function githubFile(path,timeout){
    if(publicDownloads){
      const filePath=[config.basePath,path].filter(Boolean).join('/').split('/').map(encodeURIComponent).join('/');
      const r=request('https://raw.githubusercontent.com/'+config.repository+'/main/'+filePath+'?check='+Date.now());
      r.timeoutInterval=timeout;r.headers={'Cache-Control':'no-cache'};
      const text=await r.loadString();
      if(!r.response||r.response.statusCode!==200)throw Error('Public download returned '+(r.response?r.response.statusCode:'no status')+'. Check the repository or connection.');
      if(typeof text!=='string'||bytes(text).length>500000)throw Error('Public file response is invalid or too large.');
      return text;
    }
    const token=keychain.contains(tokenKey)?keychain.get(tokenKey):'';
    if(!token)throw Error('GitHub read-only token is not configured.');
    const url='https://api.github.com/repos/'+config.repository+'/contents/'+(config.basePath+'/'+path).split('/').map(encodeURIComponent).join('/')+'?ref=main';
    const r=request(url);r.timeoutInterval=timeout;r.headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Cache-Control':'no-cache'};
    const result=await r.loadJSON();
    if(!r.response||r.response.statusCode!==200)throw Error('GitHub returned '+(r.response?r.response.statusCode:'no status')+'. Check the token, repository access, or connection.');
    if(!result||result.encoding!=='base64'||typeof result.content!=='string'||result.size>500000)throw Error('GitHub file response is invalid.');
    return decode(result.content.replace(/\s/g,''));
  }
  async function setToken(){
    const a=alert();a.title='GitHub read-only access';a.message='Paste a fine-grained token with Contents: Read-only for '+config.repository+'. It stays in Scriptable Keychain. Configure this on each phone.';a.addSecureTextField('GitHub token','');a.addAction('Save token');a.addCancelAction('Cancel');
    if(await a.presentAlert()!==0)return false;
    const token=a.textFieldValue(0).trim();if(!token)throw Error('Enter a token.');keychain.set(tokenKey,token);return true;
  }
  async function update(){
    if(state.paused){status='Automatic updates paused';return;}
    try{
      const m=validate(JSON.parse(await githubFile('channels/'+channel+'.json',3)));
      if(m.sequence<state.sequence)throw Error('An older channel manifest was ignored.');
      if(state.active&&m.sequence===state.sequence&&m.sha256!==state.active.sha256&&!state.blocked.includes(m.sha256))throw Error('A channel sequence was reused for different code.');
      if(state.blocked.includes(m.sha256)){status='Reverted release blocked';return;}
      if(state.active&&state.active.sha256===m.sha256&&valid(state.active)){if(m.sequence>state.sequence)save({...state,active:m,sequence:m.sequence});status='Up to date';return;}
      const text=await githubFile(m.path,10);
      if(bytes(text).length!==m.bytes||sha256(bytes(text))!==m.sha256)throw Error('Release checksum did not match. Cached version retained.');
      // A syntax check parses code without executing it or touching sleep files.
      new Function('module','exports',text);
      const tmp=fm.joinPath(cache,uuid()+'.download');fm.writeString(tmp,text);
      if(sha256(bytes(fm.readString(tmp)))!==m.sha256){fm.remove(tmp);throw Error('Downloaded file could not be verified.');}
      const dest=file(m);if(fm.fileExists(dest))fm.remove(dest);fm.move(tmp,dest);
      save({...state,active:m,previous:valid(state.active)?state.active:state.previous,sequence:m.sequence});
      status='Updated to '+m.version;
    }catch(e){status='Cached version · '+e.message;if(!valid(state.active)&&!valid(state.previous))throw e;}
  }
  async function menu(){
    const a=alert();a.title='Wake Window updates';a.message=channel.toUpperCase()+' · '+(state.active?state.active.version:'Not installed')+'\n'+status+'\nChanges take effect on the next launch.';
    const actions=[{id:'revert',label:'Revert update'},{id:'pause',label:state.paused?'Resume automatic updates':'Pause automatic updates'}];
    if(!publicDownloads)actions.push({id:'token',label:'Change GitHub token'});
    if(channel==='test')actions.push({id:'testMode',label:state.testMode==='demo'?'Use separate test folder':'Use demo data'});
    for(const x of actions)a.addAction(x.label);a.addCancelAction('Close');const pick=await a.presentSheet(),choice=actions[pick];
    if(!choice)return 'Update settings closed.';
    if(choice.id==='revert'){
      if(!valid(state.previous))throw Error('No verified previous release is available on this phone.');
      save({...state,active:state.previous,previous:state.active,blocked:[...new Set([...state.blocked,state.active.sha256])]});
      return 'Previous version selected. Close and reopen the dashboard.';
    }
    if(choice.id==='pause'){save({...state,paused:!state.paused});return 'Update preference saved. Applies on the next launch.';}
    if(choice.id==='token'){await setToken();return 'Token setup closed. Applies on the next launch.';}
    if(choice.id==='testMode'){save({...state,testMode:state.testMode==='demo'?'folder':'demo'});return 'Test data mode saved. Close and reopen the dashboard.';}
    return 'Update settings closed.';
  }
  async function run(input){
    if(input==='UPDATE_SETTINGS'){await menu();return;}
    if(!publicDownloads&&!keychain.contains(tokenKey)&&!valid(state.active)&&!valid(state.previous))await setToken();
    await update();
    let active=state.active;
    if(!valid(active)){
      if(!valid(state.previous))throw Error('No verified release is cached. Connect to GitHub and run again.');
      const bad=active;active=state.previous;
      save({...state,active,previous:bad,blocked:bad?[...new Set([...state.blocked,bad.sha256])]:state.blocked});status='Recovered previous cached release';
    }
    const runtime={channel,version:active.version,sha256:active.sha256,status,bookmark:channel==='production'?'WakeWindowShared':'WakeWindowTestShared',mode:channel==='test'?state.testMode:'live',input,updates:menu};
    const app=loadModule(file(active));
    if(!app||typeof app.run!=='function')throw Error('The release has no supported entry point. Use UPDATE_SETTINGS to revert.');
    // Never automatically rerun another app after an error: a save may already have happened.
    try{await app.run(runtime);}catch(e){throw Error(e.message+'\nClose and reopen, or use UPDATE_SETTINGS to revert.');}
  }
  return {run,menu,update,getState:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>status,validate};
}
if(typeof module!=='undefined')module.exports={createUpdater,sha256};

const updater=createUpdater(CONFIG,{
  fm:FileManager.local(),keychain:Keychain,request:url=>new Request(url),
  decode:s=>{const data=Data.fromBase64String(s);if(!data)throw Error('Invalid download encoding.');return data.toRawString();},
  bytes:s=>Data.fromString(s).getBytes(),loadModule:path=>importModule(path),alert:()=>new Alert(),uuid:()=>UUID.string()
});
try{await updater.run(args.shortcutParameter);}catch(e){const a=new Alert();a.title='Wake Window · '+CONFIG.channel;a.message=e.message;a.addAction('OK');await a.presentAlert();}
Script.complete();
