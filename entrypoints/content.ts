import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  detectConversation,
  findThreadRoot,
  getSelfName,
  isConversationThread,
  rosterSignature,
  resetSelectorMismatchState,
  resetSelfSlugCache,
  type ConversationDetection,
} from '@/content/detect-conversation';
import {
  hasSyncButton,
  mountSyncButton,
  unmountSyncButton,
} from '@/content/sync-button';
import { countVisibleMessages } from '@/content/message-counter';
import {
  closeScopeDropdown,
  isScopeDropdownOpen,
  openScopeDropdown,
} from '@/content/scope-dropdown';
import { defaultScope, type ScopeId } from '@/shared/scopes';
import { composeJarvisEnvelope } from '@/shared/composer';
import { filterMessagesByScope } from '@/shared/scope-filter';
import { setPendingScope, setPendingEnvelope } from '@/content/sync-state';
import { extractMessages } from '@/content/extract-messages';
import {
  enterSelectionMode,
  exitSelectionMode,
  isSelectionModeActive,
} from '@/content/selection-mode';
import { readWatermark } from '@/content/read-watermark';
import { detectThreadTruncation } from '@/content/thread-truncation';
import { sendSyncEmail } from '@/content/send-sync';
import { confirmDraftSent, openDraftFallback } from '@/content/draft-fallback';
import { showSyncError, showSyncInProgress, showSyncPrompt, showSyncSuccess, dismissSyncNotices } from '@/content/sync-notice';
import { failureReasonLabel } from '@/shared/errors';
import type { ComposerMessage, JarvisEnvelope } from '@/shared/composer';
import { resolveCleanProfileUrl } from '@/content/resolve-profile-url';

const OBSERVER_DEBOUNCE_MS = 250;
const OBSERVER_MAX_WAIT_MS = 750;
const STABILITY_PASSES = 2;
const UNSTABLE_PASSES_BEFORE_UNMOUNT = 2;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
let mutationSinceLastPass = true;
let lastCountedAt = 0;
let stableDetection: ConversationDetection = { kind: 'none' };
let stableSignature: string | null = null;
let mountedKey: string | null = null;
let consecutiveMatches = 0;
let consecutiveMisses = 0;
let lastPathname: string | null = null;
let draftFallbackOpening = false;

function detectionKeyFor(pathname: string, contactUrl: string): string {
  return `${pathname}:${contactUrl}`;
}

function isCurrentThread(contactUrl: string): boolean {
  if (!isConversationThread(document.location.href)) return false;
  const root = findThreadRoot(document);
  if (!root) return false;
  const detection = detectConversation(document);
  return detection.kind === 'conversation' && detection.contact.contactUrl === contactUrl;
}

function runDraftFallback(threadUrl: string, envelope: JarvisEnvelope): void {
  if (draftFallbackOpening) return;
  draftFallbackOpening = true;
  openDraftFallback({ contactUrl: threadUrl, envelope })
    .then(() => {
      if (!isCurrentThread(threadUrl)) return;
      showSyncPrompt('Draft opened for review. After you send it, confirm here.', [
        {
          label: 'Confirm sent',
          onActivate: () => {
            if (!isCurrentThread(threadUrl)) {
              dismissSyncNotices();
              return;
            }
            confirmDraftSent({
              contactUrl: threadUrl,
              syncId: crypto.randomUUID(),
              lastMessageFingerprint: envelope.lastMessageFingerprint,
              composedAtEpochMs: envelope.composedAtEpochMs,
            })
              .then(() => {
                if (!isCurrentThread(threadUrl)) return;
                showSyncSuccess('Draft confirmed.');
              })
              .catch(() => {
                if (!isCurrentThread(threadUrl)) return;
                showSyncError('Could not confirm the draft. Try again.');
              });
          },
        },
        {
          label: 'Dismiss',
          onActivate: () => {
            // No confirmation is reported; the watermark never advances (FR-17).
            dismissSyncNotices();
          },
        },
      ]);
    })
    .catch((fallbackError: { message?: string }) => {
      if (!isCurrentThread(threadUrl)) return;
      console.log('[jarvis-sync] draft fallback failed');
      showSyncError(fallbackError?.message?.trim() || 'Could not open the draft. Try again.');
    })
    .finally(() => {
      draftFallbackOpening = false;
    });
}

function attemptSend(threadUrl: string, envelope: JarvisEnvelope): Promise<void> {
  return sendSyncEmail({ contactUrl: threadUrl, envelope })
    .then((result) => {
      if (!isCurrentThread(threadUrl)) return;
      console.log('[jarvis-sync] sent:', result.messageId);
      showSyncSuccess('Synced to Zoho.');
    })
    .catch((error: { code?: string; message?: string }) => {
      if (!isCurrentThread(threadUrl)) return;
      if (error?.code === 'AUTH_FAILED') {
        runDraftFallback(threadUrl, envelope);
        return;
      }
      const reason = failureReasonLabel(error?.code ?? 'SEND_FAILED');
      console.log('[jarvis-sync] send failed:', error?.code ?? 'SEND_FAILED');
      showSyncError(`Couldn't sync — ${reason}. ${error?.message?.trim() || 'Try again.'}`, [
        {
          label: 'Retry',
          onActivate: () => {
            if (!isCurrentThread(threadUrl)) {
              dismissSyncNotices();
              return;
            }
            showSyncInProgress('Syncing…');
            attemptSend(threadUrl, envelope);
          },
        },
        {
          label: 'Open draft',
          onActivate: () => {
            if (!isCurrentThread(threadUrl)) {
              dismissSyncNotices();
              return;
            }
            runDraftFallback(threadUrl, envelope);
          },
        },
      ]);
    });
}

function openDropdownForButton(
  button: HTMLElement,
  threadRoot: HTMLElement,
  contact: { contactName: string; contactUrl: string },
): void {
  const messageCount = countVisibleMessages(threadRoot);
  const extraction = extractMessages(threadRoot, contact);
  void readWatermark(contact.contactUrl)
    .then((watermark) => {
      if (isScopeDropdownOpen()) return;
      if (!button.isConnected || !threadRoot.isConnected) return;
      const hasWatermark = watermark !== null;
      const countForScope = async (scope: ScopeId): Promise<number> => {
        const messages = await extraction;
        return filterMessagesByScope(messages, scope, new Date(), {
          watermarkFingerprint: watermark?.fingerprint ?? null,
        }).length;
      };
      openScopeDropdown({
        anchor: button,
        threadRoot,
        selectedScope: defaultScope(hasWatermark),
        hasWatermark,
        threadTruncated: detectThreadTruncation(threadRoot),
        messageCount,
        countForScope,
        onSelectSelected: () => {
          closeScopeDropdown();
          enterSelectionMode({
            threadRoot,
            contact,
            onSync: (messages) => composeAndSend(contact, 'selected', messages),
          });
        },
        onSync: async (scope) => {
          let extracted: ComposerMessage[];
          try {
            extracted = await extractMessages(threadRoot, contact);
          } catch {
            showSyncError('Could not read the conversation. Try again.');
            return;
          }
          const freshWatermark = await readWatermark(contact.contactUrl);
          const messages = filterMessagesByScope(extracted, scope, new Date(), {
            watermarkFingerprint: freshWatermark?.fingerprint ?? null,
          });
          return composeAndSend(contact, scope, messages);
        },
        onCancel: () => {
          closeScopeDropdown();
        },
      });
    })
    .catch(() => {
      // The watermark read failed before the dropdown opened; do not show a
      // dead button with no feedback, but avoid opening a stale dropdown.
    });
}

function composeAndSend(
  contact: { contactName: string; contactUrl: string },
  scope: ScopeId,
  messages: ComposerMessage[],
): Promise<void> {
  if (messages.length === 0) {
    showSyncError('Nothing to sync in this window yet.');
    return Promise.resolve();
  }
  return resolveCleanProfileUrl(contact.contactUrl)
    .then((cleanUrl) => {
      const envelope = composeJarvisEnvelope({
        contactName: contact.contactName,
        contactUrl: cleanUrl ?? contact.contactUrl,
        selfName: getSelfName(document),
        scope,
        syncedAt: new Date(),
        messages,
      });
      setPendingScope(scope);
      setPendingEnvelope(envelope);
      return attemptSend(contact.contactUrl, envelope);
    })
    .catch((error: { message?: string }) => {
      console.log('[jarvis-sync] send preparation failed:', error?.message ?? '');
      showSyncError("Couldn't sync — try again.");
    });
}

function mountButton(
  root: HTMLElement,
  contact: { contactName: string; contactUrl: string },
): void {
  mountSyncButton(root, contact, (button) => {
    if (isSelectionModeActive()) {
      exitSelectionMode();
      return;
    }
    if (isScopeDropdownOpen()) {
      closeScopeDropdown();
      return;
    }
    const threadRoot = findThreadRoot(document);
    if (threadRoot) {
      openDropdownForButton(button, threadRoot, contact);
    }
  });
}

function unmountAndReset(): void {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  if (maxWaitTimer !== undefined) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = undefined;
  }
  closeScopeDropdown();
  exitSelectionMode();
  setPendingScope(null);
  setPendingEnvelope(null);
  dismissSyncNotices();
  unmountSyncButton();
  mountedKey = null;
  stableSignature = null;
  stableDetection = { kind: 'none' };
  consecutiveMatches = 0;
  consecutiveMisses = 0;
  lastDetectedSignature = null;
  resetSelfSlugCache();
  resetSelectorMismatchState();
}

let lastDetectedSignature: string | null = null;

function applyDetection(): void {
  const path = document.location.pathname;

  if (lastPathname !== null && path !== lastPathname) {
    unmountAndReset();
    lastPathname = path;
  } else if (lastPathname === null) {
    lastPathname = path;
  }

  if (!isConversationThread(document.location.href)) {
    if (mountedKey !== null) {
      unmountAndReset();
    }
    return;
  }

  const root = findThreadRoot(document);

  if (mountedKey !== null && mountedKey.startsWith(`${path}:`)) {
    const detection = root ? detectConversation(document) : { kind: 'none' as const };
    if (detection.kind === 'conversation' && root) {
      const sig = rosterSignature(root, document);
      if (sig !== null && stableSignature !== null && sig === stableSignature) {
        consecutiveMisses = 0;
        if (!hasSyncButton()) {
          mountButton(root, detection.contact);
        }
        return;
      }
    }
    consecutiveMisses += 1;
    if (consecutiveMisses >= UNSTABLE_PASSES_BEFORE_UNMOUNT) {
      unmountAndReset();
    }
    return;
  }

  if (!root) {
    consecutiveMatches = 0;
    consecutiveMisses += 1;
    if (consecutiveMisses >= UNSTABLE_PASSES_BEFORE_UNMOUNT && mountedKey !== null) {
      unmountAndReset();
    }
    return;
  }

  const detection = detectConversation(document);
  if (detection.kind === 'none') {
    consecutiveMatches = 0;
    consecutiveMisses += 1;
    if (consecutiveMisses >= UNSTABLE_PASSES_BEFORE_UNMOUNT && mountedKey !== null) {
      unmountAndReset();
    }
    return;
  }

  const key = detectionKeyFor(path, detection.contact.contactUrl);
  const sig = rosterSignature(root, document);
  if (sig === null) {
    return;
  }

  if (sig !== lastDetectedSignature) {
    lastDetectedSignature = sig;
    consecutiveMatches = 0;
  }

  const now = Date.now();
  if (sig === stableSignature) {
    if (mutationSinceLastPass && now - lastCountedAt >= OBSERVER_DEBOUNCE_MS) {
      consecutiveMatches += 1;
      lastCountedAt = now;
      mutationSinceLastPass = false;
    }
  } else {
    stableSignature = sig;
    consecutiveMatches = 1;
    lastCountedAt = now;
    mutationSinceLastPass = false;
  }

  if (consecutiveMatches >= STABILITY_PASSES) {
    stableDetection = detection;
    if (mountedKey !== key || !hasSyncButton()) {
      unmountSyncButton();
      const mountRoot = findThreadRoot(document);
      if (mountRoot) {
        mountButton(mountRoot, detection.contact);
        mountedKey = key;
      }
    }
  }
}

function scheduleDetection(): void {
  mutationSinceLastPass = true;
  const now = Date.now();
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    applyDetection();
  }, OBSERVER_DEBOUNCE_MS);

  if (maxWaitTimer === undefined) {
    maxWaitTimer = setTimeout(() => {
      maxWaitTimer = undefined;
      if (now - lastCountedAt >= OBSERVER_MAX_WAIT_MS) {
        applyDetection();
      }
    }, OBSERVER_MAX_WAIT_MS);
  }
}

function start(): void {
  lastPathname = document.location.pathname;
  applyDetection();
  new MutationObserver(scheduleDetection).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'class', 'aria-hidden', 'src', 'alt', 'style', 'hidden'],
  });
}

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main() {
    if (document.body) {
      start();
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
  },
});
