# Security Policy

This repository contains the Jarvis Sync Chrome extension. It reads the
LinkedIn conversation you choose to sync and sends it through your own Gmail
account to a configured Jarvis recipient. This page explains how to report a
security problem, how Google tokens are handled, and what the unpacked-extension
trust model means.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.1.x (current release: **1.1.0**) | Yes |
| < 1.1 | No |

The extension has no auto-update: unpacked installs run whatever code is in the
folder they were loaded from. Only the current release is supported for security
fixes. If you are on an older build, update from the repository's latest release
or rebuild from the latest source.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting:

<https://github.com/lucas-vidmar/jarvis-linkedin-chrome-extension/security/advisories/new>

If private advisories are unavailable, open a minimal public issue asking the
maintainer to establish a private channel. Do not include exploit details,
tokens, conversation contents, or personal data in that issue.

A useful report includes:

- the extension version (or commit SHA) and how it was installed;
- browser and operating system versions;
- clear reproduction steps or a proof of concept;
- the impact you believe is possible (for example token exposure, sending mail
  to an unintended recipient, or reading data outside the documented scope);
- whether any real account, token, or conversation data was exposed. Redact or
  replace personal data.

The maintainer will acknowledge the report as soon as practical and coordinate a
fix and disclosure. There is no bug-bounty program and no guaranteed response
time.

### In scope

- the extension source in this repository (`entrypoints/`, `src/`, `scripts/`,
  and `wxt.config.ts`);
- the built manifest, permissions, OAuth configuration, and release packaging;
- ways the extension could exceed the data access described in
  [PRIVACY.md](PRIVACY.md), leak a token, or send a sync email to the wrong
  destination.

### Out of scope

- vulnerabilities in LinkedIn, Zoho, Gmail, Google OAuth, or Chrome itself.
  Report those to the relevant vendor.
- The expected "developer mode extensions" warning for unpacked installs.
- The need to grant `gmail.send` in order to sync.
- OAuth failures caused by an extension ID/client mismatch that is documented in
  the README.
- LinkedIn or Zoho DOM changes that only break the UI.

Do not test against accounts or conversations you do not own or have explicit
permission to use. Use test accounts and redact real data.

## Token handling

- Sign-in uses `chrome.identity.getAuthToken()` with the single scope
  `https://www.googleapis.com/auth/gmail.send`. Interactive consent happens only
  when you click **Connect with Google**; sends request a token
  non-interactively.
- The token is held in memory by the MV3 service worker and Chrome's identity
  cache. It is **not** written to `chrome.storage`, the repository, logs, or any
  analytics service.
- During a send, the token is sent as an `Authorization: Bearer …` header to
  `gmail.googleapis.com`. It is not sent to LinkedIn, Zoho, or any analytics
  service. When Gmail classifies a failure as an auth error, the extension calls
  `chrome.identity.removeCachedAuthToken()` so the stale token is not reused.
- **Disconnect** removes the cached token and calls Google's revoke endpoint
  (`oauth2.googleapis.com/revoke`), sending the token there as a query parameter.
  Disconnecting before uninstalling is the cleanest way to stop future use of the
  cached token. You can also review and revoke access at
  [Google Account permissions](https://myaccount.google.com/permissions).
- Refresh tokens are managed by Chrome and Google. The extension does not
  receive, store, or transmit them itself.

If you believe a token was exposed, disconnect Google in the popup, revoke the
extension's access in your Google Account, review recent Gmail **Sent** mail,
and report the issue privately using the process above.

## Secrets in the repository

- There are **no private keys, client secrets, service-account credentials, or
  refresh tokens** in this repository.
- `wxt.config.ts` ships a **public** `manifest.key` so Chrome derives a stable
  extension ID across installs. The public half is not a secret; the matching
  private key is deliberately absent and must never be committed. See
  [Rotating the key](README.md#rotating-the-key-changes-the-extension-id).
- The Google OAuth **client ID** in `wxt.config.ts` is a public identifier, not a
  secret. Chrome's extension OAuth flow does not require a client secret; none
  should be added to the repository.
- Local `.env` files are git-ignored (`.env*` with `.env.example` explicitly
  allowed). Do not put private material in `.env.example`.
- Build output (`.output/`, `.wxt/`) and dependencies (`node_modules/`) are
  ignored and should not be committed.

If you find a secret committed to the repository or a release artifact, report
it privately rather than opening a public issue. Rotate the affected credential
first if you control it.

## OAuth setup and verification caveats

The extension uses a **pinned** public key so every install has the same Chrome
extension ID (`bhnbdlnlepjoeacilhikmoamcgblnmkp` in the current release). The
Google Cloud OAuth client must be a **Chrome extension** client registered for
that exact ID. If the ID and client do not match, sign-in fails with errors such
as `invalid_client`, "The OAuth client was not found," or a generic `Bad
Request`.

For the maintainer setting up or rotating the client:

1. Build and print the ID with `npm run build && npm run extension:id`.
2. Set the OAuth client's **Application ID / Item ID** to that ID.
3. Enable the Gmail API and include
   `https://www.googleapis.com/auth/gmail.send` on the consent screen.
4. While the app is in **Testing**, only listed test users can sign in; publish
   or complete Google's verification process if other users need access.

Google's OAuth verification is a review of the client and consent screen. It is
**not** a security audit or endorsement of this repository. The extension does
not bypass Google's consent, test-user, or verification controls. Google may
also apply its own limits to unpublished apps, such as test-user access and
token lifetimes.

Rotating the key changes the extension ID and invalidates existing OAuth
registrations. Every user must update to the matching build and reconnect
Google. Only the public key belongs in the repository.

## Unpacked-extension trust model

This extension is distributed as an **unpacked** Chrome extension, not through
the Chrome Web Store. That has security consequences:

- **There is no store review and no automatic update.** Chrome cannot patch the
  code for you. You are responsible for downloading updates and reloading the
  extension.
- **The code runs with the permissions it requests.** It can read the DOM of
  LinkedIn and supported Zoho CRM pages, send email through your Google account,
  and store the documented settings. It does not request `<all_urls>`, but that
  does not make an untrusted build safe.
- **Anyone who can modify the installed folder can change the extension's
  behavior.** Do not install a zip or folder from a source you do not trust, and
  do not leave the folder writable by other users.
- **Developer mode is expected.** Chrome shows a "developer mode extensions"
  warning when unpacked extensions are enabled. Dismissing it does not grant any
  additional access; it is a consequence of the install method.

Recommended practice:

1. Install from the repository's release page or build from source yourself.
2. If you need high assurance, run `npm ci`, `npm test`, `npm run typecheck`,
   `npm run build`, and `npm run validate:manifest` from the commit you intend to
   run, then load that build.
3. Check `npm run extension:id` matches the OAuth client's Application ID.
4. Grant Google access only if you trust the build. The extension can send mail
   as you; that is the purpose of `gmail.send`.
5. Disconnect Google and remove the extension when you no longer need it.

## Dependency and release hygiene

- Dependencies are pinned by `package-lock.json`; use `npm ci` for reproducible
  installs.
- The release workflow builds from the selected commit/tag and runs the test,
  typecheck, build, and manifest-validation steps before publishing the zip.
- Review dependency and workflow changes like any other code change. Do not add
  remote code loading, analytics, or new host permissions without a documented
  reason and a privacy review.

## Contact

For non-security privacy questions, see [PRIVACY.md](PRIVACY.md). For ordinary
bugs and feature requests, use the
[issue tracker](https://github.com/lucas-vidmar/jarvis-linkedin-chrome-extension/issues).
