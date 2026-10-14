# V2.0 phone acceptance

## Install / regression
- [ ] Update complete code on both phones; same script name/bookmark/folder; footer V2.0.
- [ ] Existing actual records, settings, historical dates and editable bedtime remain.
- [ ] Deeper Stone light has dark readable headings/status/buttons; Stone & Sage dark matches the approved direction.
- [ ] All sheet fields fit at the right edge and Save/Cancel can be reached with keyboard open.
- [ ] Manual morning/start/expected wake/completion/edit/delete and original timer imports still work.
- [ ] Saved sleep Details imports correct date/start/end when run later; replay does not duplicate.

## Demo planning
- [ ] Original noon demo shows 2–3 PM and 5–6 PM naps, bedtime 8 PM once.
- [ ] + Add → Keep awake 3:15–4 PM fits without nap overlap.
- [ ] Pin first suggestion's 2 PM start and 60-minute duration; it remains a suggestion, not an actual nap.
- [ ] Change appointment to 2:45–3:15 PM; conflicting pinned plan pauses and explains adjustments.
- [ ] Release one pin without removing the appointment.
- [ ] Return to automatic confirms and clears appointments/pins together; actuals/settings/bedtime remain.
- [ ] Advancing Demo past an unfulfilled pinned start asks for a real log, moved start or release; no sleep is invented.

## Real shared state
- [ ] Appointment from A appears after refresh on B; pin from B appears after refresh on A.
- [ ] Old planning draft is refused after another parent's delivered edit.
- [ ] If offline planning branches arrive, projections pause; Day adjustments displays both versions and requires explicit choice. Actual sleep is preserved. Use a separate shared test folder for this optional robustness check.
- [ ] Starting a real planned nap retires its pin; completion recalculates from actual wake.
- [ ] Expected-wake overlap asks for an estimate/appointment adjustment without changing actual state.
- [ ] Backfilling/deleting earlier history asks to release affected pins rather than silently applying them elsewhere.
- [ ] Failed save/read leaves typed values visible and shows retry guidance; confirm local state before repeating an uncertain save.

Use real events in the live folder; Demo or a separate test folder for invented events. Native layout, genuine iCloud timing and the new V2 controls remain pending until this pass is reported.
