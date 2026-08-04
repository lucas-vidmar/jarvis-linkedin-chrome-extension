import { SELECTORS, type ContactRef } from '@/content/detect-conversation';

const SYNC_BUTTON_SELECTOR = '[data-jarvis-sync-button]';
const STYLE_ELEMENT_ID = 'jarvis-sync-styles';
const SYNC_BUTTON_LABEL = 'Sync conversation to Zoho CRM';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

let mountedButton: HTMLButtonElement | null = null;

export function hasSyncButton(): boolean {
  return mountedButton !== null && document.contains(mountedButton);
}

function findActionRow(root: HTMLElement): HTMLElement | null {
  for (const selector of SELECTORS.actionRowTargets) {
    const target = root.querySelector<HTMLElement>(selector);
    if (target) return target;
  }
  return null;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
button.jarvis-sync-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  margin: 0 0 0 12px;
  padding: 6px 14px;
  font: inherit;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #ffffff;
  background: #0a66c2;
  border: none;
  border-radius: 999px;
  box-shadow: none;
  cursor: pointer;
  vertical-align: middle;
}
button.jarvis-sync-button:hover {
  background: #004182;
}
button.jarvis-sync-button:focus,
button.jarvis-sync-button:focus-visible {
  outline: 2px solid #444ce7 !important;
  outline-offset: 2px !important;
}
.jarvis-sync-icon {
  display: block;
  flex: none;
}
`;
  document.head.appendChild(style);
}

function createIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('jarvis-sync-icon');
  const arc = document.createElementNS(SVG_NAMESPACE, 'path');
  arc.setAttribute('d', 'M20 11a8 8 0 1 0-2.34 5.66');
  arc.setAttribute('stroke', '#ffffff');
  arc.setAttribute('stroke-width', '2');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-linejoin', 'round');
  const arrow = document.createElementNS(SVG_NAMESPACE, 'path');
  arrow.setAttribute('d', 'M20 4v7h-7');
  arrow.setAttribute('stroke', '#ffffff');
  arrow.setAttribute('stroke-width', '2');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  svg.append(arc, arrow);
  return svg;
}

export function mountSyncButton(
  root: HTMLElement,
  contact: ContactRef,
  onSyncClick?: (button: HTMLButtonElement) => void,
): void {
  if (document.querySelector(SYNC_BUTTON_SELECTOR)) return;
  const target = findActionRow(root);
  if (!target) return;
  ensureStyles();
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('data-jarvis-sync-button', '');
  button.setAttribute('aria-label', SYNC_BUTTON_LABEL);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.className = 'jarvis-sync-button';
  button.appendChild(createIcon());
  button.appendChild(document.createTextNode('Sync'));
  if (onSyncClick) {
    button.addEventListener('click', () => onSyncClick(button));
  }
  target.appendChild(button);
  mountedButton = button;
}

export function unmountSyncButton(): void {
  document.querySelectorAll(SYNC_BUTTON_SELECTOR).forEach((element) => {
    element.remove();
  });
  mountedButton = null;
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}
