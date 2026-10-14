# Install the two launchers

Do this on each phone. The first run needs an internet connection. After a
successful download, the installed app can use its cache if GitHub is unavailable;
shared iCloud records still depend on the files available on that phone.

## 1. Use the public launchers

These launchers point at [LearningCodeHard/Wake-Window-Tracker](https://github.com/LearningCodeHard/Wake-Window-Tracker).
No GitHub token or login is needed on either phone. Download the new launcher
files below even if you already installed the earlier private-repository ones.
Repository location and download access are part of the installed launcher.

## 2. Install Test first

Create a Scriptable script named **Wake_Window_TEST**. Replace all of its code
with [launchers/Wake_Window_Test.txt](launchers/Wake_Window_Test.txt).
Run it in Scriptable. There is no token prompt. The dashboard should show
**Wake Window TEST** in the header and **2.0.3 · TEST · Demo only** in the footer. Demo edits never reach shared files.

The test launcher stays in demo mode even if a Shortcut sends timer text. For
import or two-phone sharing tests, use the separate test folder below.

## 3. Replace the production script code

Keep a copy of the current working production script as **Wake Window Backup**.
In the existing production script, replace all code with
[launchers/Wake_Window.txt](launchers/Wake_Window.txt).
**Retain your chosen name**, such as `Wake_Window_PROD`.
If your Shortcut previously targeted a differently named script, select
**Wake_Window_PROD** in its Run Script action.
Keep its existing **WakeWindowShared** bookmark and family folder.

The Huckleberry Shortcut sequence remains:
Open Huckleberry → Get on-screen Text → Combine Text (New Lines) → Scriptable
Run Script. Select your production script and retain the Combined Text parameter and
**Run in App: ON**. The launcher forwards the parameter unchanged.

Run production. Confirm **1.1.3 · PRODUCTION** and your actual records.
The production app initially retains V1 functionality; V2 waits for acceptance.
Run Test again and confirm it still has demo records, not family records.

## 4. Optional: test imports and phone sharing safely

In iCloud Drive, create a separate **WakeWindowTestShared** folder beside the
family folder. Share it with the second parent, allowing edits. On each phone,
create a Scriptable File Bookmark named **WakeWindowTestShared**, pointing at
that same test folder. Keep **WakeWindowShared** configured too, so the app can
check that the folders differ. Neither folder may be inside the other.

In Test, open **Updates → Use separate test folder**, close the dashboard, and
run Test again. Confirm **TEST · Test folder** in the footer. Point a copied
Huckleberry Shortcut at **Wake Window Test** for import acceptance.
Fabricated events belong only in this folder. Switch back using
**Updates → Use demo data**, close and reopen.

## Update controls and rollback

Both dashboards have an **Updates** button. It lets you pause/resume automatic
updates and select **Revert update**. Preferences and rollback
take effect on the next launch; close the current dashboard before reopening.
Revert becomes useful after that phone has received a second version.

If the dashboard cannot open, create a helper Shortcut:
**Text: UPDATE_SETTINGS → Scriptable Run Script**, selecting the affected
launcher and enabling **Run in App**. This opens the same native menu without
loading the dashboard. It also works while offline.

For a new phone or cleared Scriptable storage, there is no cache until first
download. Keep the Backup script until both phones pass the acceptance checks.

## Manifest error diagnostics

Launcher **1.0.1** reports the exact manifest field/value that fails validation.
If PROD shows a manifest error, replace its complete launcher code from the
production link above; keep the script name and bookmark. Copy the full new
error message, including the launcher/channel/repository lines. TEST can keep
its current working launcher while PROD is diagnosed.
