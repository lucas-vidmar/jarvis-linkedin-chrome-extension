import type { PopupReply, PopupRequest } from '@/shared/messages';

const connectView = document.getElementById('connect-view');
const connectedView = document.getElementById('connected-view');
const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
const statusRegion = document.getElementById('status');
const statusDefault = statusRegion?.textContent ?? '';

let connectInFlight = false;

function newRequestId(): string {
  return crypto.randomUUID();
}

function sendMessage<T extends PopupRequest>(
  message: T,
): Promise<PopupReply<T['type']>> {
  return chrome.runtime.sendMessage(message);
}

function renderConnected(): void {
  if (connectView) {
    connectView.hidden = true;
  }
  if (connectedView) {
    connectedView.hidden = false;
    connectedView.setAttribute('role', 'status');
    (connectedView as HTMLElement).focus();
  }
  if (statusRegion) {
    statusRegion.hidden = true;
  }
}

function showError(message: string): void {
  if (statusRegion) {
    statusRegion.classList.remove('progress');
    statusRegion.textContent = message;
    statusRegion.hidden = false;
  }
}

function showProgress(): void {
  if (statusRegion) {
    statusRegion.classList.add('progress');
    statusRegion.textContent = 'Connecting to Google…';
    statusRegion.hidden = false;
  }
}

function hideProgress(): void {
  if (statusRegion && statusRegion.textContent === 'Connecting to Google…') {
    statusRegion.classList.remove('progress');
    statusRegion.hidden = true;
  }
}

function hideError(): void {
  if (statusRegion) {
    statusRegion.classList.remove('progress');
    statusRegion.hidden = true;
  }
}

async function loadAuthStatus(): Promise<void> {
  try {
    const reply = await sendMessage({ type: 'GET_AUTH_STATUS', requestId: newRequestId() });
    if (reply.ok && reply.data.connected && !connectInFlight) {
      renderConnected();
    }
  } catch {
    return;
  }
}

function init(): void {
  void loadAuthStatus();

  connectButton?.addEventListener('click', async () => {
    if (connectButton.disabled || connectInFlight) {
      return;
    }
    connectButton.disabled = true;
    connectInFlight = true;
    hideError();
    showProgress();
    try {
      const reply = await sendMessage({ type: 'CONNECT_GOOGLE', requestId: newRequestId() });
      if (!reply.ok) {
        showError(reply.error.message);
      } else if (reply.data.connected) {
        renderConnected();
      } else {
        showError(statusDefault);
      }
    } catch {
      showError('Connection failed. Please try again.');
    } finally {
      connectInFlight = false;
      connectButton.disabled = false;
      hideProgress();
    }
  });
}

init();
