import { defineContentScript } from 'wxt/utils/define-content-script';
import { zohoContactUrlToJarvis } from '@/shared/zoho-url';
import { syncZohoJarvisLink } from '@/content/zoho-jarvis-button';

const OBSERVER_DEBOUNCE_MS = 250;
const OBSERVER_MAX_WAIT_MS = 750;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;

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
  new MutationObserver(scheduleDetection).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'title', 'aria-label'],
  });
  window.addEventListener('popstate', scheduleDetection);
  window.addEventListener('hashchange', scheduleDetection);
  const nativePushState = history.pushState.bind(history);
  const nativeReplaceState = history.replaceState.bind(history);
  history.pushState = (data, unused, url) => {
    nativePushState(data, unused, url);
    scheduleDetection();
  };
  history.replaceState = (data, unused, url) => {
    nativeReplaceState(data, unused, url);
    scheduleDetection();
  };
}

export default defineContentScript({
  matches: ['https://crm.zoho.com/*'],
  main() {
    if (document.body) {
      start();
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
  },
});