import { SELECTORS, isVisible } from '@/content/detect-conversation';

export function countVisibleMessages(root: HTMLElement): number {
  const candidates: HTMLElement[] = [];
  for (const selector of SELECTORS.messageRows) {
    for (const node of root.querySelectorAll<HTMLElement>(selector)) {
      if (isVisible(node)) {
        candidates.push(node);
      }
    }
  }
  const deduped = candidates.filter(
    (node) => !candidates.some((other) => other !== node && other.contains(node)),
  );
  return deduped.length;
}
