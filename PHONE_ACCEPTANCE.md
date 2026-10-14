# Phone acceptance before V2 production promotion

Do not promote V2 merely because automated checks pass. Confirm on both iPhones:

1. Test installs from GitHub and opens with **2.0.1 · TEST · Demo**.
2. Production installs in the existing script name, retains real records, and
   shows **1.1.3+launcher.1 · PRODUCTION**. Existing Huckleberry Shortcut still
   opens the review screen without saving an import before confirmation.
3. Close, use airplane mode, reopen both channels: cached dashboards open.
   Offline iCloud availability is a separate check from cached application code.
4. Test demo: noon wake → naps 2–3 PM and 5–6 PM → 8 PM bedtime. Add an awake
   period 3:15–4 PM, then pin the first nap at 2 PM for 60 minutes. Move the awake
   period to 2:45–3:15 PM and confirm a conflict. Release/reset; actuals remain.
5. Both themes: time selectors, sheet scrolling, keyboard-open Save/Cancel,
   no unreadable light text, no clipped controls.
6. With the separate test folder: save an appointment on phone A; refresh B.
   Save a pin on B; refresh A. Test stale edits, active nap, completed nap,
   completed Details OCR, replay protection, history and settings there.
7. Point the test bookmark temporarily at the production folder: Test must
   refuse to open the folder. Restore the correct test bookmark afterward.
8. Publish a second test candidate, verify the new version on both phones,
   then Revert on one phone. Close/reopen twice: it remains reverted instead of
   redownloading the rejected release. Check UPDATE_SETTINGS recovery too.

Record accepted version **and SHA-256**, phones tested, and any accepted
limitations. Then promote those exact candidate bytes to production. Both
phones receive the production pointer independently on their next launch.

Phone acceptance is pending. No live sleep records were inspected or changed
during this implementation.
