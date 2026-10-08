# Tab Auto Reload

A Microsoft Edge (Manifest V3) extension that reloads the current tab at a configurable
fixed interval. Published on the Edge Add-ons store as extension ID
`adkjlkaeicnimgfgmaneicmblnkidceg`, version 1.0.0.

## Features

- Per-tab auto reload — each tab has its own interval and runs independently.
- Minimum interval of 5 seconds, enforced in both the popup and the service worker.
- Live countdown in the popup, plus a toolbar badge showing the time until the next
  reload (seconds below 60, then rounded-up minutes as `Nm`, capped at `999+`).
- State survives browser restarts via `chrome.storage.local` and `chrome.alarms`.
- Automatic cleanup: closing a tab clears its alarm and stored settings.

## Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest: `tabs`, `alarms`, `storage` permissions |
| `background.js` | Service worker: alarms, reload scheduling, badge updates |
| `popup.html` | Popup markup |
| `popup.js` | Popup logic: start/stop, live countdown, messaging |
| `popup.css` | Popup styling |

These five files are the complete extension — there are no icons, no build step, and
no dependencies.

## How it works

The popup sends `SET_RELOAD` / `GET_RELOAD` messages to the service worker. For an
enabled tab the worker stores `{ intervalSeconds, enabled, nextReloadAt }` under the
`tabReloadSettings` key and creates a repeating alarm named `reload-tab-<tabId>`.
When the alarm fires, the worker reloads the tab and rolls `nextReloadAt` forward.
A 1-second interval ticker keeps the toolbar badge current while any tab is active.

## Running locally

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.

Loading unpacked assigns a different extension ID than the published one. To keep the
published ID locally, add the store's public key to `manifest.json` as a `"key"` field
(see *Publishing* below).

## Publishing

Create a zip containing only the five extension files listed above — do not include
`README.md`, `.gitignore`, or the `.git` folder — and upload it to the
[Partner Center dashboard](https://partner.microsoft.com/dashboard/microsoftedge).

From the repository root:

```bash
zip -r ../tab-auto-reload-1.0.0.zip manifest.json background.js popup.html popup.js popup.css
```

Bump `version` in `manifest.json` for each submission.

### Store-injected manifest fields

The installed copy of the extension contains two fields that the store adds at install
time and that must **not** be committed to `manifest.json` when uploading: `update_url`
and `key`. For reference, the published build's `key` is:

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApFIQCkEwkoY/JNNDt3pIx+IMzC5BZY/TCa6xKbEfH461/d6Y3nPUb7mxTO+3wvH1Tuf96ExYvXi80C5hWSberbVHM6BY9ubYqGMrV7tVYtls6ictFBefGCuO58yhfGw2kKUPaSDlc2A81wg8BKcF36i8krkjmlMPBjSwdZx9uhm9QJYWGp6SjLa13cf18xLdHEJ7IGsw0XaqdZLxInzZwRAdeNJQfeJlV4efKmp7OgTR0XE3gJ5nV6BKS8yL16ihgYFzL2CJ+jMijyMAplS3m/mMZD0Z6CnsYhVXt40Ho5NpANU57YSy39EoS906wLTVbPWy3gsadFXOPd+Z2t6fXwIDAQAB
```

## Provenance of this repository

The original sources were lost. `background.js`, `popup.html`, `popup.js` and
`popup.css` were recovered byte-for-byte from the installed store build and verified
against the Microsoft-signed `verified_contents.json` treehash root hashes, so they are
identical to the published 1.0.0 bundle. `manifest.json` was reconstructed from the
installed manifest with the store-injected `update_url` and `key` fields removed; it is
semantically identical to the published manifest, though the original file's formatting
is not recoverable.

## License

[MIT](LICENSE) (c) 2026 Mani Deepak Vandrangi
