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

function matchesSendEmailLabel(element: Element): boolean {
  const label = (
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.textContent?.trim() ??
    ''
  ).trim();
  return label.toLowerCase() === SEND_EMAIL_TEXT.toLowerCase();
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  if (element.getAttribute('aria-hidden') === 'true') return true;
  let current: Element | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function classNameOf(element: Element): string {
  return (element.getAttribute('class') ?? '').toLowerCase();
}

/** A Send Email control inside a dialog/compose modal is not the record action. */
function isInsideModal(element: Element): boolean {
  let current: Element | null = element.parentElement;
  while (current) {
    const role = (current.getAttribute('role') ?? '').toLowerCase();
    const className = classNameOf(current);
    const id = current.id.toLowerCase();
    if (
      current.tagName === 'DIALOG' ||
      role === 'dialog' ||
      role === 'alertdialog' ||
      current.getAttribute('aria-modal') === 'true' ||
      className.includes('modal') ||
      className.includes('dialog') ||
      id.includes('modal') ||
      id.includes('dialog')
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/** Prefer the record action bar over unrelated lookalike controls. */
function isInsideActionArea(element: Element): boolean {
  let current: Element | null = element.parentElement;
  while (current) {
    const role = (current.getAttribute('role') ?? '').toLowerCase();
    const className = classNameOf(current);
    if (role === 'toolbar' || className.includes('action') || className.includes('toolbar')) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function findSendEmailButton(
  root: ParentNode = document,
): HTMLAnchorElement | HTMLButtonElement | null {
  const candidates = root.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>('a, button');
  let fallback: HTMLAnchorElement | HTMLButtonElement | null = null;
  for (const candidate of candidates) {
    if (!matchesSendEmailLabel(candidate)) continue;
    if (isHidden(candidate)) continue;
    if (isInsideModal(candidate)) continue;
    if (isInsideActionArea(candidate)) return candidate;
    fallback ??= candidate;
  }
  return fallback;
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