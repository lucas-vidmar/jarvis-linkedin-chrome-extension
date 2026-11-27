# Manual QA checklist

Use this checklist before a release or after changing LinkedIn/Zoho selectors,
the popup, storage, OAuth, or the email composer. Automated tests cover the pure
logic; this checklist covers the browser behavior that unit tests cannot.

Record the build under test:

| Field | Value |
| --- | --- |
| Extension version / commit | |
| Browser and version | |
| OS | |
| Tester and date | |
| LinkedIn account type | |
| Zoho data center | |
| Test sync recipient | |

## Before you start

1. Use a test LinkedIn conversation and a Zoho test/sandbox contact. Do not use
   real customer conversations.
2. Set a **test sync recipient** in the popup (for example your own address) so
   QA mail does not go to the production Jarvis inbox.
3. Build and load the extension:

   ```bash
   npm ci
   npm run build
   # chrome://extensions → Developer mode → Load unpacked → .output/chrome-mv3
   ```

4. Open the browser console on the LinkedIn/Zoho tabs. The extension logs
   `[jarvis-sync]` and `[jarvis-zoho]` diagnostics; a `SELECTOR_MISMATCH` warning
   means the page structure no longer matches the selectors.
5. Keep the popup and `chrome://extensions` available for permission and storage
   checks.

## 1. LinkedIn

### 1.1 Detection and mounting

- [ ] Open a one-to-one LinkedIn messaging thread
      (`https://www.linkedin.com/messaging/thread/<id>/`).
- [ ] Within about a second, a **Sync** button appears in the thread title bar,
      above the message box. Its accessible name is **Sync conversation to Zoho
      CRM**.
- [ ] Hovering, scrolling, and receiving a new message do not create duplicate
      buttons or make the button flicker.
- [ ] Reload the page. The button returns.
- [ ] Navigate between two threads with LinkedIn's client-side routing. The
      button remains available and is associated with the new thread, with no
      stale contact name or URL.
- [ ] Open the messaging list or a non-messaging LinkedIn page. No Sync button
      is present.
- [ ] If the button does not appear on a normal thread, check the console after
      three detection passes for `SELECTOR_MISMATCH`; record the thread URL and
      the DOM structure that no longer matches.

### 1.2 Group-chat rejection

- [ ] Open a group conversation (three or more participants, or a thread whose
      roster shows `+N`, multiple avatars, or comma-separated names). No Sync
      button appears.
- [ ] Open a one-to-one thread from the same account. The button appears again.
- [ ] A thread with a single participant plus your own profile must still be
      treated as one-to-one; the button should appear.

### 1.3 Scope dropdown

- [ ] On a conversation with **no stored watermark** (first sync, or after
      resetting the conversation), click **Sync**. The dropdown defaults to
      **Entire thread**.
- [ ] The dropdown lists **Selected messages**, **Since last sync**, **Last
      day**, **Last week**, and **Entire thread**, with captions.
- [ ] **Since last sync** shows a "first sync" caption when there is no
      watermark.
- [ ] Message counts next to the scopes match the visible conversation; for a
      long thread that only has a window loaded, **Entire thread** shows the
      truncation note.
- [ ] Choosing **Entire thread** sends the conversation and shows the current
      success copy (see the copy note in 1.9).
- [ ] After a successful sync, reopen the dropdown. It defaults to **Since last
      sync**.
- [ ] **Last day** and **Last week** include only messages in the window and
      exclude older messages.
- [ ] Clicking outside the dropdown or pressing Escape closes it without
      sending.

### 1.4 Selection mode

- [ ] Choose **Selected messages**. The dropdown closes and selection mode
      starts with a sticky bar showing a count.
- [ ] Click message rows to select and deselect them. Selected rows are
      visually marked, and the count updates.
- [ ] The sync button in the bar is disabled at zero selected messages.
- [ ] With one or more selected, the button reads **Sync N selected**; clicking
      it sends only those messages.
- [ ] Keyboard: Tab reaches the controls; Enter/Space toggles a focused row;
      Escape or **Cancel** exits selection mode without sending.
- [ ] Navigating to another thread or page exits selection mode and removes the
      bar.
- [ ] A successful selected-message sync shows "Sync point unchanged for this
      scope" copy and does **not** move the watermark.

### 1.5 Since-last-sync and watermark scope

Use a second LinkedIn account to send a new message after a sync.

- [ ] Sync the full thread. Confirm the popup now lists the conversation.
- [ ] Send a new reply from the other account. Sync again with **Since last
      sync**. Only the new message(s) are emailed.
- [ ] Sync again with no new messages. The notice says **Nothing to sync in
      this window yet.** and no email is sent.
- [ ] Sync with **Last day** or **Selected messages** after a full sync. The
      previous watermark is preserved; the success copy says the sync point is
      unchanged.
- [ ] On a long thread where the last-synced message is no longer loaded, sync
      with **Since last sync**. The timestamp fallback is used; older loaded
      messages are not sent again if they are older than the watermark. If the
      boundary cannot be established, the extension conservatively sends the
      loaded window; record this behavior rather than treating a duplicate as a
      failure.
- [ ] Message text containing emoji, accented characters, and links is preserved
      in the email.

### 1.6 Draft fallback (prefilled Gmail compose, not a saved draft)

- [ ] Disconnect Google in the popup, or revoke the token in your Google Account.
- [ ] Sync a conversation. The extension opens a new tab at
      `https://mail.google.com/mail/?view=cm&fs=1…` with the recipient, subject,
      and body prefilled.
- [ ] Confirm this is a **compose window**, not an extension-created draft. The
      extension does not call the Gmail drafts API. If Gmail autosaves the
      prefilled compose window into **Drafts**, note it as Gmail behavior, not
      an extension feature.
- [ ] The LinkedIn page shows **Draft opened for review. After you send it,
      confirm here.** with **Confirm sent** and **Dismiss** actions.
- [ ] Send the email manually from Gmail, return to LinkedIn, and click
      **Confirm sent**. The notice says **Draft confirmed.** and the popup's
      history timestamp/watermark updates for an advancing scope.
- [ ] Repeat with **Dismiss**. No confirmation is recorded and the watermark
      does not advance.
- [ ] Repeat with **Selected messages**, **Last day**, or **Last week**, then
      confirm. The notice says the sync point is unchanged, and the previous
      watermark remains.
- [ ] If the browser is not signed in to Gmail, the compose URL still opens and
      asks for sign-in. The extension does not send the email through the Gmail
      API in this path, but the URL itself (including the prefilled recipient,
      subject, and body) is still opened on `mail.google.com`, so Google
      receives it as part of the page request.

### 1.7 Error and retry

- [ ] Go offline (or block `gmail.googleapis.com` in DevTools), then sync. The
      page shows an error notice such as `Couldn't sync — Send error…` with
      **Retry** and **Open draft**.
- [ ] No success notice appears, no watermark is written, and the popup history
      is unchanged after a failed send.
- [ ] Go back online and click **Retry**. The send succeeds with the same
      scope/messages and the success notice appears.
- [ ] Force an auth failure (disconnect/revoke). The extension follows the
      draft-fallback path automatically instead of only showing a retry error.
- [ ] If you can simulate a Gmail rate limit, verify the **Rate limit** wording
      and that retrying later works.
- [ ] If storage writes fail (simulate by making `chrome.storage.local.set`
      throw in a development build), a successful Gmail send must show **Sent,
      but sync progress could not be saved. Re-syncing may resend these
      messages.** Do not claim the sync point moved.
- [ ] A failed watermark read must show an error and must not silently treat the
      conversation as a first sync or send to the default recipient.

### 1.8 Truncation and formatting

- [ ] Sync a thread whose composed body exceeds the email size limit. The email
      ends with a truncation notice naming the number of omitted messages, and
      the sync still succeeds.
- [ ] A contact name with non-ASCII characters produces a readable subject line
      (RFC 2047 encoding), not mojibake.
- [ ] Header-like text in a contact name cannot inject extra email headers
      (covered by `src/shared/email.test.ts`; spot-check the result if the name
      source changes).

### 1.9 Expected copy and known inconsistency

The current LinkedIn success notice says **"Synced to Zoho."** (and
**"Synced to Zoho. Sync point unchanged for this scope."**). The email actually
goes to the configured **Jarvis** recipient, not Zoho. This is a known UI copy
inconsistency; the source has not been changed in the documentation pass. Treat
the Zoho wording in the toast/popup headline as legacy copy during QA.

## 2. Zoho CRM

### 2.1 Button placement

- [ ] Open a contact record on a supported Zoho CRM host. The orange **🚀**
      button appears immediately **before** the **Send Email** control in the
      record action bar; its accessible name is **Open in Jarvis**.
- [ ] The button adopts the Send Email button's size, font, and alignment, with
      the Jarvis orange background. It remains readable at rest, hover, and
      focus.
- [ ] The button does not appear on list views, reports, settings, or other
      non-contact pages.
- [ ] Reloading the page and navigating between contacts with client-side
      routing updates the Jarvis URL and never leaves a stale link.
- [ ] Rapid Zoho re-renders/hover changes do not create duplicate rockets.

### 2.2 Hidden decoys are ignored

- [ ] Open a contact whose page contains a hidden or off-screen "Send Email"
      control (for example inside collapsed markup). The rocket stays attached to
      the visible record action, not the hidden control.
- [ ] Open Zoho's email compose dialog. A "Send Email" control inside the
      dialog/modal must be ignored; no rocket is inserted there.
- [ ] A "Send Email" label inside another dialog, panel, or toolbar does not
      produce an extra rocket or steal the mount target.
- [ ] Clicking the rocket does not open Zoho's email composer (the click guard
      works) and does not trigger the underlying Send Email handler.

### 2.3 Regional host behavior

Supported hosts are defined in
[`src/shared/zoho-url.ts`](../src/shared/zoho-url.ts). Test at least the US host
and one non-US host that you have access to:

| Region | Host | Tested |
| --- | --- | --- |
| United States | `crm.zoho.com` | [ ] |
| Europe | `crm.zoho.eu` | [ ] |
| India | `crm.zoho.in` | [ ] |
| Australia | `crm.zoho.com.au` | [ ] |
| Japan | `crm.zoho.jp` | [ ] |
| China | `crm.zoho.com.cn` | [ ] |
| Canada | `crm.zohocloud.ca` | [ ] |
| Saudi Arabia | `crm.zoho.sa` | [ ] |
| United Arab Emirates | `crm.zoho.ae` | [ ] |
| Singapore | `crm.zoho.sg` | [ ] |

- [ ] On each tested host, a contact record maps to
      `https://jarvis.agileengine.com/contacts/<recordId>`.
- [ ] An unsupported Zoho host or a lookalike domain such as
      `crm.zoho.evil.com` does not load the content script and shows no button.
- [ ] The host list in the built manifest matches the list above (inspect
      `manifest.json` or run `npm run validate:manifest`).

### 2.4 New-tab navigation

- [ ] Click the rocket. Jarvis opens in a **new tab** at the matching contact
      URL; the Zoho tab stays on the record page.
- [ ] The new tab uses `noopener`/`noreferrer` behavior (the Jarvis page cannot
      reach back through `window.opener`).
- [ ] Zoho's "Send Email" dialog does not open before, during, or after the
      click.
- [ ] Navigating from a contact to a list and back re-adds the rocket correctly;
      navigating away removes it without a stale link.

## 3. Popup

### 3.1 Connect and disconnect

- [ ] With Google disconnected, the popup shows **Connect with Google** and the
      send-only explanation. The **Sync recipient** and **Synced conversations**
      sections are still usable.
- [ ] Click **Connect with Google**; complete the Google consent screen. The
      button shows progress and then the connected view.
- [ ] The connected view shows **Connected with Google** and, when available,
      **Authorized as <email>**. If the profile email is unavailable, the line
      is hidden but connection state and syncing still work.
- [ ] Click **Disconnect**. The popup returns to the disconnected view and
      announces the change.
- [ ] After disconnecting, a LinkedIn sync follows the compose-fallback path and
      does not silently fail without an action.
- [ ] Reload the popup; the connection state matches the background state.

### 3.2 Recipient save and reset

- [ ] Enter a valid test address and click **Save**. The confirmation names the
      address, and the value persists after closing/reopening the popup.
- [ ] Sync a conversation. The composed email's **To** field is the saved test
      address, not `jarvis@agileengine.com`.
- [ ] Clear the field and click **Save**. The popup reports that it is using the
      default; reopening the popup leaves the field blank (default).
- [ ] Sync again. The email goes to the default
      `jarvis@agileengine.com` (or the build-time default, if configured).
- [ ] Enter an invalid address and save. The popup shows an error and does not
      overwrite the previously saved address.
- [ ] Enter an address with leading/trailing spaces. It is trimmed and saved
      correctly.
- [ ] Trigger a storage failure (development build). The popup shows an error
      and does not claim the recipient was saved.

### 3.3 Sync history and reset

- [ ] After a successful sync, **Synced conversations** lists the conversation
      by host/path with a **Synced** date/time, newest first.
- [ ] With no history, the empty state **No conversations synced yet.** is
      visible.
- [ ] Click **Reset** on one conversation. Its row disappears, the action is
      announced, and other rows remain.
- [ ] Reopen the thread's scope dropdown. With no watermark, it defaults to
      **Entire thread** again.
- [ ] Reset the last remaining row; the empty state returns.
- [ ] If a reset fails (storage failure), the row stays and an error is shown;
      do not silently remove it.
- [ ] Sync history is not shared across Chrome profiles unless Chrome Sync
      carries the recipient setting; watermarks are local to the profile.

### 3.4 Permission display

- [ ] The connect screen explains that Google is used to **send** sync emails on
      your behalf.
- [ ] Open `chrome://extensions` → **Jarvis Sync** → **Details**. The displayed
      permissions/site access match the documented set: `identity`,
      `identity.email`, `storage`, LinkedIn, the supported Zoho hosts, and the
      Google API hosts.
- [ ] The extension requests **no** Gmail read/list scope. On the Google consent
      screen, only a send permission is requested (wording such as "Send email
      on your behalf"); there is no "Read your email messages" or similar
      inbox permission.
- [ ] No notifications, downloads, tabs, cookies, or broad `<all_urls>` access
      appear in the built manifest that is not documented.
- [ ] `npm run validate:manifest` passes for the same build.

## 4. Data and privacy spot checks

- [ ] In DevTools → Application → Extension storage, `chrome.storage.local`
      contains only `watermark:<contactUrl>` entries with a 64-character hex
      fingerprint, compose timestamp, and optional last-message timestamp. No
      message text is present.
- [ ] `chrome.storage.sync` contains only the `syncRecipient` value (or is
      empty when the default is used).
- [ ] The Network panel during a sync shows only the expected Gmail send/OAuth
      requests (plus the LinkedIn profile fetch when resolving an obfuscated
      slug). There are no analytics, tracking, or telemetry requests.
- [ ] The popup's Google Fonts request (if loaded) sends no conversation data.
- [ ] A manually sent fallback email is visible in Gmail's **Sent** folder and
      at the recipient, as expected; the extension has no copy of it.

## 5. Cleanup

- [ ] Disconnect Google in the popup (removes the cached token and requests
      revocation).
- [ ] Remove test watermarks with **Reset**, or remove and reinstall the
      extension.
- [ ] Delete test emails if they went to a shared mailbox.
- [ ] Remove the unpacked extension from `chrome://extensions` if it was loaded
      only for QA.

## Sign-off

| Area | Result | Notes |
| --- | --- | --- |
| LinkedIn detection and group rejection | Pass / Fail | |
| Scope dropdown and selection mode | Pass / Fail | |
| Since-last-sync and watermarks | Pass / Fail | |
| Draft fallback | Pass / Fail | |
| Error and retry | Pass / Fail | |
| Zoho button, decoys, hosts | Pass / Fail | |
| Popup connect/disconnect | Pass / Fail | |
| Popup recipient and history | Pass / Fail | |
| Permissions and privacy spot checks | Pass / Fail | |

Block a release for any failure that sends the wrong messages, sends to the
wrong recipient, loses sync progress without telling the user, exposes data
beyond [PRIVACY.md](../PRIVACY.md), or mounts the Zoho button on a decoy.
