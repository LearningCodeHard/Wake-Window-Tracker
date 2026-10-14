# Phone acceptance and regression checklist

Do not promote V2 merely because automated checks pass. Confirm on both iPhones:

1. Test installs from GitHub and opens with **Graham’s Day Planner** in the header and **2.0.4 · TEST · Demo only** in the footer.
2. Production installs in the existing script name, retains real records, and
   shows **2.0.3 · PRODUCTION**. Existing Huckleberry Shortcut still
   opens the review screen without saving an import before confirmation.
3. Close, use airplane mode, reopen both channels: cached dashboards open.
   Offline iCloud availability is a separate check from cached application code.
4. Test demo: noon wake → naps 2–3 PM and 5–6 PM → 8 PM bedtime. Add an awake
   period 3:15–4 PM, then pin the first nap at 2 PM for 60 minutes. Move the awake
   period to 2:45–3:15 PM and confirm a conflict. Release/reset; actuals remain.
5. Both themes: native time fields, sheet scrolling, keyboard-open Save/Cancel,
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

The user authorized V2.0.3 production promotion on October 14. This checklist
remains available for regression checks; individual unreported outcomes are not
assumed complete. See RELEASE_ACCEPTANCE.md for the evidence and accepted hash.
No live sleep records were inspected or changed during this implementation.

For TEST 2.0.4, confirm the header clears Scriptable’s Close/Share toolbar, the
footer identifies TEST and appears below all buttons, and Morning Wake/Change
Bedtime open directly. Add must contain appointments/naps without Morning Wake.
Check Updates → Two-Phone Check, Updates → Update Controls, and Settings → Day
Adjustments (reset with saved adjustments; version selection with conflicts).
Launcher 1.0.2 is needed to refresh native update-menu capitalization.
