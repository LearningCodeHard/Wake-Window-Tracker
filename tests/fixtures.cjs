const fs = require('node:fs');
const path = require('node:path').posix;
const vm = require('node:vm');

process.env.TZ = 'America/Indiana/Indianapolis';
const today = '2026-11-17';
const yesterday = '2026-11-16';
const instant = '2026-11-17T17:00:00.000Z';
const epoch = Date.parse(instant);
class AuditDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [epoch]));
  }
  static now() { return epoch; }
}
const root = '/documents/BudgetPlannerV1';
const plan = path.join(root, 'plan.json');
const previous = path.join(root, 'previous-plan.json');
const lock = path.join(root, 'writer-lock.json');
const releaseRoot = path.join(__dirname,'..');
const manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot,process.env.BUDGET_MANIFEST||'manifest.json'),'utf8'));
const source = fs.readFileSync(path.join(releaseRoot,manifest.path),'utf8');
const launcherSource = fs.readFileSync(path.join(releaseRoot,'Budget_Planner_Test_Launcher.txt'),'utf8');

function createFiles(initial) {
  const files = new Map();
  const folders = new Set();
  const fm = {
    files,
    joinPath: path.join,
    documentsDirectory: () => '/documents',
    libraryDirectory: () => '/library',
    temporaryDirectory: () => '/tmp',
    createDirectory: dir => folders.add(dir),
    listContents: dir => [...files.keys()].filter(file=>path.dirname(file)===dir).map(file=>path.basename(file)),
    fileExists: file => files.has(file) || folders.has(file),
    readString(file) {
      if (!files.has(file)) throw Error('Missing file ' + file);
      return files.get(file);
    },
    writeString: (file, content) => { files.set(file, content); },
    remove: file => files.delete(file),
    move(src, dest) {
      if (files.has(dest)) throw Error('File already exists');
      this.writeString(dest, this.readString(src));
      this.remove(src);
    }
  };
  if (initial) {
    fm.createDirectory(root);
    fm.writeString(plan, JSON.stringify(initial));
  }
  return fm;
}

function createApp(fm, globals = {}, appSource = source, expose = true) {
  let output;
  const sandbox = {
    Date: AuditDate,
    module: {exports: {}},
    config: {runsInApp: false},
    FileManager: {local: () => fm, iCloud: () => ({isFileStoredIniCloud: () => false})},
    Timer: {schedule:(ms,repeat,cb)=>setTimeout(cb,Math.min(ms,10))},
    Script: {setShortcutOutput: value => { output = value; }},
    console,
    ...globals
  };
  const suffix = expose ? '\nmodule.exports.audit = {Budget, BudgetAutomation, detectedBalances, DASHBOARD};' : '';
  vm.runInNewContext(appSource + suffix, sandbox, {filename: 'pinned-release.js'});
  return {
    ...sandbox.module.exports.audit,
    async run(input) {
      output = undefined;
      await sandbox.module.exports.run(input);
      return output;
    }
  };
}

function state(properties = {}) {
  return {
    schema: 1, revision: 0, sample: false,
    balance: {cents: 50000, date: yesterday},
    buffer: 0, rules: [], overrides: {}, ...properties
  };
}

function entry(properties = {}) {
  return {
    id: 'bill', name: 'Test bill', kind: 'bill', cents: 10000, frequency: 'once',
    start: today, estimated: false, ...properties
  };
}

function disk(fm, file = plan) {
  return JSON.parse(fm.readString(file));
}

function plain(x) { return JSON.parse(JSON.stringify(x)); }

module.exports = { today, yesterday, instant, epoch, root, plan, previous, lock, source,
  manifest, launcherSource, createApp, createFiles, state, entry, disk, plain };
