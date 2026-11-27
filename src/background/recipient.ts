import {
  isValidRecipient,
  RECIPIENT_STORAGE_KEY,
  resolveDefaultRecipient,
} from '@/shared/recipient';
import { StorageError } from '@/shared/errors';

export interface RecipientState {
  recipient: string;
  isDefault: boolean;
}

/** Raised when a caller supplies a malformed recipient address. */
export class InvalidRecipientError extends Error {
  constructor(message = 'Invalid email address.') {
    super(message);
    this.name = 'InvalidRecipientError';
  }
}

/**
 * Read the configured sync recipient.
 *
 * Falls back to the default only when nothing is stored. A storage failure
 * throws `StorageError` so callers abort the send instead of mailing company
 * data to an unverified default address.
 */
export async function readRecipient(): Promise<RecipientState> {
  let stored: Record<string, unknown>;
  try {
    stored = await chrome.storage.sync.get(RECIPIENT_STORAGE_KEY);
  } catch {
    throw new StorageError('Could not read the saved sync recipient.');
  }

  const value = stored[RECIPIENT_STORAGE_KEY];
  if (value === undefined || value === null || value === '') {
    return { recipient: resolveDefaultRecipient(), isDefault: true };
  }
  if (typeof value === 'string' && isValidRecipient(value)) {
    return { recipient: value.trim(), isDefault: false };
  }
  throw new StorageError(
    'The saved sync recipient is not valid. Save it again in settings.',
  );
}

export async function saveRecipient(raw: string): Promise<string> {
  const value = raw.trim();
  if (value === '') {
    try {
      await chrome.storage.sync.remove(RECIPIENT_STORAGE_KEY);
    } catch {
      throw new StorageError('Could not save the sync recipient.');
    }
    return resolveDefaultRecipient();
  }
  if (!isValidRecipient(value)) {
    throw new InvalidRecipientError('Invalid email address.');
  }
  try {
    await chrome.storage.sync.set({ [RECIPIENT_STORAGE_KEY]: value });
  } catch {
    throw new StorageError('Could not save the sync recipient.');
  }
  return value;
}
