const ZOHO_LINK_SELECTOR = '[data-jarvis-zoho-link]';
const STYLE_ELEMENT_ID = 'jarvis-zoho-styles';
const JARVIS_LINK_LABEL = 'Open in Jarvis';
const SEND_EMAIL_TEXT = 'Send Email';
const BASELINE_CLASS = 'jarvis-zoho-link';
const JARVIS_BACKGROUND_COLOR = '#f57c00';
const JARVIS_FOCUS_COLOR = '#f57c00';
const GUARDED_EVENT_TYPES = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'] as const;
const COPIED_COMPUTED_STYLES = [
  'display',
  'padding',
  'height',
  'line-height',
  'min-height',
  'font-family',
  'font-size',
  'font-weight',
  'color',
  'background-color',
  'border',
  'border-radius',
  'white-space',
  'text-align',
  'cursor',
  'box-sizing',
] as const;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
a.jarvis-zoho-link {
  margin: 0 12px 0 0;
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
a.jarvis-zoho-link:focus-visible {
  outline: 2px solid #f57c00;
  outline-offset: 2px;
}
`;
  document.head.appendChild(style);
}

export function findSendEmailButton(
  root: ParentNode = document,
): HTMLAnchorElement | HTMLButtonElement | null {
  const candidates = root.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>('a, button');
  for (const candidate of candidates) {
    const label = (
      candidate.getAttribute('aria-label') ??
      candidate.getAttribute('title') ??
      candidate.textContent?.trim() ??
      ''
    ).trim();
    if (label.toLowerCase() === SEND_EMAIL_TEXT.toLowerCase()) return candidate;
  }
  return null;
}

let clickGuardRegistered = false;

function ensureClickGuard(): void {
  if (clickGuardRegistered) return;
  clickGuardRegistered = true;
  for (const type of GUARDED_EVENT_TYPES) {
    document.addEventListener(
      type,
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(ZOHO_LINK_SELECTOR)) {
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  }
}

export function applyReferenceAppearance(
  referenceButton: HTMLAnchorElement | HTMLButtonElement,
  link: HTMLAnchorElement,
): void {
  link.className = referenceButton.className;
  link.classList.add(BASELINE_CLASS);
  const computed = getComputedStyle(referenceButton);
  for (const prop of COPIED_COMPUTED_STYLES) {
    const value = computed.getPropertyValue(prop);
    if (value) link.style.setProperty(prop, value);
  }
  link.style.setProperty('background-image', 'none');
  link.style.setProperty('background-color', JARVIS_BACKGROUND_COLOR);
  link.style.setProperty('border-color', JARVIS_BACKGROUND_COLOR);
}

export function buildJarvisLink(
  jarvisUrl: string,
  referenceButton: HTMLAnchorElement | HTMLButtonElement,
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = jarvisUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('data-jarvis-zoho-link', '');
  link.setAttribute('aria-label', JARVIS_LINK_LABEL);
  link.textContent = '🚀';
  link.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  applyReferenceAppearance(referenceButton, link);
  return link;
}

export function mountZohoJarvisLink(jarvisUrl: string): void {
  const referenceButton = findSendEmailButton();
  if (!referenceButton) return;
  const existing = document.querySelector<HTMLAnchorElement>(ZOHO_LINK_SELECTOR);
  if (existing) {
    if (existing.getAttribute('href') !== jarvisUrl) existing.setAttribute('href', jarvisUrl);
    if (existing.className !== referenceButton.className) {
      applyReferenceAppearance(referenceButton, existing);
    }
    return;
  }
  ensureStyles();
  ensureClickGuard();
  const link = buildJarvisLink(jarvisUrl, referenceButton);
  referenceButton.insertAdjacentElement('beforebegin', link);
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
  if (!findSendEmailButton()) return;
  mountZohoJarvisLink(jarvisUrl);
}