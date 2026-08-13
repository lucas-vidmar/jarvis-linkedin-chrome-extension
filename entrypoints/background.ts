import { defineBackground } from 'wxt/utils/define-background';
import {
  GMAIL_SEND_SCOPE,
  type PopupReply,
  type PopupRequest,
  type SyncEmailReply,
} from '@/shared/messages';
import { advanceWatermark } from '@/background/watermark';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_SEND_TIMEOUT_MS = 30_000;
const GMAIL_COMPOSE_URL_PREFIX = 'https://mail.google.com/mail/';
const GMAIL_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const inFlightByContact = new Set<string>();
const inFlightSyncIds = new Set<string>();

function authErrorReply(
  type: PopupRequest['type'],
  requestId: string,
  message: string,
): Extract<PopupReply, { ok: false }> {
  return {
    type,
    requestId,
    ok: false,
    error: { code: 'AUTH_FAILED', message, retryable: true },
  };
}

function syncErrorReply(
  requestId: string,
  error: { code: string; message: string; retryable: boolean },
): SyncEmailReply {
  return { type: 'SEND_SYNC_EMAIL', requestId, ok: false, error };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeaderValue(value: string): string {
  const ascii = /^[\x00-\x7F]*$/.test(value);
  if (ascii) return value;
  const encoded = toBase64Url(new TextEncoder().encode(value));
  return `=?UTF-8?B?${encoded}?=`;
}

function buildRawMessage(envelope: { to: string; subject: string; body: string }): string {
  const headers = [
    `To: ${sanitizeHeaderValue(envelope.to)}`,
    `Subject: ${encodeHeaderValue(sanitizeHeaderValue(envelope.subject))}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ].join('\r\n');
  const raw = `${headers}\r\n\r\n${envelope.body.replace(/\r?\n/g, '\r\n')}`;
  return toBase64Url(new TextEncoder().encode(raw));
}

async function classifySendError(
  status: number,
  body: string,
): Promise<{ code: string; message: string; retryable: boolean }> {
  let gmailReason = '';
  let gmailStatus = '';
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: number; message?: string; status?: string };
    };
    gmailReason = parsed.error?.message ?? '';
    gmailStatus = parsed.error?.status ?? '';
  } catch {
    // Non-JSON error body; fall through to status-based classification.
  }

  console.log('[jarvis-sync] gmail send error:', status, gmailStatus, gmailReason);

  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_FAILED',
      message: gmailReason
        ? `Gmail rejected the send: ${gmailReason}`
        : 'Google could not authorize the send. Reconnect to sync.',
      retryable: true,
    };
  }
  if (status === 408 || status === 409 || status === 412 || status === 413 || status === 429) {
    return { code: 'SEND_FAILED', message: 'Gmail could not send the message. Try again shortly.', retryable: true };
  }
  if (status >= 500) {
    return { code: 'SEND_FAILED', message: 'Gmail could not send the message.', retryable: true };
  }
  return { code: 'SEND_FAILED', message: 'The message could not be sent.', retryable: false };
}

async function sendSyncEmail(
  message: Extract<PopupRequest, { type: 'SEND_SYNC_EMAIL' }>,
): Promise<SyncEmailReply> {
  const { requestId, syncId, contactUrl, envelope } = message;

  if (inFlightByContact.has(contactUrl)) {
    return syncErrorReply(requestId, {
      code: 'SYNC_IN_PROGRESS',
      message: 'A sync for this conversation is already in progress.',
      retryable: true,
    });
  }

  if (inFlightSyncIds.has(syncId)) {
    return syncErrorReply(requestId, {
      code: 'SEND_IN_PROGRESS',
      message: 'This sync attempt is already in flight.',
      retryable: true,
    });
  }

  const send = async (): Promise<SyncEmailReply> => {
    let token: string;
    try {
      const result = await chrome.identity.getAuthToken({
        interactive: false,
        scopes: [GMAIL_SEND_SCOPE],
      });
      if (!result.token) {
        return syncErrorReply(requestId, {
          code: 'AUTH_FAILED',
          message: 'Not connected to Google. Reconnect in settings to sync.',
          retryable: true,
        });
      }
      token = result.token;
    } catch {
      return syncErrorReply(requestId, {
        code: 'AUTH_FAILED',
        message: 'Not connected to Google. Reconnect in settings to sync.',
        retryable: true,
      });
    }

    inFlightSyncIds.add(syncId);

    try {
      const raw = buildRawMessage(envelope);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GMAIL_SEND_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(GMAIL_SEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 401 || response.status === 403) {
          await chrome.identity.removeCachedAuthToken({ token }).catch(() => undefined);
        }
        return syncErrorReply(requestId, await classifySendError(response.status, errorBody));
      }

      const data = (await response.json()) as { id?: string };
      if (!data.id) {
        return syncErrorReply(requestId, {
          code: 'SEND_FAILED',
          message: 'Gmail did not return a message id.',
          retryable: false,
        });
      }

      await advanceWatermark(contactUrl, envelope.lastMessageFingerprint, envelope.composedAtEpochMs);

      return {
        type: 'SEND_SYNC_EMAIL',
        requestId,
        ok: true,
        data: { messageId: data.id },
      };
    } finally {
      inFlightSyncIds.delete(syncId);
    }
  };

  const pending = send();
  inFlightByContact.add(contactUrl);
  try {
    return await pending;
  } finally {
    inFlightByContact.delete(contactUrl);
  }
}

async function disconnectGoogle(): Promise<boolean> {
  let token: string | undefined;
  try {
    const result = await chrome.identity.getAuthToken({
      interactive: false,
      scopes: [GMAIL_SEND_SCOPE],
    });
    token = result.token;
  } catch {
    // No cached token — the desired end state already holds. Chrome gives no
    // reliable error signal to distinguish "no cached token" from a transient
    // error, so this is treated as an idempotent success (the same semantic
    // GET_AUTH_STATUS uses for `connected: false`).
    return true;
  }

  if (token) {
    await chrome.identity.removeCachedAuthToken({ token });
    await fetch(`${GMAIL_OAUTH_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }).catch(() => undefined);
  }
  return true;
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (
      message: PopupRequest,
      sender,
      sendResponse: (reply: PopupReply) => void,
    ) => {
      if (sender.id !== chrome.runtime.id) {
        return false;
      }

      if (!chrome.identity) {
        sendResponse(
          authErrorReply(
            message?.type ?? 'GET_AUTH_STATUS',
            message?.requestId ?? '',
            'Google sign-in could not be completed. The identity permission is missing.',
          ),
        );
        return false;
      }

      const safeReply = (reply: PopupReply): void => {
        try {
          sendResponse(reply);
        } catch {
          // Popup closed before the reply could be delivered; nothing to surface.
        }
      };

      if (message?.type === 'GET_AUTH_STATUS') {
        chrome.identity
          .getAuthToken({ interactive: false, scopes: [GMAIL_SEND_SCOPE] })
          .then(async () => {
            let email: string | undefined;
            try {
              const profile = await chrome.identity.getProfileUserInfo();
              email = profile.email || undefined;
            } catch {
              email = undefined;
            }
            safeReply({
              type: 'GET_AUTH_STATUS',
              requestId: message.requestId,
              ok: true,
              data: { connected: true, email },
            });
          })
          .catch(() => {
            safeReply({
              type: 'GET_AUTH_STATUS',
              requestId: message.requestId,
              ok: true,
              data: { connected: false },
            });
          });
        return true;
      }

      if (message?.type === 'DISCONNECT_GOOGLE') {
        disconnectGoogle()
          .then(() => {
            safeReply({
              type: 'DISCONNECT_GOOGLE',
              requestId: message.requestId,
              ok: true,
              data: { disconnected: true },
            });
          })
          .catch(() => {
            safeReply(
              authErrorReply(
                'DISCONNECT_GOOGLE',
                message.requestId,
                'Could not disconnect. Please try again.',
              ),
            );
          });
        return true;
      }

      if (message?.type === 'CONNECT_GOOGLE') {
        chrome.identity
          .getAuthToken({ interactive: true, scopes: [GMAIL_SEND_SCOPE] })
          .then(() => {
            safeReply({
              type: 'CONNECT_GOOGLE',
              requestId: message.requestId,
              ok: true,
              data: { connected: true },
            });
          })
          .catch((error: unknown) => {
            const detail = error instanceof Error ? error.message : '';
            safeReply(
              authErrorReply(
                'CONNECT_GOOGLE',
                message.requestId,
                detail
                  ? `Google sign-in could not be completed. ${detail}`
                  : 'Google sign-in could not be completed. Please try again.',
              ),
            );
          });
        return true;
      }

      if (message?.type === 'SEND_SYNC_EMAIL') {
        sendSyncEmail(message)
          .then((reply) => safeReply(reply))
          .catch(() => {
            safeReply(
              syncErrorReply(message.requestId, {
                code: 'SEND_FAILED',
                message: 'The message could not be sent.',
                retryable: true,
              }),
            );
          });
        return true;
      }

      if (message?.type === 'OPEN_DRAFT_FALLBACK') {
        if (typeof message.url !== 'string' || !message.url.startsWith(GMAIL_COMPOSE_URL_PREFIX)) {
          safeReply({
            type: 'OPEN_DRAFT_FALLBACK',
            requestId: message.requestId,
            ok: false,
            error: {
              code: 'SEND_FAILED',
              message: 'Could not open the draft.',
              retryable: false,
            },
          });
          return false;
        }
        chrome.tabs
          .create({ url: message.url })
          .then(() => {
            safeReply({
              type: 'OPEN_DRAFT_FALLBACK',
              requestId: message.requestId,
              ok: true,
              data: { opened: true },
            });
          })
          .catch(() => {
            safeReply({
              type: 'OPEN_DRAFT_FALLBACK',
              requestId: message.requestId,
              ok: false,
              error: {
                code: 'SEND_FAILED',
                message: 'Could not open the draft. Try again.',
                retryable: true,
              },
            });
          });
        return true;
      }

      if (message?.type === 'CONFIRM_DRAFT_SENT') {
        const hasValidFingerprint =
          message.lastMessageFingerprint === null ||
          (typeof message.lastMessageFingerprint === 'string' &&
            /^[0-9a-f]{64}$/.test(message.lastMessageFingerprint));
        if (
          typeof message.contactUrl !== 'string' ||
          typeof message.syncId !== 'string' ||
          typeof message.composedAtEpochMs !== 'number' ||
          !Number.isFinite(message.composedAtEpochMs) ||
          !hasValidFingerprint
        ) {
          safeReply({
            type: 'CONFIRM_DRAFT_SENT',
            requestId: message.requestId,
            ok: false,
            error: {
              code: 'SEND_FAILED',
              message: 'Could not confirm the draft. Reload the tab and try again.',
              retryable: true,
            },
          });
          return false;
        }
        const replyConfirmed = (): void => {
          console.log('[jarvis-sync] draft confirmed sent:', message.contactUrl, message.syncId);
          safeReply({
            type: 'CONFIRM_DRAFT_SENT',
            requestId: message.requestId,
            ok: true,
            data: { confirmed: true },
          });
        };
        advanceWatermark(
          message.contactUrl,
          message.lastMessageFingerprint,
          message.composedAtEpochMs,
        ).then(replyConfirmed, replyConfirmed);
        return true;
      }

      return false;
    },
  );
});
