# Graham’s Day Planner — Scriptable Source and Releases

Two installed launchers update the app from independent channel manifests.
The application lives in the public [Wake-Window-Tracker repository](https://github.com/LearningCodeHard/Wake-Window-Tracker).
Launchers download public manifests and verified modules without GitHub tokens.
Project knowledge notes remain in a separate private repository; live sleep
records remain in the shared iCloud folder. Only app code, guides and neutral
regression fixtures are published here.

| Installed script | Initial app | Channel | Data |
|---|---|---|---|
| Wake_Window_PROD (or existing production name) | 2.0.5 | production | Existing WakeWindowShared bookmark |
| Wake_Window_TEST | 2.0.5 | test | Demo by default; optional WakeWindowTestShared |

V1 functionality was accepted in the previous project chat. The new launcher
integration was tested by the user, who authorized V2.0.5 production promotion
on October 14. [Release acceptance](RELEASE_ACCEPTANCE.md) records the exact hash. The baseline is an archived snapshot; ongoing development
uses one maintained V2 codebase, and promotion copies its exact artifact without
rebuilding. No family records or credentials belong in GitHub.

## Install

Follow [INSTALL.md](INSTALL.md). Launchers are in [launchers](launchers/).
Use the TXT files when copy/pasting on an iPhone. Preserve the current production
Scriptable name so the Huckleberry Shortcut continues to target it.

## Develop and release

Readable application sources are in `src/`; launcher code is in `updater/`.
The channel manifests select modules in `releases/`, whose names are SHA-256 hashes.
Never edit an existing release artifact. Old artifacts remain recoverable in Git.

```sh
python3 build.py
node --test tests/core.test.js tests/planning.test.js tests/adapter.test.js tests/dashboard.test.js tests/updater.test.js
python3 tests/release_tools_test.py
python3 tools/release.py candidate --sequence 6
python3 tools/release.py verify
```

Increment `release-config.json`'s app version before a changed candidate. Commit
the sources, generated bundle, release artifact and test manifest together.
Each channel sequence must strictly increase whenever its pointer changes.

After the user accepts the candidate on both phones, record the **exact SHA-256**
shown by `channels/test.json`. Promote that artifact:

```sh
python3 tools/release.py promote --sequence 5 --accepted-sha256 EXACT_TESTED_SHA256
python3 tools/release.py verify
```

Commit only the production pointer and acceptance record if no other files changed.
Promotion refuses a candidate that changed after acceptance. This is a controlled
repository commit, not an automatic response to merging app code. The release
system uses committed files; it does not require GitHub Actions, Pages, or GitHub
Release objects. Writing a candidate does not change production.

## Recovery and boundaries

- Updates are checked before launching; an open dashboard keeps its loaded code.
- Manifest request timeout: 3 seconds; release request timeout: 10 seconds. An
  update can therefore take roughly 13 seconds plus parsing/file work. These are
  request timeouts, not a hard deadline for iOS scheduling.
- SHA-256 validates downloaded bytes and cached code. It detects corruption; it
  is not an independent signature against someone with repository write access.
- App code is cached with `FileManager.local().libraryDirectory()`. Per-channel selection/preferences live in Scriptable Keychain. Both phones
  check/cache independently; verify the channel/version footer on each phone.
- Revert selects the verified previous artifact and blocks the rejected hash on
  that phone. A new hash can update normally; an intentional retry of a blocked
  hash requires a new release, rather than silently undoing the parent's choice.
- App exceptions do not automatically rerun an older version: an uncertain save
  may already have happened. Inspect saved records before repeating an action.
- Code rollback does not undo sleep records. V1 ignores V2 planning constraints;
  if reverting after V2 use, V1 forecasts cannot honor appointments/pins.
- Keep data schema 1. A future breaking schema change needs a migration/recovery
  plan before production promotion. Cached modules are not sandboxed; only publish
  trusted code and keep the production/test adapter separation enforced.
- Launcher code is installed manually once. App releases update automatically;
  a future change to the launcher itself may require replacing the launcher code.

See [PHONE_ACCEPTANCE.md](PHONE_ACCEPTANCE.md) and [VALIDATION_RELEASE.md](VALIDATION_RELEASE.md).

## API references

[Scriptable Request](https://docs.scriptable.app/request/),
[Data](https://docs.scriptable.app/data/),
[FileManager](https://docs.scriptable.app/filemanager/),
[importModule](https://docs.scriptable.app/importmodule/),
[Keychain](https://docs.scriptable.app/keychain/).

## 2.0.5 Navigation

Graham’s Day Planner is the common header. Version, channel, read/save status
and demo identity are the final content below the buttons. Morning Wake and
Change Bedtime open directly. Add opens appointment, Start Nap and Log Completed
Nap forms directly, without a second choice menu. Updates lists updater actions
alongside Two-Phone Check. Settings displays existing appointments, nap pins,
reset and conflicting saved versions inline. The warning’s Review Adjustments
shortcut opens the same management controls. Confirmation screens still protect
deletions/reset; they are not navigation menus.

Both channels select the accepted 2.0.5 artifact; production sequence is 4 and
test sequence is 5.
App changes arrive automatically; flat updater actions require the new direct
bridge in launcher 1.0.3, so replace the installed launcher once. Older launchers
still run the candidate and can use UPDATE_SETTINGS for native recovery controls.
