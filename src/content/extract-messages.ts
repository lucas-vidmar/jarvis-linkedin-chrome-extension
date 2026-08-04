import { SELECTORS, isVisible, type ContactRef } from '@/content/detect-conversation';
import type { ComposerMessage, SenderKey } from '@/shared/composer';

function readText(row: HTMLElement): string {
  for (const selector of SELECTORS.messageText) {
    const node = row.querySelector<HTMLElement>(selector);
    if (node?.textContent) {
      return node.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  const clone = row.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('time, button, [aria-label]').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function readTimestamp(row: HTMLElement): number | null {
  for (const selector of SELECTORS.messageTimestamp) {
    const node = row.querySelector<HTMLElement>(selector);
    const value = node?.getAttribute('datetime');
    if (value) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function readSender(row: HTMLElement): SenderKey {
  for (const selector of SELECTORS.selfMessageMarkers) {
    if (row.closest(selector)) {
      return 'self';
    }
  }
  return 'contact';
}

export function extractMessages(root: HTMLElement, _contact: ContactRef): ComposerMessage[] {
  const seen = new Set<HTMLElement>();
  for (const selector of SELECTORS.messageRows) {
    for (const node of root.querySelectorAll<HTMLElement>(selector)) {
      if (isVisible(node)) {
        seen.add(node);
      }
    }
  }
  const candidates = Array.from(seen);
  const deduped = candidates.filter(
    (node) => !candidates.some((other) => other !== node && other.contains(node)),
  );
  return deduped.map((row) => ({
    senderKey: readSender(row),
    timestampMs: readTimestamp(row),
    text: readText(row),
  }));
}
