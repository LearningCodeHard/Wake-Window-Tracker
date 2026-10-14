# V2.0.5 Production Acceptance — October 14, 2026

The user accepted the TEST candidate: “Looks great please prepare for the
migration up to production.”

- Accepted app version: **2.0.5**.
- Exact tested artifact SHA-256:
  `e1f6e481df25249f02ca047a51ec8431b0b3de6e3f197e85a2d0ac79e38f5fed`.
- App bytes: **109546**.
- Production sequence: **4**, previously sequence 3 / 2.0.3.
- Test remains sequence **5** / 2.0.5, selecting the same immutable artifact.

Promotion only changes the production pointer/channel metadata; no app rebuild,
sleep-data migration, shared-folder change, or test-data copy occurs. PROD uses
WakeWindowShared and TEST retains its isolated mode/bookmark. Graham’s Day
Planner is the common header; footer channel identity remains explicit.

The user accepted the flat menus and inline Settings controls on TEST. All 205
automated checks pass. Neither both phones’ full regression coverage nor the
production rollout is inferred from that report.

The app updates automatically on launch. Replace installed PROD launcher code
once with launcher **1.0.3** to enable direct Updates controls, retaining the
**Wake_Window_PROD** name and **WakeWindowShared** bookmark. The Huckleberry
Shortcut continues targeting that script. On both phones confirm **2.0.5 ·
PRODUCTION**, existing records/settings, and the usual import review. Revert
Update selects the phone’s verified previous cached release on reopening; it
does not undo sleep records. Briefly cached raw manifests may require retrying.

---

# V2.0.3 production acceptance — October 14, 2026

The user explicitly authorized promotion: “Okay I think I’m ready to promote
this version to prod.”

- Accepted app version: **2.0.3**.
- Exact tested artifact SHA-256:
  `e4f9f4b63c00ec53d8acf7442df75f1aad3adbcea99a352c8ececcb7e44e798d`.
- App bytes: **108753**.
- Production sequence: **3** (previously sequence 2 / V1.1.3).
- Test remains sequence **3** / V2.0.3, selecting the same app file.

Promotion changes the production manifest's pointer and channel metadata. It
does not rebuild or edit the app artifact. Channel-specific behavior still
comes from each installed launcher: PROD uses WakeWindowShared, while TEST
defaults to demo and displays Wake Window TEST. Both retain the footer's channel.

Evidence: the user reported successful PROD launch and approved the restored
native time picker. They subsequently authorized the current V2.0.3 release
for production. Automated checks pass; their authorization is not a claim that
every checklist step or both phones' complete regression coverage was reported.

Both phones receive production independently on their next launch. Confirm
**2.0.3 · PRODUCTION** in each footer. GitHub may briefly serve an earlier cached
manifest. Existing launchers need no replacement. Code rollback remains
available on a phone that retained its previous cached version; rollback does
not undo sleep records, and V1 ignores V2 appointments/pins.
