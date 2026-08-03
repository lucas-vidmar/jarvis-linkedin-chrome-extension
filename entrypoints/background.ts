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
          .then(() => {
            safeReply({
              type: 'GET_AUTH_STATUS',
              requestId: message.requestId,
              ok: true,
              data: { connected: true },
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
