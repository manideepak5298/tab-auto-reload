# Tab Auto Reload

A Chromium (Manifest V3) extension that reloads the current tab at a configurable
fixed interval. Published on the Edge Add-ons store as extension ID
`adkjlkaeicnimgfgmaneicmblnkidceg`, version 1.0.0. The same sources run unmodified in
Google Chrome — see *Chrome compatibility* below.

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

1. Open `edge://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.

Loading unpacked assigns a different extension ID than the published one. To keep the
published ID locally, add the store's public key to `manifest.json` as a `"key"` field
(see *Publishing* below).

## Chrome compatibility

The extension requires **no code changes** to run in Chrome. Every Chromium API it uses
is standard MV3, supported identically by both browsers:

```
chrome.action.setBadgeBackgroundColor / setBadgeText
chrome.alarms.clear / create / onAlarm
chrome.runtime.lastError / onInstalled / onMessage / onStartup / sendMessage
chrome.storage.local
chrome.tabs.onActivated / onRemoved / query / reload
```

There are no `browser.*` calls, no Edge-only APIs, and no Edge-specific manifest keys.

Verified end to end in Google Chrome 155 and Microsoft Edge 154 by loading the extension
into a throwaway profile and pointing a tab at a local request-counting server. At a
requested 5-second interval Chrome performed 12 reloads in 60 seconds with measured gaps
of exactly 5.0 s, and the alarm was cleared on stop.

One caveat that applies equally to the published Edge build: Chromium clamps very short
`chrome.alarms` periods for extensions installed from a store, but exempts unpacked ones.
The measurements above were taken unpacked, so intervals below 30 seconds may behave
differently once installed from the Chrome Web Store. Intervals of 30 seconds and above
are unaffected.

## Publishing

Create a zip containing only the five extension files listed above — do not include
`README.md`, `.gitignore`, or the `.git` folder — and upload it to the
[Partner Center dashboard](https://partner.microsoft.com/dashboard/microsoftedge).
The identical zip works for the Chrome Web Store; see below for the extra listing
requirements Chrome imposes.

From the repository root:

```bash
zip -r ../tab-auto-reload-1.0.0.zip manifest.json background.js popup.html popup.js popup.css
```

Bump `version` in `manifest.json` for each submission.

### Chrome Web Store

The same zip is a valid Chrome Web Store package. Submitting it additionally requires:

- A one-time **$5 USD** developer registration fee on the
  [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
- A **128x128 PNG store icon**. This extension ships no icons at all, so Chrome shows a
  generic puzzle piece in the toolbar. Adding an `icons` key to `manifest.json` is
  optional for review but strongly recommended.
- At least one **screenshot**, 1280x800 or 640x400.
- A **single-purpose description** and a **privacy practices** disclosure. This extension
  collects nothing and makes no network requests, which is the simplest case to declare.
- A **justification for the `tabs` permission** — it is used to read the active tab's id
  and to call `chrome.tabs.reload`, never to read page content or browsing history.

Chrome assigns its own extension ID, unrelated to the Edge one.

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
