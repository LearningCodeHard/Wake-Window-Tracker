# V2.0 validation and handoff — October 13, 2026

## Scope / authorization
The user selected Quiet timeline, accepted Stone & Sage dark, selected Deeper Stone light, then agreed to five V2 functions and requested continuing. The implementation retains the existing cloud bookmark, storage schema and native presentation lifecycle. V1.1.3 artifacts remain separate for rollback.

## Implementation
- Core defaults, actual-event validation, parsing and the original unconstrained planner remain. planning.js adds validated awake periods and pins and a minute-based dynamic-programming search. For each future nap count and cursor, it retains the lowest-cost feasible path. It honors ordinary/final wake ranges, nap bounds, appointment non-overlap, pinned starts/durations and daytime end; compares bedtime deviation then preferred-duration cost. No exact target is invented if infeasible.
- planning:YYYY-MM-DD is one revisioned shared event containing awake and pin inputs. This makes reset one guarded revision, with no destructive filesystem deletion or multi-file partially applied reset. Ordinary stale edits are refused; independently delivered conflicting branches pause projections. Day adjustments presents the leaf revisions for an explicitly confirmed choice; the chosen input is saved as a new revision. Old events and all actual sleep remain intact.
- Pins retain absolute nap ordinals and a prefix of actual-record identities. Normal actual starts retire corresponding pins. Earlier record insertion/deletion checks identities before consumption to avoid silently reassigning a pin based only on changed count.
- Actual nap data is not edited by constraints. Expected overlap pauses projections; past actual overlap is noted. Late unfulfilled start pins require review. Pin durations are not coerced after settings change.
- UI is the approved Quiet timeline. Remaining suggestions/appointments are primary; actuals collapse into Earlier today; bedtime appears once. Existing compact selectors and import/deletion reviews stay. Requests show reading/saving/confirmed/unconfirmed state, preserve failed drafts and distinguish confirmed write with failed subsequent read. Last-local-save telemetry is session-local.

## Checks
145 automated checks pass: 55 original core, 20 planning, 33 native-adapter simulations, 37 minimal-DOM UI. Test results are bundled. The native adapter tests evaluate the serializable callback JavaScript, delay presentation and verify the script remains alive until dismissal. All original import and actual-event paths continue passing.

Static color-role validation checks light/dark text against intended backgrounds; explicit text colors are assigned in the standalone document. These checks do not establish rendered browser/WebKit colors or native control sizing.

## Verification limitation
The completed V2 browser render check could not run here: the local headless process crashed under current permissions; the request for elevated browser verification was automatically rejected by the environment's approval policy. No V2 browser or iPhone render pass is claimed. Prior palette mockup render checks do not substitute for this actual dashboard. tests/browser-check.cjs is supplied for a developer environment with Playwright and an installed browser. iPhone acceptance, two-phone appointment/pin delivery and V1.1.3's Details phone test are pending.

## Installation / recovery
Copy the complete Wake_Window_V2_Scriptable.txt into the existing script on both phones, retaining its name, bookmark and folder. Use START_HERE.md and TEST_CHECKLIST.md. The source/build/package contains everything needed to reproduce the release. Existing V1.1.3 downloads remain available; no migration of actual data is needed. V1 ignores planning records while V2 resumes them after rollback/re-upgrade.

No analytics, alternative-plan comparison, calendar link, notification, widget, automatic detection or overnight tracking is included. Future default changes remain parent-controlled.
