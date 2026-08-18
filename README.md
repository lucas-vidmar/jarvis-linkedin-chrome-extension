# Jarvis Sync

A Chrome extension (Manifest V3) that bridges the gap between two of your daily
tools — **LinkedIn messaging** and **Zoho CRM** — by way of an email-based sync
to **Jarvis** (`https://jarvis.agileengine.com`).

## Why does this project exist?

Jarvis is the company's CRM, but conversation work happens in two other places:
LinkedIn message threads and Zoho CRM contact records. Manually copying every
exchange into Jarvis is slow, error-prone, and easy to forget.

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
- **Gmail draft fallback** — if Google auth fails, it opens a pre-filled Gmail
  compose draft for manual review; the watermark only advances after you
  confirm the send.
- **Sync history** in the popup — see what was synced and when, and reset sync
  progress for any contact.
- **Zoho contact redirect button** — a branded orange rocket that jumps from a
  Zoho contact record to the same contact in Jarvis.
- **SPA-aware content scripts** — both LinkedIn and Zoho render as single-page
  apps; the extension survives navigation, re-renders, and dynamic DOM churn.

## How it works

```
┌─ LinkedIn tab ──────────────────────────────┐
│ content script                              │
│  · detects conversation thread (stable,     │
│    debounced MutationObserver)              │
│  · renders "Sync to Jarvis" button + scope  │
│    dropdown / selection mode                │
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
`src/shared/composer.ts`, addressed to `jarvis@agileengine.com` (overridable —
see [Configuration](#configuration)), containing the contact, who you are,
the chosen scope, and the conversation messages.

### Key mechanisms

- **Watermarks** (`src/background/watermark.ts`) — stored in
  `chrome.storage.local`, keyed per contact URL. Each entry is
  `{ fingerprint, syncedAtEpochMs }` where `fingerprint` is the SHA-256 of the
  last synced message, so incremental sync can tell exactly where you left off.
- **Message fingerprinting** (`src/shared/fingerprint.ts`) — stable content
  hashes used by the watermark and to keep the "already synced" math honest.
- **Content-script stability** — LinkedIn's thread detection requires two
  consecutive identical detections before mounting the button, and uses roster
  signatures to avoid remounting on unrelated DOM churn. URL changes (including
  `pushState`/`replaceState`) tear everything down cleanly.
- **Zoho button** (`src/content/zoho-jarvis-button.ts`) — locates Zoho's
  "Send Email" control (which is a `<button>`, not an `<a>`), copies its
  computed styles, re-themes it to the Jarvis orange, and inserts the rocket
  link *before* it. Removal is driven purely by the URL to avoid stutter during
  Zoho's re-renders. A capture-phase `stopImmediatePropagation` guard keeps
  Zoho's "Send Email" click handler from firing when you click the rocket —
  the new-tab navigation still works.
- **URL mapping** (`src/shared/zoho-url.ts`) — pure function mapping a Zoho
  contact record URL to its Jarvis equivalent, or `null` when the page isn't a
  contact detail page.

## Repository layout

```
entrypoints/
  background.ts        MV3 service worker: OAuth, Gmail send, watermarks, drafts
  content.ts           LinkedIn content script (thread detection + sync UI)
  zoho.content.ts      Zoho CRM content script (rocket redirect button)
  popup/               Extension popup: connect/disconnect Google, sync history
src/
  content/             DOM logic for the LinkedIn and Zoho content scripts
  background/          Chrome-side logic (watermark storage)
  shared/              Pure, unit-tested logic: composer, scopes, fingerprint,
                       watermark, zoho-url, messages, errors, scope-filter
scripts/
  validate-manifest.mjs  Post-build manifest sanity checks (see CI-ish gate below)
public/icon/           Rocket extension icons (16/32/48/96/128)
assets/rocket-icon.svg Source of the rocket icon
```

The split is intentional: everything in `src/shared` is framework-free and
plainly unit-testable; `src/content` and `src/background` hold only the parts
that need the DOM or `chrome.*` APIs.

## Getting started

Requirements: **Node.js ≥ 22** and npm.

```bash
npm install
npm run dev          # watch mode — loads the unpacked extension in Chrome
```

To load it:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3`.
3. Sign in to Google from the extension popup (grants `gmail.send`).

Other commands:

```bash
npm run build           # production build → .output/chrome-mv3
npm run zip             # build + package a distributable zip
npm run test            # run the unit/DOM test suite (Vitest)
npm run test:watch
npm run typecheck       # tsc --noEmit
npm run validate:manifest  # post-build manifest sanity checks
```

## Configuration

`gmail.send` OAuth is configured via `chrome.identity` (the client ID lives in
`wxt.config.ts`).

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
  fingerprint, watermark, and the Zoho URL mapper.
- **DOM behavior** (`src/content/*.test.ts`) — the Zoho button logic runs under
  a DOM implementation (happy-dom) with real computed-style assertions.
- The LinkedIn content script is written to be stable against selector drift;
  both content scripts were validated live (real LinkedIn/Zoho pages) during
  development.

`npm run validate:manifest` asserts the things Chrome is picky about that are
easy to break in a build: the full `gmail.send` scope URI, the `identity`
permission, and the required host permissions.

## Notes & caveats

- Both content scripts rely on LinkedIn/Zoho DOM structure, which can change
  without notice. Detection is written defensively (debounced observers,
  stability passes, URL-driven lifecycle), but a major upstream redesign may
  require updating selectors.
- The Zoho button copies the "Send Email" button's computed styles and overrides
  them with the Jarvis orange — Zoho's gradient background is stripped so the
  color holds at rest, hover, and pressed.
- Only `gmail.send` is requested — the extension reads nothing from your inbox
  and can't read messages back.