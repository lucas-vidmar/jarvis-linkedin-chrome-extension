import { defineContentScript } from 'wxt/utils/define-content-script';
import { ZOHO_CRM_ORIGIN_PATTERNS, zohoContactUrlToJarvis } from '@/shared/zoho-url';
import { syncZohoJarvisLink } from '@/content/zoho-jarvis-button';
import { watchUrlChanges, type UrlWatchTeardown } from '@/content/url-watch';

const OBSERVER_DEBOUNCE_MS = 250;
const OBSERVER_MAX_WAIT_MS = 750;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
let stopUrlWatch: UrlWatchTeardown | undefined;

function applyDetection(): void {
  const jarvisUrl = zohoContactUrlToJarvis(document.location.href);
  syncZohoJarvisLink(jarvisUrl);
  if (import.meta.env.DEV && jarvisUrl !== null) {
    console.log('[jarvis-zoho] jarvis link mounted');
  }
}

function scheduleDetection(): void {
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
      applyDetection();
    }, OBSERVER_MAX_WAIT_MS);
  }
}

function start(): void {
  applyDetection();
  const observerRoot = document.documentElement ?? document.body;
  new MutationObserver(scheduleDetection).observe(observerRoot, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'title', 'aria-label'],
  });
  stopUrlWatch?.();
  stopUrlWatch = watchUrlChanges(() => scheduleDetection());
  window.addEventListener(
    'pagehide',
    () => {
      stopUrlWatch?.();
      stopUrlWatch = undefined;
    },
    { once: true },
  );
}

export default defineContentScript({
  matches: [...ZOHO_CRM_ORIGIN_PATTERNS],
  main() {
    if (document.body) {
      start();
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
  },
});
