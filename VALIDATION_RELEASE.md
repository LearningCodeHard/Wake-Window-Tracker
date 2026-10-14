# Release-system validation — October 13, 2026

194 automated checks pass:

- 145 recovered scheduling, planning, adapter and UI regression checks.
- 21 updater checks: SHA-256 against Node crypto (including Unicode, padding
  boundaries and a 1 MB vector), first install, input forwarding, channel
  separation, cached/offline launch, tampered downloads, syntax errors,
  failed file/state writes, persistent revert/blocking, later releases,
  corrupt-cache recovery, pause, explicit test-folder mode, recovery menu,
  no automatic app rerun, manifest contracts and monotonic sequences.
- 8 anonymous-public-download checks: token-free first install, no token leakage,
  menu actions, offline cache, HTTP failures, corrupt downloads and encoded paths.
- 4 production-manifest diagnostics checks: actual V1 build metadata, anonymous
  installation of the actual production artifact, field-specific failures and
  malformed-document handling.
- 9 imported-module adapter checks: demo/default OCR isolation, same-folder
  and nested-folder refusal, path alias normalization, required production
  bookmark, sibling-folder-only writes, production OCR review and menu lifecycle.
- 6 Python release-tool checks: byte-identical promotion, unchanged test
  pointer, changed candidate refusal, corrupt artifact refusal, monotonic
  production/test sequences, matching JS/TXT channel launchers.

The application moved to the public Wake-Window-Tracker repository. App module
checksums and channel selections are unchanged; only launcher transport/config
and associated guides/tests changed.

Both initial channel modules match their SHA-256 and byte counts. The generated
launcher JS/TXT pairs are identical. The V1 baseline is kept separately from the
maintained V2 source. Test fixtures use a neutral child name.

Run:

```sh
python3 tools/release.py verify
node --test tests/core.test.js tests/planning.test.js tests/adapter.test.js tests/dashboard.test.js tests/updater.test.js
python3 tests/release_tools_test.py
```

The previous V2.0 Chromium checks remain historical evidence. No Chromium
executable is available in this session, so rendered checks were not rerun
for the added version/channel labels and Updates control. Existing rendering
tests are retained for an environment with Playwright and Chromium.

Actual Scriptable downloads, Keychain persistence, iOS WebKit, iCloud folder
bookmarks and two-phone delivery need the [phone checklist](PHONE_ACCEPTANCE.md).
No phone acceptance or production V2 promotion is claimed.

## PROD manifest report — October 14, 2026

The user reports that Wake_Window_PROD rejects the release manifest while
Wake_Window_TEST opens. Renaming scripts does not alter their embedded channel.
The current production manifest and actual artifact pass local validation and
anonymous installation checks. The phone failure has not been reproduced.
Launcher 1.0.1 replaces the generic validation error with the failing field and
received value, and includes its configured channel/repository in native errors.
Replace PROD launcher code to collect the exact failure if it persists.
No app artifacts or release pointers were changed by this diagnostic patch.

## Production version-label simplification — October 14

The user's launcher 1.0.1 report identifies the version field and transcribes
its received value as `1.1.3f g.1`, which contains a space. The live GitHub and
anonymous raw manifests both still show the valid `1.1.3+launcher.1` label, so
the reason for the discrepancy remains unconfirmed. Production now uses the
plain label `1.1.3` at sequence 2, avoiding the suffix. The exact app hash/path
and byte count are unchanged. Existing launchers receive this change on their
next launch; no launcher reinstall or sleep-data migration is needed. Phone
resolution still requires the user's result.

## TEST 2.0.2 — native time picker

At the user's request, every clock-time field now uses one native HTML time
input with minute precision: morning wake, nap start/end, expected wake, awake
appointment start/end, suggested-nap pin start, daily bedtime and default
bedtime. The split hour/minute/AM–PM selectors and synchronization code were
removed. Native values remain HH:mm; expected-wake recalculation, imported
exact minutes, midnight/noon handling, retained drafts and automatic record
dates pass regression checks. All 193 automated checks pass.

Time input sizing is scoped to the field host and WebKit time-value element,
with a single-column sheet and bounded widths. Browser-check selectors now
use the native inputs. No browser executable is available here; actual iOS
picker presentation/width still needs phone acceptance. The TEST channel
selects 2.0.2 at sequence 2. Production remains on 1.1.3 at sequence 2.

## TEST 2.0.3 — header clearance and quiet demo identity

The user approves the native time picker in 2.0.2. Their next phone screenshot
shows Scriptable's native Close/Share toolbar overlapping the HTML header and
Settings control. Removing the demo banner does not address that top inset.
This candidate reserves 64 px plus the top safe area above the page content,
keeps toolbar actions from shrinking, removes the demo banner, and renders
Wake Window TEST for the test channel. The footer retains version/channel,
demo-only/no-shared-writes status and demo clock; folder mode retains its test
identity. A regression covers identity across demo/folder/production states
and demo-clock advancement. All 194 checks pass (188 Node and 6 Python).

The exact native toolbar clearance still needs the reporting phone's check.
The TEST manifest is 2.0.3 at sequence 3. Production remains 1.1.3.

## TEST 2.0.4 — Graham’s Day Planner and direct navigation

The user chose Graham’s Day Planner and approved the navigation/layout changes.
The common header no longer includes TEST; the footer retains explicit channel
and demo/test-folder identity. All footer controls precede version/read/save
status, which is the final page content. Morning Wake and Change Bedtime replace
the former menu buttons. Add contains appointment and nap choices. Updates now
contains Two-Phone Check plus installed-launcher Update Controls. Settings keeps
Day Adjustments reachable, including conditional reset and conflicting revision
selection. Buttons/subbuttons use Title Case. Rest of Today is capitalized.

Native update-menu labels are bundled in launcher 1.0.2; already installed
launchers need one manual replacement for these labels. App navigation updates
automatically and stays compatible with launcher 1.0.1. No data schema, folder
boundary, scheduling, native time input, or Refresh behavior changed.

All 197 checks pass (191 Node and 6 Python); artifact checksums verify. New DOM
regressions exercise footer order, direct/add routing, Settings access, reset
visibility, channel identity, and update-menu bridge behavior. These checks do
not verify iOS rendering; phone acceptance remains pending. TEST is 2.0.4 at
sequence 4; PRODUCTION remains accepted 2.0.3 at sequence 3.
