const STYLE_ID = 'jarvis-sync-notice-styles';
const NOTICE_SELECTOR = '[data-jarvis-sync-notice]';
const SUCCESS_DISMISS_MS = 5000;

let dismissTimer: ReturnType<typeof setTimeout> | undefined;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.jarvis-sync-notice {
  position: fixed;
  z-index: 2147483001;
  max-width: min(360px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12);
  font-family: inherit;
  font-size: 14px;
  line-height: 20px;
  color: #ffffff;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.jarvis-sync-notice--success {
  background: #057642;
}
.jarvis-sync-notice--error {
  background: #b24020;
}
.jarvis-sync-notice__copy {
  flex: 1;
  min-width: 0;
}
.jarvis-sync-notice__dismiss {
  flex: none;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #ffffff;
  background: none;
  border: none;
  padding: 0 2px;
  cursor: pointer;
}
.jarvis-sync-notice__dismiss:hover {
  text-decoration: underline;
}
.jarvis-sync-notice__dismiss:focus-visible {
  outline: 2px solid #ffffff !important;
  outline-offset: 1px !important;
}
@media (prefers-reduced-motion: no-preference) {
  .jarvis-sync-notice {
    animation: jarvis-sync-notice-in 160ms ease-out;
  }
}
@keyframes jarvis-sync-notice-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
  document.head.appendChild(style);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function dismiss(existing: HTMLElement): void {
  if (dismissTimer !== undefined) {
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
  existing.remove();
  removeStyles();
}

function position(notice: HTMLElement): void {
  const gap = 16;
  const right = Math.max(gap, window.innerWidth - notice.offsetWidth - gap);
  const top = Math.max(gap, window.innerHeight - notice.offsetHeight - gap);
  notice.style.left = `${right}px`;
  notice.style.top = `${top}px`;
}

function show(kind: 'success' | 'error', text: string, autoDismiss: boolean): HTMLElement {
  document.querySelectorAll<HTMLElement>(NOTICE_SELECTOR).forEach((existing) => {
    dismiss(existing);
  });

  ensureStyles();

  const notice = document.createElement('div');
  notice.className = `jarvis-sync-notice jarvis-sync-notice--${kind}`;
  notice.setAttribute('role', kind === 'success' ? 'status' : 'alert');
  notice.setAttribute('data-jarvis-sync-notice', '');
  notice.setAttribute('aria-live', 'polite');

  const copy = document.createElement('span');
  copy.className = 'jarvis-sync-notice__copy';
  copy.textContent = text;

  notice.append(copy);

  if (kind === 'error') {
    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'jarvis-sync-notice__dismiss';
    dismissButton.setAttribute('aria-label', 'Dismiss notification');
    dismissButton.textContent = '×';
    dismissButton.addEventListener('click', () => dismiss(notice));
    notice.append(dismissButton);
  }

  document.body.appendChild(notice);
  position(notice);

  if (autoDismiss) {
    dismissTimer = setTimeout(() => {
      if (notice.isConnected) {
        dismiss(notice);
      }
    }, SUCCESS_DISMISS_MS);
  }

  return notice;
}

export function showSyncSuccess(message: string): void {
  show('success', message, true);
}

export function showSyncError(message: string): void {
  show('error', message, false);
}
