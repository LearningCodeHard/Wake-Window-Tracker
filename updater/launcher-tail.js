const updater=createUpdater(CONFIG,{
  fm:FileManager.local(),keychain:Keychain,request:url=>new Request(url),
  decode:s=>{const data=Data.fromBase64String(s);if(!data)throw Error('Invalid download encoding.');return data.toRawString();},
  bytes:s=>Data.fromString(s).getBytes(),loadModule:path=>importModule(path),alert:()=>new Alert(),uuid:()=>UUID.string()
});
try{await updater.run(args.shortcutParameter);}catch(e){const a=new Alert();a.title='Wake Window · '+CONFIG.channel;a.message=e.message+'\n\nLauncher 1.0.1 · '+CONFIG.channel+'\nRepository: '+CONFIG.repository;a.addAction('OK');await a.presentAlert();}
Script.complete();
