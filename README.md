# Budget Planner releases

This branch distributes Budget Planner code only. Wake Window channels are maintained separately. The launcher's GitHub connection is read-only and never accesses or uploads saved budgets.

## Install once

Replace the contents of the existing **Budget Planner** script in Scriptable with [Budget_Planner_Launcher.txt](Budget_Planner_Launcher.txt). Keep its name so existing Shortcuts continue to use it. Run it once while online to cache the first verified release. The dashboard continues to use the existing local BudgetPlannerV1 plan.

The launcher checks manifest.json on each normal run, verifies SHA-256 and byte count, and uses the cached version if GitHub is unavailable. A first-time installation needs internet access. The dashboard opens with Run in App on; VIEW and SUMMARY work with it off and can feed Show Result.

Use UPDATE_STATUS for the cached version, or UPDATE_SETTINGS with Run in App on to pause updates or revert to a previously cached release.

## Import a bank screenshot (v1.2.0)

Create a Shortcut named **Import Bank Balance**:

1. Enable **Show in Share Sheet** and accept **Images**. Use **Shortcut Input** as the image, or start with **Take Screenshot** if you prefer a shortcut that captures the screen itself.
2. Add **Extract Text from Image** using that image.
3. Add a **Dictionary** with two text entries: `action` = `IMPORT_BALANCE`, and `text` = the Extract Text from Image output (insert the output variable).
4. Add Scriptable's **Run Script** action. Select your existing **Budget Planner** script, pass the Dictionary as **Parameter**, and turn **Run in App** on.

From the screenshot share sheet, run **Import Bank Balance**. Review the suggested amount(s), select the correct tracked account balance or type it manually, choose the closing date, confirm, and save. The import updates the forecast's starting balance; it does not import transactions. Use a closing balance that includes all activity through the chosen date so same-day scheduled movements are not counted twice or omitted. The screenshot and extracted text are not stored by Budget Planner or sent to GitHub.

## Release process

Build the Scriptable app as a module exporting async run(input). Keep real or example personal budget data out of the release. Verify shortcut inputs, offline operation, update integrity, and the existing local data schema. Write the immutable releases/<sha256>.js file and update manifest.json together, incrementing sequence. Publish only to this branch. Never reuse a sequence for different content. Changes to launcher capabilities require a new launcher install.
