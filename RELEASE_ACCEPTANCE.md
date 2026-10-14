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
