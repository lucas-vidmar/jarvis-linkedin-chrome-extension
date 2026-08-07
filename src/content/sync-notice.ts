const STYLE_ID = 'jarvis-sync-notice-styles';
const NOTICE_SELECTOR = '[data-jarvis-sync-notice]';
const SUCCESS_DISMISS_MS = 5000;

let dismissTimer: ReturnType<typeof setTimeout> | undefined;

interface NoticeAction {
  label: string;
  onActivate: () => void;
}

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
.jarvis-sync-notice--prompt {
  background: #0a66c2;
}
.jarvis-sync-notice__copy {
  flex: 1;
  min-width: 0;
}
.jarvis-sync-notice__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}
.jarvis-sync-notice__action {
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #ffffff;
  background: none;
  border: none;
  padding: 0 2px;
  cursor: pointer;
  white-space: nowrap;
}
.jarvis-sync-notice__action:hover {
  text-decoration: underline;
}
.jarvis-sync-notice__action:focus-visible {
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

function show(kind: 'success' | 'error' | 'prompt', text: string, options?: { autoDismiss?: boolean; actions?: NoticeAction[] }): HTMLElement {
  document.querySelectorAll<HTMLElement>(NOTICE_SELECTOR).forEach((existing) => {
    dismiss(existing);
  });

  ensureStyles();

  const notice = document.createElement('div');
  notice.className = `jarvis-sync-notice jarvis-sync-notice--${kind}`;
  notice.setAttribute('role', kind === 'success' ? 'status' : kind === 'error' ? 'alert' : 'status');
  notice.setAttribute('data-jarvis-sync-notice', '');
  notice.setAttribute('aria-live', 'polite');

  const copy = document.createElement('span');
  copy.className = 'jarvis-sync-notice__copy';
  copy.textContent = text;

  notice.append(copy);

  const actions = options?.actions ?? [];
  if (kind === 'error' && actions.length === 0) {
    actions.push({
      label: 'Dismiss notification',
      onActivate: () => dismiss(notice),
    });
  }

  if (actions.length > 0) {
    const actionRow = document.createElement('span');
    actionRow.className = 'jarvis-sync-notice__actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'jarvis-sync-notice__action';
      button.setAttribute('aria-label', action.label);
      button.textContent = action.label === 'Dismiss notification' ? '×' : action.label;
      button.addEventListener('click', () => action.onActivate());
      actionRow.append(button);
    }
    notice.append(actionRow);
  }

  document.body.appendChild(notice);
  position(notice);

  if (options?.autoDismiss) {
    dismissTimer = setTimeout(() => {
      if (notice.isConnected) {
        dismiss(notice);
      }
    }, SUCCESS_DISMISS_MS);
  }

  return notice;
}

export function showSyncSuccess(message: string): void {
  show('success', message, { autoDismiss: true });
}

export function showSyncError(message: string): void {
  show('error', message, { autoDismiss: false });
}

export function showSyncPrompt(message: string, actions: NoticeAction[]): void {
  show('prompt', message, { autoDismiss: false, actions });
}

export function dismissSyncNotices(): void {
  document.querySelectorAll<HTMLElement>(NOTICE_SELECTOR).forEach((existing) => {
    dismiss(existing);
  });
}
