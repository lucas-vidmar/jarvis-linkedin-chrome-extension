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
import { defaultScope } from '@/shared/scopes';
import { composeJarvisEnvelope } from '@/shared/composer';
import { setPendingScope, setPendingEnvelope } from '@/content/sync-state';
import { extractMessages } from '@/content/extract-messages';
import { sendSyncEmail } from '@/content/send-sync';
import { showSyncError, showSyncSuccess } from '@/content/sync-notice';
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

function openDropdownForButton(
  button: HTMLElement,
  threadRoot: HTMLElement,
  contact: { contactName: string; contactUrl: string },
): void {
  const messageCount = countVisibleMessages(threadRoot);
  openScopeDropdown({
    anchor: button,
    threadRoot,
    selectedScope: defaultScope(false),
    messageCount,
    onSync: async (scope) => {
      const messages = extractMessages(threadRoot, contact);
      const cleanUrl = (await resolveCleanProfileUrl(contact.contactUrl)) ?? contact.contactUrl;
      const envelope = composeJarvisEnvelope({
        contactName: contact.contactName,
        contactUrl: cleanUrl,
        selfName: getSelfName(document),
        scope,
        syncedAt: new Date(),
        messages,
      });
      setPendingScope(scope);
      setPendingEnvelope(envelope);
      closeScopeDropdown();
      const syncThreadUrl = contact.contactUrl;
      sendSyncEmail({ contactUrl: syncThreadUrl, envelope })
        .then((result) => {
          if (!isCurrentThread(syncThreadUrl)) return;
          console.log('[jarvis-sync] sent:', result.messageId);
          showSyncSuccess('Synced to Zoho.');
        })
        .catch((error: { code?: string; message?: string }) => {
          if (!isCurrentThread(syncThreadUrl)) return;
          console.log('[jarvis-sync] send failed:', error?.code ?? 'SEND_FAILED');
          showSyncError(error?.message ?? 'Could not sync. Try again.');
        });
    },
    onCancel: () => {
      closeScopeDropdown();
    },
  });
}

function mountButton(
  root: HTMLElement,
  contact: { contactName: string; contactUrl: string },
): void {
  mountSyncButton(root, contact, (button) => {
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
  setPendingScope(null);
  setPendingEnvelope(null);
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
