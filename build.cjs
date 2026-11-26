const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const version = process.argv[2];
const sequence = Number(process.argv[3]);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !Number.isSafeInteger(sequence) || sequence < 1) {
  throw Error('Usage: node build.cjs VERSION SEQUENCE');
}
const read = file => fs.readFileSync(path.join(__dirname, 'src', file), 'utf8');
const engine = read('engine.js');
const launcher = read('launcher.js');
const shaStart = launcher.indexOf('function sha256(');
const shaEnd = launcher.indexOf('function createBudgetUpdater(', shaStart);
if (shaStart < 0 || shaEnd < 0) throw Error('Missing shared SHA-256 helper');
const digest = launcher.slice(shaStart, shaEnd);
const dashboard = read('dashboard.html')
  .replace('/*SHARED_ENGINE*/', () => engine.trimEnd())
  .replaceAll('/*APP_VERSION*/', version);
const app = [
  '// Variables used by Scriptable.\n// icon-color: brown; icon-glyph: chart-line;',
  '// Budget Planner ' + version + ' · GitHub release module.',
  digest, engine, read('automation.js'), 'const DASHBOARD=' + JSON.stringify(dashboard) + ';', read('runtime.js')
].join('\n');
const sha256 = crypto.createHash('sha256').update(app).digest('hex');
const releasePath = 'releases/' + sha256 + '.js';
const manifest = {
  schema: 1, app: 'budget-planner', dataSchema: 1, minLauncher: 1, version,
  sequence, bytes: Buffer.byteLength(app), sha256, path: releasePath
};
fs.mkdirSync(path.join(__dirname, 'releases'), {recursive: true});
fs.writeFileSync(path.join(__dirname, releasePath), app);
fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
