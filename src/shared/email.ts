export type RawMessageEnvelope = {
  to: string;
  subject: string;
  body: string;
};

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Base64url (unpadded) encoding for the Gmail API `raw` field.
 */
export function toBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Strips CR/LF so a header value cannot inject additional headers.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * RFC 2047 encodes non-ASCII header values with standard base64 (including
 * padding). ASCII values are returned unchanged.
 */
export function encodeHeaderValue(value: string): string {
  const sanitized = sanitizeHeaderValue(value);
  if (/^[\x00-\x7F]*$/.test(sanitized)) return sanitized;
  const encoded = encodeBase64(new TextEncoder().encode(sanitized));
  return `=?UTF-8?B?${encoded}?=`;
}

export function buildRawMessage(envelope: RawMessageEnvelope): string {
  const headers = [
    `To: ${sanitizeHeaderValue(envelope.to)}`,
    `Subject: ${encodeHeaderValue(envelope.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ].join('\r\n');
  const raw = `${headers}\r\n\r\n${envelope.body.replace(/\r?\n/g, '\r\n')}`;
  return toBase64Url(new TextEncoder().encode(raw));
}
