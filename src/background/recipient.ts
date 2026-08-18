import {
  isValidRecipient,
  RECIPIENT_STORAGE_KEY,
  resolveDefaultRecipient,
} from '@/shared/recipient';

export interface RecipientState {
  recipient: string;
  isDefault: boolean;
}

export async function readRecipient(): Promise<RecipientState> {
  try {
    const stored = await chrome.storage.sync.get(RECIPIENT_STORAGE_KEY);
    const value = stored[RECIPIENT_STORAGE_KEY];
    if (typeof value === 'string' && isValidRecipient(value)) {
      return { recipient: value.trim(), isDefault: false };
    }
  } catch {
    // Fall through to the default.
  }
  return { recipient: resolveDefaultRecipient(), isDefault: true };
}

export async function saveRecipient(raw: string): Promise<string> {
  const value = raw.trim();
  if (value === '') {
    await chrome.storage.sync.remove(RECIPIENT_STORAGE_KEY);
    return resolveDefaultRecipient();
  }
  if (!isValidRecipient(value)) {
    throw new Error('Invalid email address.');
  }
  await chrome.storage.sync.set({ [RECIPIENT_STORAGE_KEY]: value });
  return value;
}