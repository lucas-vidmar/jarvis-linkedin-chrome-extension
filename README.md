# Jarvis Sync

A Chrome extension (Manifest V3) that connects **LinkedIn messaging** and
**Zoho CRM** to **Jarvis** (`https://jarvis.agileengine.com`) with an
email-based sync.

## Why does this project exist?

Jarvis is the company's CRM and the destination for every sync. Conversation
work happens in two other places: LinkedIn message threads and Zoho CRM contact
records. Manually copying every exchange into Jarvis is slow, error-prone, and
easy to forget.

**Terminology:** **Zoho CRM** is a source system where contact records live; it
is not where sync emails go. Every sync email is addressed to the configured
**Jarvis sync recipient** (default `jarvis@agileengine.com`) and sent from your
own Gmail account.

This extension automates that, in two directions:

1. **LinkedIn → Jarvis.** From a LinkedIn conversation thread, send the thread
   (or just the new messages since your last sync, or a hand-picked selection)
   into Jarvis with one click. The email is sent from **your own Gmail account**
   so Jarvis sees it as coming from you.
2. **Zoho → Jarvis.** On a Zoho CRM contact page, an orange rocket button next
   to "Send Email" opens the matching contact in Jarvis directly — no hunting
   for the right record.

## Features

- **One-click sync** of a LinkedIn conversation to Jarvis via Gmail (`gmail.send` scope).
- **Watermark-based incremental sync** — the extension remembers the last
  synced message per contact, so re-syncing only sends what's new.
- **Scope selection** — sync the full conversation, only new messages, or a
  **manually selected subset** (selection mode).
- **Gmail compose fallback** — if Google auth fails, it opens a prefilled Gmail
  compose window in a new tab (not a saved draft) for manual review and sending;
  the watermark only advances after you confirm the send, and only for scopes
  that support it.
- **Sync history** in the popup — see what was synced and when, and reset sync
  progress for any conversation.
- **Zoho contact redirect button** — a branded orange rocket that jumps from a
  Zoho contact record to the same contact in Jarvis.
- **SPA-aware content scripts** — both LinkedIn and Zoho render as single-page
  apps; the extension survives navigation, re-renders, and dynamic DOM churn.

## Documentation

- [PRIVACY.md](PRIVACY.md) — what the extension reads, sends, and stores, and
  how to reset or remove that data.
- [SECURITY.md](SECURITY.md) — private vulnerability reporting, token handling,
  OAuth caveats, and the unpacked-extension trust model.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, architecture, tests, selector
  maintenance, and pull-request expectations.
- [docs/manual-qa.md](docs/manual-qa.md) — the repeatable browser checklist for
  LinkedIn, Zoho, and the popup.

## Screenshots

**Zoho → Jarvis.** On a contact page, the orange rocket button sits right next
to Zoho's "Send Email" action and opens the same contact in Jarvis.

![Zoho contact page with the Jarvis rocket button next to "Send Email"](assets/screenshots/zoho-jarvis-button.png)

**Extension popup.** Connect/disconnect Google, change the sync recipient (no
rebuild needed), and review or reset sync history per conversation.

![Extension popup: Google connection, sync recipient setting, and sync history](assets/screenshots/popup-recipient-settings.png)

## Using it

### Sync a LinkedIn conversation to Jarvis

1. Open a conversation thread on LinkedIn Messenger.
2. Click the **Sync** button that appears in the conversation title bar above
   the message box (its accessible name currently reads "Sync conversation to
   Zoho CRM").
3. Pick a scope in the dropdown:
   - **Entire thread** — everything in the conversation.
   - **Since last sync** — only the messages after your last sync (uses the
     watermark).
   - **Time windows** (last day / last week) — only messages in that window.
   - **Select messages** — tick individual messages, then sync just those.
4. The conversation is emailed to the configured **Jarvis sync recipient** from
   your Gmail account. On success you'll currently see **"Synced to Zoho."** —
   that is a known copy inconsistency: the email goes to Jarvis, not Zoho (see
   [Known copy inconsistency](#known-copy-inconsistency)). On an auth problem the
   extension opens a prefilled Gmail compose window in a new tab; it does **not**
   save a draft. After you send it, hit **Confirm sent** so the progress
   watermark advances for scopes that support it.

### Jump from Zoho to Jarvis

1. Open any contact in Zoho CRM.
2. Click the orange **🚀** button to the left of "Send Email".
3. The matching contact opens in Jarvis in a new tab.

The button is available on every Zoho CRM data-center domain:

| Region | Host |
| --- | --- |
| United States | `crm.zoho.com` |
| Europe | `crm.zoho.eu` |
| India | `crm.zoho.in` |
| Australia | `crm.zoho.com.au` |
| Japan | `crm.zoho.jp` |
| China | `crm.zoho.com.cn` |
| Canada | `crm.zohocloud.ca` |
| Saudi Arabia | `crm.zoho.sa` |
| United Arab Emirates | `crm.zoho.ae` |
| Singapore | `crm.zoho.sg` |

Only these exact hosts are matched; lookalike domains such as
`crm.zoho.evil.com` are rejected.

### Change where syncs are sent

Open the extension popup → **Sync recipient** → type an email → **Save**.
Leave the field blank and save to reset to `jarvis@agileengine.com`.

## How it works

```
┌─ LinkedIn tab ──────────────────────────────┐
│ content script                              │
│  · detects conversation thread (stable,     │
│    debounced MutationObserver)              │
│  · renders "Sync" button + scope dropdown / │
│    selection mode                           │
│  · extracts messages, filters by scope +    │
│    watermark                                │
│  · composes an email envelope               │
└──────────────┬──────────────────────────────┘
               │ chrome.runtime.sendMessage (SEND_SYNC_EMAIL)
┌──────────────▼──────────────────────────────┐
│ background (MV3 service worker)             │
│  · chrome.identity OAuth → Gmail token      │
│  · builds RFC-5322-style raw message        │
│  · POST gmail.googleapis.com/.../messages/send
│  · dedupes in-flight syncs per contact      │
│  · classifies errors (auth vs retryable)    │
│  · advances the watermark on success        │
└─────────────────────────────────────────────┘
```

The email that Jarvis receives is a plain-text envelope built by
`src/shared/composer.ts`, addressed to the configured Jarvis sync recipient
(`jarvis@agileengine.com` by default — see [Configuration](#configuration)),
containing the contact, who you are, the chosen scope, and the conversation
messages. It is sent through the Gmail API from your own account; Zoho is not
involved in delivery.

### Key mechanisms

- **Watermarks** (`src/background/watermark.ts`) — stored in
  `chrome.storage.local`, keyed per contact URL. Each entry is
  `{ fingerprint, syncedAtEpochMs, lastMessageTimestampMs? }` where `fingerprint`
  is the SHA-256 of the last synced message, so incremental sync can tell
  exactly where you left off.
- **Message fingerprinting** (`src/shared/fingerprint.ts`) — stable content
  hashes used by the watermark and to keep the "already synced" math honest.
- **Content-script stability** — LinkedIn's thread detection requires two
  consecutive identical detections before mounting the button, and uses roster
  signatures to avoid remounting on unrelated DOM churn. URL changes (including
  `pushState`/`replaceState`) tear everything down cleanly.
- **Zoho button** (`src/content/zoho-jarvis-button.ts`) — locates Zoho's
  "Send Email" control (the code supports either a `<button>` or an `<a>`),
  copies its computed styles, re-themes it to the Jarvis orange, and inserts the
  rocket link *before* it. Removal is driven purely by the URL to avoid stutter
  during Zoho's re-renders. A capture-phase `stopImmediatePropagation` guard
  keeps Zoho's "Send Email" click handler from firing when you click the rocket
  — the new-tab navigation still works.
- **URL mapping** (`src/shared/zoho-url.ts`) — the canonical list of supported
  Zoho data-center hosts plus a pure function mapping a Zoho contact record URL
  to its Jarvis equivalent, or `null` when the page isn't a contact detail page.
  The same list feeds the content-script `matches` and `host_permissions`.

## Repository layout

```
entrypoints/
  background.ts        MV3 service worker: OAuth, Gmail send, watermarks,
                       recipient settings, Gmail compose fallback
  content.ts           LinkedIn content script (thread detection + sync UI)
  zoho.content.ts      Zoho CRM content script (rocket redirect button)
  popup/               Extension popup: connect/disconnect Google, sync history
src/
  content/             DOM logic for the LinkedIn and Zoho content scripts
  background/          Chrome-side logic (watermark and recipient storage)
  shared/              Pure, unit-tested logic: composer, scopes, scope-filter,
                       fingerprint, watermark, zoho-url, messages, errors,
                       email, gmail-errors, recipient
scripts/
  validate-manifest.mjs  Post-build manifest sanity checks (run by the release
                         workflow; see Testing)
  extension-id.mjs       Prints the Chrome extension ID implied by manifest.key
public/icon/           Rocket extension icons (16/32/48/96/128)
assets/rocket-icon.svg Source of the rocket icon
docs/manual-qa.md      Browser QA checklist for LinkedIn, Zoho, and the popup
PRIVACY.md             Data inventory and retention
SECURITY.md            Vulnerability reporting and trust model
CONTRIBUTING.md        Setup, architecture, tests, and PR expectations
```

The split is intentional: everything in `src/shared` is framework-free and
plainly unit-testable; `src/content` and `src/background` hold only the parts
that need the DOM or `chrome.*` APIs.

## Getting started

Requirements: **Node.js ≥ 22** and npm.

```bash
npm ci
npm run dev          # watch mode — loads the unpacked extension in Chrome
```

To load it:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3`.
3. Sign in to Google from the extension popup (grants `gmail.send`).

The resulting extension ID is fixed at
`bhnbdlnlepjoeacilhikmoamcgblnmkp` (verify with `npm run extension:id`).
The Google Cloud OAuth client used for sign-in must be registered for that
exact ID — see [Extension ID & Google OAuth](#extension-id--google-oauth).

Other commands:

```bash
npm run build           # production build → .output/chrome-mv3
npm run zip             # build + package a distributable zip
npm run test            # run the unit/DOM test suite (Vitest)
npm run test:watch
npm run typecheck       # tsc --noEmit
npm run validate:manifest  # post-build manifest sanity checks
npm run extension:id    # print the pinned Chrome extension ID (run after build)
```

> The extension's ID is **pinned** by a public key in `wxt.config.ts`, so it is
> the same on every machine. That matters for Google OAuth — see
> [Extension ID & Google OAuth](#extension-id--google-oauth).

## Installing for users

The extension isn't on the Chrome Web Store, so it's installed as an **unpacked
extension** from a built zip. Works in Chrome and any Chromium browser (Edge,
Brave, Opera).

### Option A — install from a GitHub Release (no build required)

1. Open the **Releases** page and download the latest
   `linkedin-jarvis-extension-<version>-chrome.zip`.
2. Unzip it to a folder you'll keep in place (e.g. `~/jarvis-extension`).
   The unzipped folder must contain `manifest.json` at its top level.
3. Open `chrome://extensions` and turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select that folder.
5. Pin **Jarvis Sync** from the puzzle-piece menu so the popup is easy to reach.

> **Important:** don't move or delete the unzipped folder after installing —
> an unpacked extension runs from where it was loaded. If you move it, remove
> and re-add it from the new location.

### Option B — install from source (for developers)

```bash
git clone https://github.com/lucas-vidmar/jarvis-linkedin-chrome-extension.git
cd jarvis-linkedin-chrome-extension
npm ci
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load
unpacked**, and select the `.output/chrome-mv3` folder.

### After installing

1. Open the popup (puzzle-piece menu → **Jarvis Sync**) and click
   **Connect with Google** — this grants the `gmail.send` scope used for syncs.
   If it fails, the Google Cloud OAuth client isn't registered for this
   extension's ID — see
   [Symptoms of an ID/OAuth mismatch](#symptoms-of-an-idoauth-mismatch).
2. (Optional) Set a **Sync recipient** in the popup if syncs shouldn't go to
   `jarvis@agileengine.com`.
3. Open a LinkedIn conversation and look for the **Sync** button in the
   conversation title bar. Open a Zoho contact and look for the **🚀** button
   next to "Send Email".

### Updating

There's no auto-update for unpacked extensions. To update:

- **Release install:** download the new zip, unzip over the existing folder,
  then hit the refresh icon on the extension card in `chrome://extensions`
  (or remove and re-add it).
- **Source install:** `git pull && npm run build`, then reload the extension.

### Notes for distribution

- Because the extension isn't in the Web Store, Chrome shows a
  "developer mode extensions" warning on startup. It's expected for unpacked
  installs — dismiss it, but only after confirming you trust the build (see
  [SECURITY.md](SECURITY.md)).
- There is no Web Store review and no auto-update. Install only from a trusted
  release or source build, and review the trust model in
  [SECURITY.md](SECURITY.md).
- `chrome.identity` OAuth is tied to the extension ID, which is now **pinned**
  (see [Extension ID & Google OAuth](#extension-id--google-oauth)). Unpacked
  installs used to get a different ID on every machine — derived from the
  install path — so a single Google Cloud OAuth client could not serve more
  than one user. The pinned key fixes the ID; the OAuth client still has to be
  configured for it.

## Extension ID & Google OAuth

Chrome gives an **unpacked** extension an ID derived from its install path, so
a plain build loaded from two different folders would produce two different
IDs. `chrome.identity.getAuthToken()` identifies the caller by extension ID,
and a Google Cloud OAuth client of type **Chrome extension** only accepts one
ID. Without a pinned ID, every user would need their own OAuth client.

This repo therefore ships a **public** manifest key (`manifest.key` in
`wxt.config.ts`). The matching private key is **not** committed — the public
half is all Chrome needs to derive a stable ID. The current ID is:

```
bhnbdlnlepjoeacilhikmoamcgblnmkp
```

### Register the OAuth client for the pinned ID

The developer maintaining the Google Cloud project must do this once (and
again whenever the key/ID changes):

1. Print the ID from a build:
   ```bash
   npm run build && npm run extension:id
   ```
2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   open the project's OAuth client of type **Chrome extension** (create one if
   it doesn't exist yet). Set its **Application ID / Item ID** to the printed
   extension ID.
3. Enable the **Gmail API** for the project and make sure the consent screen
   includes the `https://www.googleapis.com/auth/gmail.send` scope.
4. If other people will sign in with their own Google accounts while the app is
   still in **Testing** mode, add them as **test users**; otherwise publish and
   verify the app.

You do **not** need to edit Google Cloud to build the extension — only to make
sign-in work for the ID you build.

### Symptoms of an ID/OAuth mismatch

If the extension ID doesn't match the OAuth client, **Connect with Google**
fails (typically `invalid_client`, "The OAuth client was not found", or a
generic `Bad Request`). Check, in order:

- `npm run extension:id` matches the **Application ID** on the OAuth client.
- The OAuth client type is **Chrome extension** (not "Web application").
- The Gmail API is enabled and `gmail.send` is on the consent screen.
- The Google account is a test user if the app isn't published.

As a fallback, the extension opens a prefilled Gmail compose window in a new tab
(not a saved draft) so a sync can still be completed manually, but connecting
Google requires a correct client/ID pair.

### Rotating the key (changes the extension ID)

The key can be regenerated for a fresh install base or if the old key is
retired. A new key produces a **new extension ID**, which requires a matching
OAuth-client update — users will have to reconnect Google and reload the
extension.

```bash
# 1. Generate a private key OUTSIDE the repo and never commit it.
mkdir -p ~/.jarvis-extension-keys && chmod 700 ~/.jarvis-extension-keys
openssl genrsa -out ~/.jarvis-extension-keys/jarvis-extension.pem 2048
chmod 600 ~/.jarvis-extension-keys/jarvis-extension.pem

# 2. Export the public key as DER, base64-encode it (single line).
openssl rsa -in ~/.jarvis-extension-keys/jarvis-extension.pem \
  -pubout -outform DER -out ~/.jarvis-extension-keys/jarvis-extension.pub.der
base64 -i ~/.jarvis-extension-keys/jarvis-extension.pub.der | tr -d '\n'
```

Put that base64 string in `manifest.key` in `wxt.config.ts` (or set
`WXT_EXTENSION_KEY` at build time), then run `npm run build` followed by
`npm run extension:id`, and update the OAuth client's **Application ID** to the
new ID. Commit only the **public** key.

## Configuration

`gmail.send` OAuth is configured via `chrome.identity`. Build-time values can
be set in a `.env` file (copy `.env.example`); they are read by
`wxt.config.ts`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `WXT_GOOGLE_CLIENT_ID` | OAuth client ID written to `manifest.oauth2.client_id` | Client ID pinned in `wxt.config.ts` |
| `WXT_EXTENSION_KEY` | Base64 DER public key written to `manifest.key`; determines the extension ID | Key pinned in `wxt.config.ts` |
| `WXT_JARVIS_RECIPIENT` | Factory-default sync recipient (runtime setting wins) | `jarvis@agileengine.com` |

Changing `WXT_EXTENSION_KEY` changes the extension ID, which requires updating
the Google Cloud OAuth client — see
[Extension ID & Google OAuth](#extension-id--google-oauth). Never commit a
private key; only the public key belongs in the build config.

**Sync recipient** — runtime-configurable, no coding or rebuild needed. Open the
extension popup → **Sync recipient**, enter any email address, and hit **Save**.
It's stored in `chrome.storage.sync`, so the setting persists across restarts and
roams with your Chrome profile. Leave the field blank and save to reset to the
default (`jarvis@agileengine.com`).

For development, the *factory default* (used on fresh installs / when nothing is
saved) can be overridden at build time via a `.env` file copied from
`.env.example`:

```bash
WXT_JARVIS_RECIPIENT=you@example.com
```

The popup setting always wins over the build-time value at runtime.

## Testing

- **Pure logic** (`src/shared/*.test.ts`) — composer, scopes, scope filter,
  fingerprint, watermark, email encoding, Gmail error classification, and the
  Zoho URL mapper.
- **DOM behavior** (`src/content/*.test.ts`) — the Zoho button logic runs under
  a DOM implementation (happy-dom) with real computed-style assertions.
- The LinkedIn content script is written to be stable against selector drift;
  both content scripts were validated live (real LinkedIn/Zoho pages) during
  development.

Automated checks run in the tag-triggered release workflow
([`.github/workflows/release.yml`](.github/workflows/release.yml)) on `v*` tags
and manual dispatch: `npm ci`, `npm test`, `npm run typecheck`, `npm run zip`,
and `npm run validate:manifest`. There is no pull-request CI workflow yet. The
repeatable browser checklist is in [docs/manual-qa.md](docs/manual-qa.md).

`npm run validate:manifest` asserts the things Chrome is picky about that are
easy to break in a build: the full `gmail.send` scope URI, the `identity` and
`identity.email` permissions, the required host permissions, a non-empty pinned
`manifest.key`, and a non-empty `oauth2.client_id`.

## Permissions & privacy

| Permission / scope | Why |
| --- | --- |
| `identity` | Google sign-in through `chrome.identity.getAuthToken()`, scoped to `gmail.send`. |
| `identity.email` | Reads the signed-in Chrome profile's email address so the popup can show **Authorized as …**. Without it Chrome returns an empty email even when the account is connected. |
| `storage` | Persists the sync recipient and the per-conversation watermarks. |
| `gmail.send` (OAuth scope) | Sends the composed sync email through the Gmail API. No inbox read/list scope is requested. |

Host access is limited to `https://www.linkedin.com/*`, the supported Zoho CRM
hosts, and Google's Gmail/OAuth endpoints. The extension does **not** request
`<all_urls>` or access to arbitrary sites.

Gmail access is limited to `gmail.send`: the extension can send the sync email
from your account but it **cannot read your inbox** — no read/list scope is
requested, and no message content is ever fetched back.

See [PRIVACY.md](PRIVACY.md) for the full data inventory and retention rules. In
short: the extension reads only the LinkedIn conversation you sync (plus the
profile URL needed to identify the contact), the Zoho contact-record URL, and
the signed-in Google profile email for display; it sends the composed sync email
to the configured Jarvis recipient; it stores only watermarks and the recipient;
and it contains no analytics, tracking, or telemetry. Tokens stay in Chrome's
identity cache, not in extension storage or this repository.

`chrome.identity.getProfileUserInfo()` can still return an empty email — for
example when the Chrome profile has no Google account signed in, or the address
is otherwise unavailable. That only hides the **Authorized as …** line: the
popup still reports the connection state and syncing works normally.

## Notes & caveats

- Both content scripts rely on LinkedIn/Zoho DOM structure, which can change
  without notice. Detection is written defensively (debounced observers,
  stability passes, URL-driven lifecycle), but a major upstream redesign may
  require updating selectors.
- The Zoho button copies the "Send Email" button's computed styles and overrides
  them with the Jarvis orange — Zoho's gradient background is stripped so the
  color holds at rest, hover, and pressed.
- `identity` and `identity.email` are requested so sign-in works and the popup
  can label the authorized Google account; Gmail access is limited to
  `gmail.send`, so the extension reads nothing from your inbox and can't read
  messages back.
- Because this is an unpacked extension with no Web Store review or auto-update,
  install only from a trusted release or source build. See
  [SECURITY.md](SECURITY.md) for the trust model and reporting process.

### Known copy inconsistency

The LinkedIn success notice in `entrypoints/content.ts` still says **"Synced to
Zoho."** (and **"Synced to Zoho. Sync point unchanged for this scope."**), and
the popup headline says "Sync LinkedIn conversations to Zoho via Jarvis." The
actual destination is the configured **Jarvis** sync recipient, not Zoho. This
is a UI copy inconsistency; the documentation pass does not edit source. Treat
"Zoho" in those messages as legacy wording.

## License

[MIT](LICENSE)