# Deployable product acceptance

The supported Windows deliverable is the versioned NSIS Setup executable. The portable executable is an internal diagnostic fallback and is not the normal customer download.

## Automated package gate

- **Version metadata:** `package.json`, `package-lock.json`, the Setup filename, and `latest.yml` must use the same version.
- **Runtime packaging:** the application archive must contain `lib/mail-provider-runtime.mjs`, and it must match `lib/mail-provider.ts` after runtime preparation.
- The Setup artifact must have a Windows PE `MZ` header and `latest.yml` must identify it as the update path.

## Windows acceptance matrix

| Area | Acceptance check |
| --- | --- |
| Clean install | Run Setup as a standard user, choose an install directory, launch the installed app, and finish first-run setup. |
| Uninstall | Remove the app from Windows Installed apps; program files and shortcuts are removed without deleting the user-data directory. |
| Version metadata | Installed-app details, executable metadata, Setup filename, application About/version, and `latest.yml` agree. |
| Shortcuts | Setup creates working Start Menu and desktop shortcuts; uninstall removes both. |
| Retained local data | Create a record, uninstall without deleting user data, reinstall, and confirm the record and completed setup state remain. |
| Offline launch | Disconnect the network, launch from the installed shortcut, and confirm the local workspace opens and local records remain usable. |
| Upgrade | Install the previous accepted version, create data, run the newer Setup, and confirm version, data, and setup state. |
| Runtime packaging | From the installed app, configure/test supported mail runtime loading and confirm no missing-module error for `lib/mail-provider-runtime.mjs`. |

Record the Windows version, installer SHA-256, previous/new app versions, and pass/fail evidence for each release candidate. Automated validation does not replace the Windows install/uninstall smoke test.
