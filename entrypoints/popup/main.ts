import type { PopupReply, PopupRequest } from '@/shared/messages';

const connectView = document.getElementById('connect-view');
const connectedView = document.getElementById('connected-view');
const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
const disconnectButton = document.getElementById(
  'disconnect-button',
) as HTMLButtonElement | null;
const statusRegion = document.getElementById('status');
const disconnectStatus = document.getElementById('disconnect-status');
const connectedAccount = document.getElementById('connected-account');
const announce = document.getElementById('announce');
const statusDefault = statusRegion?.textContent ?? '';

let connectInFlight = false;
let disconnectInFlight = false;
let viewGeneration = 0;

const DISCONNECT_TIMEOUT_MS = 5000;
const STATUS_TIMEOUT_MS = 5000;

function newRequestId(): string {
  return crypto.randomUUID();
}

function sendMessage<T extends PopupRequest>(
  message: T,
  timeoutMs?: number,
): Promise<PopupReply<T['type']>> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs) {
      timer = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, timeoutMs);
    }
    chrome.runtime.sendMessage(message).then(
      (reply) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve(reply);
      },
      (error) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(error);
      },
    );
  });
}

function setAnnounce(text: string): void {
  if (announce) {
    announce.textContent = text;
  }
}

function updateConnectedAccount(email?: string): void {
  if (!connectedAccount) {
    return;
  }
  if (email) {
    connectedAccount.textContent = `Authorized as ${email}`;
    connectedAccount.hidden = false;
  } else {
    connectedAccount.textContent = '';
    connectedAccount.hidden = true;
  }
}

function renderConnected(email?: string): void {
  if (connectView) {
    connectView.hidden = true;
  }
  if (statusRegion) {
    statusRegion.classList.remove('progress');
    statusRegion.textContent = '';
    statusRegion.hidden = true;
  }
  if (disconnectStatus) {
    disconnectStatus.hidden = true;
    disconnectStatus.textContent = '';
  }
  updateConnectedAccount(email);
  if (connectedView) {
    connectedView.hidden = false;
    (connectedView as HTMLElement).focus();
  }
}

function renderDisconnected(): void {
  viewGeneration += 1;
  if (connectedView) {
    connectedView.hidden = true;
  }
  if (connectView) {
    connectView.hidden = false;
  }
  if (statusRegion) {
    statusRegion.classList.remove('progress');
    statusRegion.textContent = '';
    statusRegion.hidden = true;
  }
  if (disconnectStatus) {
    disconnectStatus.hidden = true;
    disconnectStatus.textContent = '';
  }
  connectButton?.focus();
  setAnnounce('Disconnected from Google');
}

function showError(message: string): void {
  if (statusRegion) {
    statusRegion.classList.remove('progress');
    statusRegion.textContent = message;
    statusRegion.hidden = false;
  }
}

function showDisconnectError(message: string): void {
  setAnnounce(message);
  if (disconnectStatus) {
    disconnectStatus.classList.remove('progress');
    disconnectStatus.textContent = message;
    disconnectStatus.hidden = false;
  }
}

function showDisconnectProgress(): void {
  if (disconnectStatus) {
    disconnectStatus.classList.add('progress');
    disconnectStatus.textContent = 'Disconnecting…';
    disconnectStatus.hidden = false;
  }
}

function hideDisconnectStatus(): void {
  if (disconnectStatus) {
    disconnectStatus.classList.remove('progress');
    disconnectStatus.hidden = true;
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
  if (statusRegion?.classList.contains('progress')) {
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
  const generation = viewGeneration;
  try {
    const reply = await sendMessage(
      { type: 'GET_AUTH_STATUS', requestId: newRequestId() },
      STATUS_TIMEOUT_MS,
    );
    if (
      reply.ok &&
      reply.data.connected &&
      !connectInFlight &&
      generation === viewGeneration
    ) {
      if (connectedView && !connectedView.hidden) {
        updateConnectedAccount(reply.data.email);
      } else {
        renderConnected(reply.data.email);
      }
    }
  } catch {
    return;
  }
}

async function reconcileAfterTimeout(): Promise<void> {
  const generation = viewGeneration;
  try {
    const reply = await sendMessage(
      { type: 'GET_AUTH_STATUS', requestId: newRequestId() },
      STATUS_TIMEOUT_MS,
    );
    if (!reply.ok) {
      showDisconnectError('Could not disconnect. Please try again.');
      return;
    }
    if (generation !== viewGeneration) {
      return;
    }
    if (reply.data.connected) {
      showDisconnectError('Disconnect did not complete. Please try again.');
      return;
    }
    renderDisconnected();
  } catch {
    showDisconnectError('Could not disconnect. Please try again.');
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
    viewGeneration += 1;
    hideError();
    showProgress();
    try {
      const reply = await sendMessage({ type: 'CONNECT_GOOGLE', requestId: newRequestId() });
      if (!reply.ok) {
        showError(reply.error.message);
      } else if (reply.data.connected) {
        renderConnected();
        connectInFlight = false;
        connectButton.disabled = false;
        hideProgress();
        void loadAuthStatus();
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

  disconnectButton?.addEventListener('click', async () => {
    if (disconnectButton.disabled || disconnectInFlight) {
      return;
    }
    disconnectButton.disabled = true;
    disconnectInFlight = true;
    viewGeneration += 1;
    connectedView?.focus();
    hideDisconnectStatus();
    showDisconnectProgress();
    try {
      const reply = await sendMessage(
        { type: 'DISCONNECT_GOOGLE', requestId: newRequestId() },
        DISCONNECT_TIMEOUT_MS,
      );
      if (!reply.ok) {
        showDisconnectError(reply.error.message);
      } else {
        renderDisconnected();
      }
    } catch {
      void reconcileAfterTimeout();
    } finally {
      disconnectInFlight = false;
      disconnectButton.disabled = false;
    }
  });
}

init();
