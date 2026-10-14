# Wake Window V2.0 — install and test

V2 adds the approved Quiet timeline design (Deeper Stone light, Stone & Sage dark), shared appointment awake periods, suggested-nap pins, conflict guidance, return-to-automatic planning and explicit local read/save status. All original actual-nap and Huckleberry imports remain.

## Upgrade both phones

1. Keep your working V1.1.3 code as a rollback copy. This V2 package does not replace that download.
2. Open **Wake_Window_V2_Scriptable.txt** or **Wake_Window_V2.js** and copy the complete contents.
3. Replace all code inside your EXISTING Scriptable script on each phone. Keep that script's existing name so your Shortcuts still select it. Do not install only source fragments.
4. Keep the **WakeWindowShared** bookmark, folder, records and Shortcut unchanged. No data migration or new cloud service is needed. Update both phones before using V2 planning: V1 does not display or honor the new constraints.
5. Run from the script list. Confirm **V2.0** in the footer and your existing data/settings/history remain. Switch light/dark with the header appearance button.

The working Shortcut remains **Open Huckleberry → Get on-screen Text → Combine Text (New Lines) → Scriptable Run Script**, Parameter = the Combined Text VARIABLE, **Run in App ON**. It handles running Start Time, completed Start/End, and completed sleep Details with an explicit date and AM/PM range. Every import is reviewed. V1.1.3's new Details capture and V2's iPhone UI still need your device acceptance.

## Test first in Demo

Use your existing demo Shortcut with a **Text** action containing `DEMO` passed into the same Scriptable script, Run in App ON. Demo writes stay in that session; no family records change. The original sample has a completed 11 AM–noon nap and 8 PM target.

1. Confirm suggested naps at **2–3 PM** and **5–6 PM**, bedtime **8 PM**, with earlier actual sleep collapsed below. Bedtime is displayed once in the timeline.
2. Tap **+ Add → Keep awake**. Enter a label, **3:15 PM** start and **4 PM** end. Save. The appointment appears inline; suggested naps avoid it and the target still fits.
3. Tap the first suggested nap. Leave **Pin start time** checked at **2 PM**. Check **Pin duration**, enter **60** minutes, and save. The row says **Pinned**. This is a plan, not an actual nap record.
4. Edit the appointment to **2:45–3:15 PM**. The pin now conflicts; projections pause with an explanation rather than inventing a different pinned start or actual wake. Use **Day adjustments** to edit/remove the appointment or release the pin.
5. Tap **Day adjustments → Return to automatic**. Confirm clearing. Awake periods and nap pins are removed together; actual sleep, morning wake, chosen bedtime and shared defaults stay saved.
6. Check all sheets: Hour/Minute/AM-PM controls fit; Save/Cancel remain reachable by scrolling; light headings and status text are dark and readable.

Do not use invented naps in the family's live folder. A separate shared test folder is another option for cross-phone fabricated tests. Demo is not a real iCloud sharing test.

## Normal daily use

**Keep awake:** + Add → Keep awake. Enter start/end and optional label. Include travel in that interval when needed. The interval is on the selected dashboard day and can be edited/removed from its row or Day adjustments. Overlapping appointments are allowed; all are respected. An appointment is not an actual wake event.

**Adjust a suggested nap:** tap its time. Pin its start, duration, or both. Unpinned values remain automatic and may move to fit bedtime. Durations must stay within configured nap bounds. Each saved pin is shared, and can be released individually.

**When no plan fits:** the dashboard pauses if constraints are mutually impossible. If another legal bedtime is possible, it shows the nearest result with explicit early/late guidance. Review appointments, pins, limits or chosen bedtime. It does not silently adjust your settings. If an actual wake window already exceeded its maximum, that elapsed time is acknowledged and the next transition may be planned for now; it does not extend the overdue window further merely to accommodate an appointment.

**Actual sleep wins:** import or manually record real times as before. Starting the real next nap retires that suggestion's pin, even when timing differs. An active nap uses its chosen expected wake; that estimate remains editable. If it overlaps an appointment, adjust the estimate or appointment rather than inventing an actual wake. Recorded past overlap is noted and the actual record stays intact.

**Missed pinned start:** if its clock time passes without an actual nap, log the sleep, move the pin or release it. It will not automatically assume the baby slept. Duration-only pins remain usable after time advances.

**Earlier history corrections:** inserting/removing earlier naps can change nap numbering. The planner checks the actual-record identities saved with each pin. Release affected old pins and re-pin current suggestions when the dashboard asks; it does not quietly apply an old pin to a different nap. Fulfilled pins are omitted from Day adjustments, except pins needing history review.

**Return to automatic:** removes this selected day's appointments AND pins after confirmation. It preserves actual sleep, morning wake, day-specific bedtime and shared settings. To keep appointments, release only the individual nap pins instead.

**Read/save status:** the footer shows the last successful shared-file read on THIS phone. A local save is confirmed only after its event file is read back. If the following refresh fails, the app says the save was locally confirmed and asks you to refresh before repeating it. It does not claim the second phone received the write. Refresh/open on the other phone to read delivered iCloud files. Last-local-save time is per running session, not a complete audit log.

## First real two-phone test

1. Add a real upcoming appointment on Phone A. Refresh Phone B and check its label/times.
2. Pin one suggestion on Phone B. Refresh Phone A and check the pin and remaining schedule.
3. Open the same appointment sheet on both. Save on A, then refresh B's underlying day before trying B's old draft: it should refuse the stale planning revision and preserve A's change. iCloud must deliver the first change before the second phone can detect it.
4. Import a running nap and its later completion; keep one actual record and preserve unrelated appointments. Replay completion; no duplicate.
5. Check a completed Huckleberry Details screen, manual edit/delete, historical viewing and your existing bedtime/settings controls.

Late/offline concurrent edits are retained as separate revisions. Once both branches arrive, projections pause. **Day adjustments** shows each saved version’s appointments/pins; explicitly choose the version to use. Add any missing appointment from the other version afterward if needed. Actual sleep is preserved and prior revisions remain in history. An ordinary successful sharing test does not guarantee immediate delivery under every iCloud condition.

## Boundaries and validation

V2 remains a daytime, manually triggered family utility: no overnight records, notifications, calendar integration, widgets, automatic sleep detection or historical prediction. The planner searches up to six remaining naps and accepts up to twelve awake periods and six stored pins. Actual events are never limited by the planned nap-duration bounds.

145 automated checks pass: 55 original core, 20 constraint-planner, 33 mocked Scriptable adapter, 37 DOM-stub UI. Tests cover both existing capture formats and Details, actual-event preservation, appointments, pinned starts/durations, overlap/boundary/infeasibility, history changes, replay suppression, stale edits, reset and failed-save draft retention. Static palette-role checks retain readable contrast. Full V2 browser/iPhone rendering is NOT verified: local browser launch failed and the elevated render check was rejected by the environment's automatic approval policy. Follow TEST_CHECKLIST.md on both phones.

Developers can rebuild with `python3 build.py`, then run `node --test tests/*.test.js`. The app requires no npm packages. An OPTIONAL browser check uses Playwright with an installed browser; set `WAKE_PREVIEW_BROWSER` only when supplying a specific executable. Its pending status is documented in VALIDATION.md.

## Rollback

Restore the prior V1.1.3 code on both phones if needed; keep the shared folder intact. V1 ignores V2 planning records, so it will show its automatic schedule without appointments/pins. Restoring V2 reads the stored adjustments again unless you explicitly cleared them. No actual event migration is performed.
