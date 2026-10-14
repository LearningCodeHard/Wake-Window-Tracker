# Release-system validation — October 13, 2026

193 automated checks pass:

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
