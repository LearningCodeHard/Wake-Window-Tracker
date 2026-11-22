# Budget Planner Test

## Install on iPhone

1. Open [Budget_Planner_Test_Launcher.txt](Budget_Planner_Test_Launcher.txt) and copy its contents into a **new** Scriptable script named **Budget Planner TEST**.
2. Run Budget Planner TEST once in Scriptable while online. It opens a separate empty plan with its own release cache and update settings.
3. For realistic data, export a backup from Budget Planner and restore the copy from Settings in Budget Planner TEST. For Shortcuts, duplicate your existing shortcut and select Budget Planner TEST in its Run Script action.

## Release candidates

### v1.3.1

- Manage entries returns to the same list position after editing or canceling. Failed saves keep the editor open.
- Same-day checking entries can be marked **Posted** or **Pending**. Pending entries are included on the snapshot day. The dashboard and Shortcut summary flag items that still need review.
- Twice-monthly payments can share a calendar date and remain individually editable.
- Local saves use separate writer tickets and revision checks. Failed cleanup does not hide a verified save.
- The TEST launcher validates the module entry point before activating an update. Captured text receipts retain a fingerprint so later backups can omit dismissed text.

### v1.4.0

- Add Bill, Add Spending and Add Financing offer editable presets, including Mortgage, Groceries and Vehicle payment. Custom opens a blank entry. Existing entries can be assigned a category while editing.
- **Budgets** shows the selected month's recorded spending, unpaid scheduled amounts and projected month-end total against recurring category goals. Set a goal, log a one-off purchase, or mark a scheduled item paid with its actual amount and posting date.
- A linked paid item counts once in the selected budget. Use the card payoff checkbox for card bills whose purchases you track separately. The payoff is still scheduled in the checking forecast. Log spending and Mark paid update budget records. Horizon uses the checking snapshot and its scheduled cash entries.
- Checking imports still accept one amount such as **CHECKING: $1,234.56** with Run in App off. VIEW and SUMMARY also support background execution. Native Scriptable, Files and Shortcuts still need iPhone verification.

## Verify and build

Run the test suite from the repository root with Node.

    node --test tests/*.test.cjs
    BUDGET_MANIFEST=manifest-v1.3.1.json node --test tests/*.test.cjs

The tests use synthetic budgets and simulations of Scriptable and its dashboard bridge. For an iPhone smoke test, edit two entries in one visit, test a checking snapshot with a pending bill, create a six-payment financing schedule, and log an actual in Budgets. Verify its category projection and test the launcher offline after its first online run.

Build the current source with **node build.cjs VERSION SEQUENCE**. This emits manifest.json and an immutable release file. The iPhone launcher verifies the byte count, hash and module entry point. Production releases use the [budget-planner branch](https://github.com/LearningCodeHard/Wake-Window-Tracker/tree/budget-planner).
