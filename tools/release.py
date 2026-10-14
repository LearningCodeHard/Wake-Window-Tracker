"""Build immutable modules, publish candidates, and promote exact tested bytes."""
from pathlib import Path
import argparse, hashlib, json, re, subprocess
BASE=Path(__file__).resolve().parents[1]
CONFIG=json.loads((BASE/'release-config.json').read_text())
def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2)+'\n')
def module_body(text,version):
    # Standalone scripts catch and complete; imported modules return control to launcher.
    marker='try { await runWakeWindow(); } catch(e)'
    if marker not in text:raise ValueError('Missing expected standalone entry point')
    text=text[:text.index(marker)].replace('  Script.complete();\n','')
    return text+'\nmodule.exports = {run:runWakeWindow};\n'
def legacy_module():
    text=(BASE/'legacy/accepted-v1.1.3.js').read_text()
    text=text.replace('async function runWakeWindow() {','async function runWakeWindow(runtime={}) {')
    text=text.replace('const input=args.shortcutParameter;',"const input=Object.prototype.hasOwnProperty.call(runtime,'input')?runtime.input:args.shortcutParameter;")
    # Accepted V1 stays production-only; test candidates use the maintained V2 source.
    text=text.replace("  const BOOKMARK='WakeWindowShared';","  if(runtime.channel==='test')throw Error('The V1 baseline is production-only.');\n  const BOOKMARK='WakeWindowShared';")
    text=text.replace("snapshot={mode:demo?'demo':'live',", "snapshot={release:{version:runtime.version||'1.1.3+launcher.1',channel:runtime.channel||'manual'},mode:demo?'demo':'live',")
    text=text.replace("const action=cmd.action;", "const action=cmd.action;\n    if(action==='updates')return {message:await runtime.updates()};")
    match=re.search(r'const HTML_TEMPLATE = (.*);',text)
    html=json.loads(match[1])
    # Use a separate footer label to preserve the accepted V1 rendering logic.
    html=html.replace('<div id="saveState"', '<div id="releaseInfo" class="save-state"></div><button class="small-btn" onclick="request(\'updates\').then(r=>toast(r.message)).catch(e=>toast(e.message))">Updates</button><div id="saveState"')
    html=html.replace("function render(){", "function render(){\n  $('releaseInfo').textContent=S.release?S.release.version+' · '+S.release.channel.toUpperCase():'';")
    text=text[:match.start(1)]+json.dumps(html,ensure_ascii=False)+text[match.end(1):]
    return module_body(text,'1.1.3+launcher.1')
def package(text,version,channel,sequence):
    content=text.encode('utf-8');digest=hashlib.sha256(content).hexdigest()
    release=BASE/'releases'/f'{digest}.js';release.parent.mkdir(exist_ok=True)
    if release.exists() and release.read_bytes()!=content:raise ValueError('Immutable release collision')
    release.write_bytes(content)
    manifest=dict(schema=1,channel=channel,sequence=sequence,version=version,sha256=digest,path=f'releases/{digest}.js',bytes=len(content),minLauncher=1,dataSchema=1)
    return manifest
def launchers():
    engine=(BASE/'updater/engine.js').read_text();tail=(BASE/'updater/launcher-tail.js').read_text()
    for name,channel in [('Wake_Window','production'),('Wake_Window_Test','test')]:
        cfg={k:CONFIG[k] for k in ['repository','basePath']};cfg['downloadMode']=CONFIG.get('downloadMode','private');cfg['channel']=channel
        content='// Variables used by Scriptable.\n// icon-color: '+('green' if channel=='production' else 'orange')+'; icon-glyph: moon;\n// Wake Window launcher 1.0.1\nconst CONFIG='+json.dumps(cfg)+';\n'+engine+'\n'+tail
        for ext in ['js','txt']:
            (BASE/'launchers').mkdir(exist_ok=True);(BASE/'launchers'/f'{name}.{ext}').write_text(content)
def candidate(sequence):
    subprocess.run(['python3',str(BASE/'build.py')],check=True)
    m=package(module_body((BASE/'Wake_Window_V2.js').read_text(),CONFIG['version']),CONFIG['version'],'test',sequence)
    write_json(BASE/'channels/test.json',m);launchers();return m
def verify(m):
    if m.get('path')!=f"releases/{m['sha256']}.js":raise ValueError('Bad release path')
    data=(BASE/m['path']).read_bytes()
    if hashlib.sha256(data).hexdigest()!=m['sha256'] or len(data)!=m['bytes']:raise ValueError('Release checksum/length mismatch')
def promote(sequence,expected):
    m=json.loads((BASE/'channels/test.json').read_text());verify(m)
    if m['sha256']!=expected:raise ValueError('Candidate changed since acceptance. Promotion refused.')
    m={**m,'channel':'production','sequence':sequence}
    current=BASE/'channels/production.json'
    if current.exists() and sequence<=json.loads(current.read_text())['sequence']:raise ValueError('Sequence must increase')
    write_json(current,m);return m
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['bootstrap','candidate','promote','verify']);p.add_argument('--sequence',type=int);p.add_argument('--accepted-sha256');a=p.parse_args()
    if a.action=='bootstrap':
        if (BASE/'channels/production.json').exists():raise SystemExit('Already bootstrapped; use candidate or promote.')
        write_json(BASE/'channels/production.json',package(legacy_module(),'1.1.3','production',1));candidate(1)
    elif a.action=='candidate':
        if not a.sequence or a.sequence<1:raise SystemExit('Provide a positive --sequence.')
        current=BASE/'channels/test.json'
        if current.exists() and a.sequence<=json.loads(current.read_text())['sequence']:raise SystemExit('Sequence must increase.')
        print(json.dumps(candidate(a.sequence),indent=2))
    elif a.action=='promote':
        if not a.accepted_sha256 or not a.sequence:raise SystemExit('Provide --accepted-sha256 and --sequence.')
        print(json.dumps(promote(a.sequence,a.accepted_sha256),indent=2))
    else:
        for path in (BASE/'channels').glob('*.json'):verify(json.loads(path.read_text()))
        print('All channel artifacts match their recorded checksums.')
