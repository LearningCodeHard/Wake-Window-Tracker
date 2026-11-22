const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Worker,isMainThread,parentPort,workerData,threadId} = require('node:worker_threads');
const {createApp,state} = require('./fixtures.cjs');

if (isMainThread) {
  test('simultaneous independent processes serialize writes and reject the stale revision',async t=>{
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'budget-concurrency-'));
    t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
    const root=path.join(folder,'BudgetPlannerV1'),plan=path.join(root,'plan.json');
    fs.mkdirSync(root);
    fs.writeFileSync(plan,JSON.stringify(state()));
    const barrier=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const run=input=>new Promise((resolve,reject)=>{
      const worker=new Worker(__filename,{workerData:{folder,barrier,input}});
      worker.once('message',resolve);
      worker.once('error',reject);
      worker.once('exit',code=>{if(code)reject(Error('Worker exited '+code));});
    });
    const result=await Promise.all([
      run({action:'ADD_ENTRY',requestId:'new-entry',expectedRevision:0,
        entry:{kind:'bill',name:'Synthetic bill',amount:'50.00',start:'2026-12-01'}}),
      run({action:'CHECKING',amount:'$715.00',format:'json'})
    ]);
    assert.equal(result.filter(r=>r.output?.ok).length,1);
    assert.match(result.find(r=>r.error).error,/plan changed in another session/);
    const saved=JSON.parse(fs.readFileSync(plan,'utf8'));
    assert.equal(saved.revision,1);
    assert.equal(saved.rules.length,result[0].output?1:0);
    assert.equal(saved.balance.cents,result[1].output?71500:50000);
    assert.deepEqual(fs.readdirSync(root).sort(),['plan.json','previous-plan.json']);
  });
} else {
  const {folder,barrier,input}=workerData;
  const plan=path.join(folder,'BudgetPlannerV1','plan.json');
  const sync=new Int32Array(barrier);
  let firstRead=true;
  const fm={
    joinPath:path.join,
    documentsDirectory:()=>folder,
    fileExists:fs.existsSync,
    listContents:fs.readdirSync,
    readString(file){
      const contents=fs.readFileSync(file,'utf8');
      if(file===plan&&firstRead){
        firstRead=false;
        if(Atomics.add(sync,0,1)===0){
          if(Atomics.wait(sync,0,1,5000)==='timed-out')throw Error('barrier timed out');
        }else Atomics.notify(sync,0);
      }
      return contents;
    },
    writeString(file,content){
      const temp=file+'.thread-'+threadId;
      fs.writeFileSync(temp,content);
      fs.renameSync(temp,file);
    },
    remove:fs.unlinkSync
  };
  createApp(fm).run(input).then(output=>parentPort.postMessage({output}),
    error=>parentPort.postMessage({error:error.message}));
}
