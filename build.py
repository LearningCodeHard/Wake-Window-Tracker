"""Build the one-file Scriptable install from readable sources."""
from pathlib import Path
import json,re
BASE=Path(__file__).parent
root=BASE.parent
core=(BASE/'src/core.js').read_text()+'\n'+(BASE/'src/planning.js').read_text()
prototype=(BASE/'src/prototype.html').read_text()
css=(BASE/'src/style.css').read_text()
html=(BASE/'src/dashboard.html').read_text().replace('__PROTOTYPE_CSS__',css).replace('__CORE__',core).replace('__UI__',(BASE/'src/ui.js').read_text()+'\n'+(BASE/'src/render.js').read_text())
adapter=(BASE/'src/adapter.js').read_text()
version=json.loads((BASE/'release-config.json').read_text())['version']
bundle='// Variables used by Scriptable.\n// icon-color: green; icon-glyph: moon;\n// Wake Window '+version+' — two-channel release support\nconst APP_VERSION = '+json.dumps(version)+';\n'+core+'\nconst HTML_TEMPLATE = '+json.dumps(html,ensure_ascii=False)+';\n'+adapter
(BASE/'Wake_Window_V2.js').write_text(bundle)
(BASE/'Wake_Window_V2_Scriptable.txt').write_text(bundle)
fixture={
 'mode':'demo','now':1791216000000,'date':'2026-10-05',
 'settings':{'timezone':'America/Indiana/Indianapolis','bedtime':'20:00','nap':{'min':60,'ideal':75,'max':90},'first':{'min':60,'ideal':75,'max':90},'second':{'min':120,'ideal':135,'max':150},'later':{'min':120,'ideal':135,'max':150},'final':{'min':120,'ideal':150,'max':180}},
 'day':{'date':'2026-10-05','morning':None,'bedtime':None,'naps':[{'start':'2026-10-05T15:00:00.000Z','end':'2026-10-05T16:00:00.000Z','entity':'nap:2026-10-05:sample','revision':'demo'}]},
 'revisions':{'settings':None,'morning':None,'bedtime':None},'conflicts':[],'checkedAt':1791216000000,'warnings':[],'probes':[],'imported':None}
(BASE/'tests/preview.html').write_text(html.replace('__STATE__',json.dumps(fixture)))
print('Built Wake_Window_V2.js, copy-friendly text and local test preview.')
