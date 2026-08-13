export interface WatermarkValue {
  fingerprint: string;
  syncedAtEpochMs: number;
}

export function watermarkStorageKey(contactUrl: string): string {
  return `watermark:${contactUrl}`;
}

export function isValidFingerprint(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
