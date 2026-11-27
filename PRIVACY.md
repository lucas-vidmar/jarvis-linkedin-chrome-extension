# Privacy

Jarvis Sync is a Chrome extension that sends a LinkedIn conversation to a
configured **Jarvis** sync recipient as an email from your own Gmail account.
This page describes what the extension reads, sends, and stores. It describes
the code in this repository; it is not a legal contract or a certification.

For the security model and how to report a vulnerability, see
[SECURITY.md](SECURITY.md). For the exact permissions in the built extension,
see [Permissions & privacy](README.md#permissions--privacy).

## Summary

- **Reads:** the LinkedIn conversation you explicitly sync, the profile URLs
  needed to identify its participant, the current Zoho CRM page URL (used only
  to recognize contact records), and the signed-in Chrome profile's email
  address for display.
- **Sends:** one composed sync email per sync, through the Gmail API, to the
  recipient you configure (default `jarvis@agileengine.com`).
- **Stores:** per-conversation sync watermarks in `chrome.storage.local` and the
  sync recipient in `chrome.storage.sync`. It does not store message bodies.
- **Gmail access:** only the `gmail.send` scope. The extension cannot read your
  inbox.
- **Analytics:** none. There is no analytics, tracking, or telemetry code in the
  extension.

## What the extension reads

| Source | Data | When |
| --- | --- | --- |
| LinkedIn conversation page | Message text, timestamps, whether each message is yours or the contact's, the contact's display name and profile URL, and your LinkedIn display name. | Conversation metadata is read while a one-to-one thread is open so the extension can detect it; message text is extracted when you sync. |
| LinkedIn profile page | The LinkedIn profile page HTML, read to resolve an obfuscated `/in/ACo…` slug to a clean `/in/<slug>/` URL. The read is capped at 512 KB. | Only for the contact in the thread being synced, and only when the profile URL uses an obfuscated slug. |
| Zoho CRM page | The current page URL. | On Zoho CRM pages. The extension uses the URL only to recognize a contact record and build the matching Jarvis link. It does not read Zoho contact fields, notes, or emails. |
| Chrome profile / Google identity | The signed-in profile's email address through `chrome.identity.getProfileUserInfo()`. | When the popup opens, to show **Authorized as …**. The address is not put in sync emails. |

The extension does **not** read:

- your Gmail inbox, messages, labels, or attachments;
- LinkedIn messages outside the thread you are syncing;
- Zoho records other than the current page URL;
- your browsing history, other tabs, passwords, or files.

## What the extension sends

### Automatic sync email

When you choose a scope and sync, the background service worker builds a
plain-text email and sends it with the Gmail API
(`gmail.googleapis.com/gmail/v1/users/me/messages/send`) using your Google
account. The email is addressed to the configured sync recipient, which is
`jarvis@agileengine.com` by default and can be changed in the popup.

A sync email contains:

- the contact's display name and cleaned LinkedIn profile URL;
- your LinkedIn display name;
- the chosen scope label and the sync date;
- the selected message text, with sender labels and timestamps;
- a truncation notice if the conversation exceeded the email size limit.

The subject is `LinkedIn sync: <contact name>`. Messages are plain text; there
are no attachments. Because the message is sent through your Gmail account, a
copy normally appears in your Gmail **Sent** folder, and the recipient and any
mail systems they use receive a copy.

### Gmail compose fallback

If Google authorization fails, the extension can open a prefilled Gmail compose
window in a new tab:

```
https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…
```

The recipient, subject, and full email body are placed in the URL's query
parameters so Gmail can prefill the compose form. **This is not a saved Gmail
draft created by the extension.** The extension does not call the Gmail drafts
API or manage drafts; if Gmail autosaves the prefilled compose window itself,
that is Gmail's own behavior. Opening the URL is a request to `mail.google.com`,
so the prefilled content reaches Google as part of that page request. The URL
may also appear in browser history or other browser-level records, just like any
other URL you open.

### Other network requests

- On **Disconnect**, the extension asks Google to revoke the cached token
  (`oauth2.googleapis.com/revoke`).
- The popup HTML references the Montserrat webfont on Google Fonts. If the
  browser loads it, that request goes to Google's font service and carries no
  conversation data.
- There are no analytics endpoints, advertising SDKs, crash reporters, or
  remote logging services.

## What the extension stores

| Storage | Key | Value | Purpose |
| --- | --- | --- | --- |
| `chrome.storage.local` | `watermark:<contactUrl>` | `{ fingerprint, syncedAtEpochMs, lastMessageTimestampMs? }` | Remembers where the last sync ended so **Since last sync** only sends new messages and the popup can show sync history. |
| `chrome.storage.sync` | `syncRecipient` | The recipient email address. | Sends sync emails to the address you chose instead of the factory default. |

The watermark's `fingerprint` is a SHA-256 hash of the sender side, timestamp,
and message text for the last message included in a sync. It is a sync boundary,
not a copy of the message: the extension does not retain message text after the
send completes. The `contactUrl` in the storage key identifies the conversation.
Watermarks are only written after Gmail accepts the message, or after you
confirm a manually sent compose-fallback email, and only for the **Entire
thread** and **Since last sync** scopes. Other scopes leave the previous
watermark in place.

The sync recipient is stored in `chrome.storage.sync`, so if Chrome Sync is
enabled it can roam with your Chrome profile. The extension does not store
Google OAuth tokens in extension storage; Chrome's identity cache manages them
(see [SECURITY.md](SECURITY.md#token-handling)).

The extension does **not** use cookies, `localStorage`, IndexedDB, or a remote
database for application data.

## Retention and reset

### Sync watermarks (per conversation)

Watermarks stay until you reset them or remove the extension.

1. Open the extension popup.
2. Find the conversation under **Synced conversations**.
3. Click **Reset** next to it.

The next sync for that conversation has no watermark, so it defaults to
**Entire thread**. Resetting one conversation does not affect the others.

### Sync recipient

The custom recipient stays until you change it, clear it, or remove the
extension. To return to the factory default, open the popup, clear the
**Sync recipient** field, and click **Save**. The extension then removes the
stored key; it does not keep the old address.

### Clearing everything

There is no single "clear all" button in the popup. To remove all sync history:

- reset each conversation under **Synced conversations**, or
- remove the extension from `chrome://extensions` and reinstall it.

Removing an extension makes Chrome remove that extension's storage from the
Chrome profile. Copies retained by Chrome Sync, browser backups, or your
operating system are outside the extension's control. Disconnecting Google in
the popup before uninstalling also removes the cached token and asks Google to
revoke it; you can additionally review access at
[Google Account permissions](https://myaccount.google.com/permissions).

### Emails already sent

Emails that were already sent are not stored by the extension. Copies may exist
in your Gmail **Sent** folder, in the recipient's mailbox, and in Jarvis or
other systems that process the recipient's mail. The extension cannot delete
those copies; manage them in Gmail or the receiving system.

Uninstalling the extension does not delete emails that were already delivered.

## Gmail scope

The extension requests exactly one Gmail OAuth scope:

```
https://www.googleapis.com/auth/gmail.send
```

This scope lets the extension send email as you. It does **not** grant access to
read, search, list, download, label, delete, or modify messages in your inbox.
The extension requests no Gmail read scope, and it never fetches message content
back from Gmail.

The Google consent screen may describe this as "Send email on your behalf."
Google's OAuth client and consent-screen configuration are described in
[README.md](README.md#extension-id--google-oauth).

If you do not want to grant this access, do not connect Google. The extension
can still open a prefilled Gmail compose window for you to review and send
manually, but that path also requires you to be signed in to Gmail in the
browser.

## Contact and support

For privacy questions or corrections to this page, open an issue at
<https://github.com/lucas-vidmar/jarvis-linkedin-chrome-extension/issues>.
Please do not include real conversation contents, email addresses, or other
personal data in a public issue.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.
