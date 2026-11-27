# Contributing

Thanks for helping improve Jarvis Sync. This extension reads LinkedIn
conversations and Zoho contact URLs and sends a composed email through the
user's Gmail account, so changes need to be careful about data access, error
handling, and the DOM assumptions they introduce.

Documentation-only changes are welcome. For behavior changes, include tests and
run the manual checklist in [docs/manual-qa.md](docs/manual-qa.md) before
opening a pull request.

## Requirements

- Node.js **22 or newer** and npm.
- A Chromium browser (Chrome, Edge, Brave, Opera) for manual testing.
- Optional: a Google Cloud OAuth client registered for the extension's pinned
  ID if you need to test real Gmail sends. See
  [Extension ID & Google OAuth](README.md#extension-id--google-oauth).

## Setup

```bash
git clone https://github.com/lucas-vidmar/jarvis-linkedin-chrome-extension.git
cd jarvis-linkedin-chrome-extension
npm ci
npm run dev
```

`npm ci` installs exactly what `package-lock.json` records. `npm run dev` starts
WXT in watch mode and opens a Chromium profile with the extension loaded. If you
prefer to load it manually:

```bash
npm run build
# chrome://extensions → Developer mode → Load unpacked → .output/chrome-mv3
```

You can load the extension without a real Google OAuth client to work on the UI;
Gmail sends will fail until a matching client is configured. The Gmail compose
fallback can still be exercised.

## Checks

Run these before opening a pull request:

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit/DOM suite, single run
npm run build       # WXT production build
npm run validate:manifest  # manifest permissions/scopes/key sanity checks
```

Useful extras:

```bash
npm run test:watch
npx vitest run src/shared/composer.test.ts   # one test file
npm run extension:id                         # print the pinned Chrome extension ID
npm run zip                                  # build a distributable zip
```

The tag-triggered release workflow (`.github/workflows/release.yml`) runs
`npm ci`, `npm test`, `npm run typecheck`, `npm run zip`, and
`npm run validate:manifest` before publishing a release. There is no
pull-request CI workflow yet, so local checks are the gate.

## Architecture map

```
entrypoints/
  background.ts        MV3 service worker: message router, OAuth, Gmail send,
                       watermark writes, recipient settings, compose fallback
  content.ts           LinkedIn content script: thread detection, sync button,
                       scope dropdown, selection mode, notices
  zoho.content.ts      Zoho CRM content script: rocket link lifecycle
  popup/               Extension popup: connect/disconnect, recipient, history
src/
  content/             DOM and content-script logic for LinkedIn and Zoho
  background/          Chrome-side storage logic (watermarks, recipient)
  shared/              Pure, unit-tested logic: composer, scopes, scope-filter,
                       fingerprint, watermark, zoho-url, messages, errors,
                       email, gmail-errors, recipient
scripts/               Manifest validation and extension-ID helpers
docs/manual-qa.md      Browser checklist for LinkedIn, Zoho, and the popup
wxt.config.ts          Manifest, permissions, OAuth scopes, pinned public key
```

The split is deliberate:

- `src/shared` is framework-free and should stay easy to test in Node. Keep
  `chrome.*` and DOM access out of it.
- `src/content` and `src/background` hold the code that needs the DOM or Chrome
  APIs. Keep the browser-specific surface small and move decisions into
  `src/shared` where possible.
- `entrypoints` wire the pieces together. Prefer adding logic to `src/` and
  leaving entrypoints as thin adapters.

Data flow for a LinkedIn sync:

1. The LinkedIn content script detects a stable one-to-one thread and extracts
   messages.
2. The user chooses a scope; `src/shared/scope-filter.ts` applies the watermark
   and time-window rules.
3. `src/shared/composer.ts` builds the email envelope.
4. The content script sends `SEND_SYNC_EMAIL` to the background worker.
5. The background worker gets a Gmail token, sends the message, and advances the
   watermark for scopes that support it.

A failed storage read must not be treated as "nothing stored": that could resend
a whole thread or route data to the default recipient. Existing code throws
`StorageError` for that reason; preserve that distinction.

## Where to add tests

Tests live next to the code as `*.test.ts` and are collected by
[`vitest.config.ts`](vitest.config.ts) from `src/**/*.test.ts`.

| Area | Location | Notes |
| --- | --- | --- |
| Pure logic | `src/shared/*.test.ts` | Default Node environment. Best place for composer, scope filtering, fingerprints, URL mapping, email encoding, and error classification. |
| DOM behavior | `src/content/*.test.ts` | Add `// @vitest-environment happy-dom` as the first line. See `zoho-jarvis-button.test.ts` for a real-DOM style example. |
| Chrome storage | `src/background/*.test.ts` | Mock `globalThis.chrome.storage` as in `storage-failures.test.ts`; include failure modes, not just the happy path. |

Guidelines:

- Add a regression test with every bug fix. A selector change without a test is
  hard to review; include a DOM fixture that represents the new structure.
- Test the failure branch as well as the success branch, especially for storage,
  auth, rate limiting, and malformed responses.
- Keep pure logic pure. If a test needs `chrome.*`, move the decision into
  `src/shared` or put the test in `src/background`.
- Run the single test file while developing, then `npm test` before submitting.

## Updating LinkedIn or Zoho selectors safely

Both sites are single-page apps and change their DOM without notice. Detection is
intentionally defensive; preserve those protections when editing selectors.

### LinkedIn

Selectors are centralized in `SELECTORS` in
[`src/content/detect-conversation.ts`](src/content/detect-conversation.ts).
That object covers:

- thread roots and title/roster clusters;
- participant profile links, names, and avatars;
- the current user's profile link and display name;
- message day groups, message rows, message text, timestamps, and the marker
  that distinguishes the contact's messages from yours;
- the action-row target where the sync button is mounted.

When updating:

1. Prefer stable structural hooks, `aria-*` attributes, or accessible names over
   generated class hashes. Keep the fallback order in each selector array.
2. Do not broaden a selector to "any element that looks close" — a false
   positive can mount the button on a group chat or read the wrong roster.
3. Keep the group-chat rejection in `hasGroupIndicator` intact (`+N`, multiple
   avatars, comma-separated names, `You` in the roster).
4. Keep the two-pass stability check, debounced `MutationObserver`, and
   URL-driven teardown. A selector change that remounts on every DOM mutation
   will make the UI flicker.
5. Add or update a DOM test for the new structure (a new
   `detect-conversation.test.ts` is a reasonable home) and run the LinkedIn
   section of [docs/manual-qa.md](docs/manual-qa.md) against a real thread.

### Zoho

The Zoho behavior lives in
[`src/content/zoho-jarvis-button.ts`](src/content/zoho-jarvis-button.ts):

- `matchesSendEmailLabel` recognizes the "Send Email" control;
- `findSendEmailButton` skips hidden controls and controls inside dialogs, then
  prefers the record action bar;
- `applyReferenceAppearance` copies the reference button's computed styles and
  applies the Jarvis orange;
- the capture-phase click guard stops Zoho's own handler from opening its email
  composer while the rocket still opens a new tab.

When updating:

1. Do not remove the hidden/modal/action-area filters; they prevent the rocket
   from attaching to a decoy inside Zoho's email dialog.
2. Keep the link's `target="_blank"` and `rel="noopener noreferrer"`.
3. Add cases to `zoho-jarvis-button.test.ts` for any new decoy or action-bar
   structure, and verify the button still appears before "Send Email."
4. Host support is centralized in `src/shared/zoho-url.ts`. `ZOHO_CRM_HOSTS`
   feeds both content-script matches and `host_permissions`; update the host
   test and the regional table in the README together. Never add a wildcard
   host or a lookalike domain.
5. Test one non-US data-center host if you have access, and confirm the
   new-tab URL mapping works.

## Commit and pull-request expectations

- Use a short conventional prefix: `feat:`, `fix:`, `docs:`, `test:`, `chore:`,
  or `refactor:`.
- Keep a pull request focused on one change. Separate refactors, behavior
  changes, and documentation-only changes when practical.
- Describe **what** changed, **why**, and how you tested it. Include the browser
  and OS for selector or UI work.
- Add or update tests for logic changes, including failure paths.
- Update [README.md](README.md), [PRIVACY.md](PRIVACY.md),
  [SECURITY.md](SECURITY.md), and/or [docs/manual-qa.md](docs/manual-qa.md) when
  behavior, permissions, data flows, or setup steps change.
- Include before/after screenshots for visible UI changes.
- Do not commit `node_modules/`, `.output/`, `.wxt/`, `.env*` files, private
  keys, tokens, or personal conversation data. Only the public extension key
  belongs in `wxt.config.ts`.
- Do not add analytics, telemetry, remote code loading, or new host permissions
  without a clear privacy and security rationale.
- Keep accessibility intact: labels, focus handling, keyboard behavior, and
  live-region announcements are part of the UI contract.

Before requesting review, run:

```bash
npm run typecheck && npm test
```

and complete the applicable sections of the manual checklist.

## Manual test checklist

The full checklist is in [docs/manual-qa.md](docs/manual-qa.md). At minimum,
verify:

- [ ] LinkedIn: the button appears on a real one-to-one thread after reload and
      SPA navigation, and does **not** appear on group chats or non-thread pages.
- [ ] Scope dropdown: Entire thread, Since last sync, time windows, and selection
      mode all send the expected messages; empty scopes show the expected notice.
- [ ] Since-last-sync: a second sync sends only new messages; the watermark only
      advances for Entire thread and Since last sync.
- [ ] Draft fallback: with Google disconnected, a sync opens a prefilled Gmail
      compose window (not a saved draft); after manual send, **Confirm sent**
      updates the watermark for Entire thread/Since last sync; dismissing does
      not.
- [ ] Retry: a failed send shows an error with **Retry** and **Open draft**, and
      no success notice or watermark change occurs on failure.
- [ ] Zoho: the rocket appears next to Send Email on a contact record, ignores
      hidden/modal decoys, respects the supported regional hosts, and opens the
      matching Jarvis contact in a new tab.
- [ ] Popup: connect/disconnect, recipient save/reset, sync-history reset, empty
      state, and the displayed permissions match the documented set.

## Release process

Releases are cut from a tagged commit. Update the version in `package.json`,
merge the change, then push a `v<version>` tag (for example `v1.2.0`). The
release workflow builds the zip, validates the manifest, and creates the GitHub
release. Update the version table in [SECURITY.md](SECURITY.md) as part of the
release.
