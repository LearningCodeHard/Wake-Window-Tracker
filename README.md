# Budget Planner releases

This branch distributes Budget Planner code only. Wake Window channels are maintained separately. The launcher's GitHub connection is read-only and never accesses or uploads saved budgets.

## Install once

Replace the contents of the existing **Budget Planner** script in Scriptable with [Budget_Planner_Launcher.txt](Budget_Planner_Launcher.txt). Keep its name so existing Shortcuts continue to use it. Run it once while online to cache the first verified release. The dashboard continues to use the existing local BudgetPlannerV1 plan.

The launcher checks manifest.json on each normal run, verifies SHA-256 and byte count, and uses the cached version if GitHub is unavailable. A first-time installation needs internet access. The dashboard opens with Run in App on; VIEW and SUMMARY work with it off and can feed Show Result.

Use UPDATE_STATUS for the cached version, or UPDATE_SETTINGS with Run in App on to pause updates or revert to a previously cached release.

## Release process

Build the Scriptable app as a module exporting async run(input). Keep real or example personal budget data out of the release. Verify shortcut inputs, offline operation, update integrity, and the existing local data schema. Write the immutable releases/<sha256>.js file and update manifest.json together, incrementing sequence. Publish only to this branch. Never reuse a sequence for different content. Changes to launcher capabilities require a new launcher install.
