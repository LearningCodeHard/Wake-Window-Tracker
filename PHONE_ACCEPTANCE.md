# Phone acceptance and regression checklist

Do not promote V2 merely because automated checks pass. Confirm on both iPhones:

1. Test installs from GitHub and opens with **Graham’s Day Planner** in the header and **2.0.5 · TEST · Demo only** in the footer.
2. Production installs in the existing script name, retains real records, and
   shows **2.0.5 · PRODUCTION**. Existing Huckleberry Shortcut still
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

For TEST 2.0.5, confirm the header clears Scriptable’s Close/Share toolbar and
the channel/status footer appears below every button. Morning Wake/Change
Bedtime must open directly. Add must offer Keep Awake - Appointment, Start Nap,
and Log Completed Nap, without another choice menu; Start Nap is disabled when
already asleep. Settings must display appointment/pin controls inline, with reset
only when saved adjustments exist and version choices when plans conflict.
Review Adjustments remains a shortcut from the warning. Install launcher 1.0.3
and check direct Updates actions: pause/resume, test-mode switching and revert.
No new app/data mode takes effect until reopening. Two-Phone Check opens its form
from Updates; deleting/resetting still requires confirmation.

The user accepted TEST 2.0.5 on October 14 and requested production migration.
The exact artifact is promoted at production sequence 4. Install production
launcher 1.0.3 once for direct Updates controls, retaining Wake_Window_PROD and
WakeWindowShared. Then verify version/channel, existing actuals/settings and
Huckleberry import review on each phone. These rollout results remain unreported.

## TEST 2.1.0 schedule approval

1. Close the TEST dashboard and run **Wake_Window_TEST** again. Check **2.1.0 · TEST** in the footer.
2. In demo mode, approve the initial schedule and tap **Refresh**. Confirm the same times. Advance the demo clock twice and confirm the next nap shows **Overdue** with its original time.
3. Tap **Recalculate**, compare the bedtime and tradeoffs, then tap **Keep Current**. Verify that the approved schedule is still shown. Change the bedtime target or add a keep-awake period and check that **Adjustment Needed** explains the change.
4. In both themes, verify that Tradeoffs starts in the same column across the alternatives and that each nap shows its preceding wake window. Confirm the nap target, maximum and all three duration ranges are editable in Settings.
5. On both phones, use **Updates → Use Separate Test Folder**, then reopen TEST. In the shared test folder, enter synthetic sleep records and approve a schedule on phone A. Refresh phone B and reopen TEST on both phones to confirm the same approval. Log a nap 11 minutes off the approved time on one phone and refresh the other. Verify the proposed change appears while the original schedule stays saved until a parent approves a replacement.

## TEST 2.1.1 layout

1. Close and rerun **Wake_Window_TEST**. Confirm **2.1.1 · TEST** in the footer and that the header clears Scriptable’s toolbar.
2. In both themes, verify that the day summary and timeline fit the screen. Recorded and planned naps should have distinct labels. With a morning wake recorded, Nap 1 should show the elapsed or planned wake window, and bedtime should show the final wake window.
3. Approve a demo plan and tap **Recalculate**. Check that **Tradeoffs** stays in the same column for every option. Select a plan with a different bedtime and check the change preview, then tap **Keep Current**.
4. Change the bedtime target and open the proposed revision from **Adjustment Needed**. Check the reason, recommended adjustment, and approved versus selected bedtime. Cancel the review to keep the approved schedule.
5. In **Planner Settings**, check the nap counts, nap profiles, wake windows, and schedule rules. Scroll the sheet and confirm **Save Settings** remains visible.
