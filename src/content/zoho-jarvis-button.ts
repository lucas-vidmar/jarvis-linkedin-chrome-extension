const ZOHO_LINK_SELECTOR = '[data-jarvis-zoho-link]';
const STYLE_ELEMENT_ID = 'jarvis-zoho-styles';
const JARVIS_LINK_LABEL = 'Open in Jarvis';
const SEND_EMAIL_TEXT = 'Send Email';
const BASELINE_CLASS = 'jarvis-zoho-link';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
a.jarvis-zoho-link {
  margin: 0 0 0 12px;
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
a.jarvis-zoho-link:focus-visible {
  outline: 2px solid #444ce7;
  outline-offset: 2px;
}
`;
  document.head.appendChild(style);
}

export function findSendEmailButton(root: ParentNode = document): HTMLAnchorElement | null {
  const anchors = root.querySelectorAll<HTMLAnchorElement>('a');
  for (const anchor of anchors) {
    const label = (
      anchor.getAttribute('aria-label') ??
      anchor.getAttribute('title') ??
      anchor.textContent?.trim() ??
      ''
    ).trim();
    if (label.toLowerCase() === SEND_EMAIL_TEXT.toLowerCase()) return anchor;
  }
  return null;
}

export function buildJarvisLink(
  jarvisUrl: string,
  referenceButton: HTMLAnchorElement,
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = jarvisUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('data-jarvis-zoho-link', '');
  link.setAttribute('aria-label', JARVIS_LINK_LABEL);
  link.className = referenceButton.className;
  link.classList.add(BASELINE_CLASS);
  link.textContent = 'Jarvis';
  return link;
}

export function mountZohoJarvisLink(jarvisUrl: string): void {
  const referenceButton = findSendEmailButton();
  if (!referenceButton) return;
  const existing = document.querySelector<HTMLAnchorElement>(ZOHO_LINK_SELECTOR);
  if (existing) {
    if (existing.getAttribute('href') !== jarvisUrl) existing.setAttribute('href', jarvisUrl);
    if (existing.className !== referenceButton.className) {
      existing.className = referenceButton.className;
      existing.classList.add(BASELINE_CLASS);
    }
    return;
  }
  ensureStyles();
  const link = buildJarvisLink(jarvisUrl, referenceButton);
  referenceButton.insertAdjacentElement('afterend', link);
}

export function unmountZohoJarvisLink(): void {
  document.querySelectorAll(ZOHO_LINK_SELECTOR).forEach((element) => {
    element.remove();
  });
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}

export function syncZohoJarvisLink(jarvisUrl: string | null): void {
  if (jarvisUrl === null) {
    unmountZohoJarvisLink();
    return;
  }
  if (!findSendEmailButton()) {
    unmountZohoJarvisLink();
    return;
  }
  mountZohoJarvisLink(jarvisUrl);
}