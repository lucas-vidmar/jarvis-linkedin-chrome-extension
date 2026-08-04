import { defineBackground } from 'wxt/utils/define-background';
import {
  GMAIL_SEND_SCOPE,
  type PopupReply,
  type PopupRequest,
} from '@/shared/messages';

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

      return false;
    },
  );
});
