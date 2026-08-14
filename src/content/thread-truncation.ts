import { SELECTORS } from '@/content/detect-conversation';

const LIST_SELECTOR = '.msg-s-message-list';

function isScrollable(node: HTMLElement): boolean {
  return /(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY);
}

function findScrollContainer(root: HTMLElement): HTMLElement | null {
  const list = root.querySelector<HTMLElement>(LIST_SELECTOR);
  if (list && isScrollable(list)) return list;
  const firstGroup = root.querySelector<HTMLElement>(SELECTORS.messageDayGroups[0]);
  if (!firstGroup) return null;
  let node: HTMLElement | null = firstGroup.parentElement;
  while (node && node !== document.body) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function staticVerticalInset(list: HTMLElement, firstGroup: HTMLElement): number {
  const listStyle = getComputedStyle(list);
  const childMarginTop = getComputedStyle(firstGroup).marginTop;
  return (
    (parseFloat(listStyle.paddingTop) || 0) +
    (parseFloat(listStyle.borderTopWidth) || 0) +
    (parseFloat(childMarginTop) || 0)
  );
}

function hasLoadingSentinel(list: HTMLElement): boolean {
  const firstGroup = list.querySelector<HTMLElement>(SELECTORS.messageDayGroups[0]);
  const above = firstGroup?.previousElementSibling;
  if (!above) return false;
  return (
    above.getAttribute('aria-busy') === 'true' ||
    above.querySelector('[role="progressbar"], .artdeco-spinner') !== null ||
    /loading older|loading previous|loading messages|loading earlier/i.test(
      above.textContent ?? '',
    )
  );
}

export function detectThreadTruncation(root: HTMLElement): boolean {
  try {
    const list = findScrollContainer(root);
    if (!list) return false;
    if (list.scrollHeight <= list.clientHeight) return false;
    const firstGroup = list.querySelector<HTMLElement>(SELECTORS.messageDayGroups[0]);
    if (!firstGroup) return false;
    const contentTop =
      firstGroup.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop -
      staticVerticalInset(list, firstGroup);
    if (contentTop > 1) return true;
    return hasLoadingSentinel(list);
  } catch {
    return false;
  }
}
