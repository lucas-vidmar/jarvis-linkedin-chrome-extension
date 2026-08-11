export interface MessageFingerprintInput {
  senderKey: string;
  epochMs: number | null;
  text: string;
}

export function normalizeFingerprintText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function fingerprintSource(senderKey: string, epochMs: number, text: string): string {
  return [senderKey, epochMs, normalizeFingerprintText(text)].join('|');
}

function isUsableEpoch(epochMs: number | null): epochMs is number {
  return typeof epochMs === 'number' && Number.isFinite(epochMs) && epochMs > 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeMessageFingerprint(input: MessageFingerprintInput): Promise<string | null> {
  if (!isUsableEpoch(input.epochMs)) {
    return null;
  }
  try {
    return await sha256Hex(fingerprintSource(input.senderKey, input.epochMs, input.text));
  } catch {
    return null;
  }
}

export function allFingerprintsUsable(messages: readonly { fingerprint: string | null }[]): boolean {
  return messages.every((message) => message.fingerprint !== null);
}
