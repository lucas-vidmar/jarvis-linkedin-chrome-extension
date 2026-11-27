import { describe, expect, it } from 'vitest';
import {
  buildRawMessage,
  encodeHeaderValue,
  sanitizeHeaderValue,
  toBase64Url,
} from '@/shared/email';

function decodeRawMessage(raw: string): string {
  const binary = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeHeaderValue(encoded: string): string {
  const match = /^=\?UTF-8\?B\?(.+)\?=$/.exec(encoded);
  if (!match) return encoded;
  const binary = atob(match[1]);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe('toBase64Url', () => {
  it('uses the URL-safe alphabet without padding', () => {
    const bytes = new TextEncoder().encode('??>>');
    const encoded = toBase64Url(bytes);
    expect(encoded).toBe('Pz8-Pg');
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});

describe('encodeHeaderValue', () => {
  it('leaves ASCII subjects unchanged', () => {
    expect(encodeHeaderValue('Weekly sync notes')).toBe('Weekly sync notes');
  });

  it('encodes an accented name with standard RFC 2047 base64', () => {
    const encoded = encodeHeaderValue('Zoë');
    expect(encoded).toBe('=?UTF-8?B?Wm/Dqw==?=');
    expect(decodeHeaderValue(encoded)).toBe('Zoë');
  });

  it('encodes CJK text with standard RFC 2047 base64', () => {
    const encoded = encodeHeaderValue('你好');
    expect(encoded).toBe('=?UTF-8?B?5L2g5aW9?=');
    expect(decodeHeaderValue(encoded)).toBe('你好');
  });

  it('encodes emoji with standard RFC 2047 base64', () => {
    const encoded = encodeHeaderValue('🚀');
    expect(encoded).toBe('=?UTF-8?B?8J+agA==?=');
    expect(decodeHeaderValue(encoded)).toBe('🚀');
  });

  it('uses the standard base64 alphabet, not base64url', () => {
    const withPlus = encodeHeaderValue('ûï¾');
    expect(withPlus).toContain('+');
    expect(withPlus).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/]+={0,2}\?=$/);

    const withSlash = encodeHeaderValue('ÿÿ');
    expect(withSlash).toContain('/');
    expect(withSlash).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/]+={0,2}\?=$/);
  });

  it('strips CRLF header injection from ASCII values', () => {
    expect(encodeHeaderValue('Hello\r\nBcc: evil@example.com')).toBe(
      'Hello Bcc: evil@example.com',
    );
    expect(encodeHeaderValue('Hello\r\nBcc: evil@example.com')).not.toMatch(/[\r\n]/);
  });

  it('strips CRLF header injection from non-ASCII values', () => {
    const encoded = encodeHeaderValue('Zoë\r\nBcc: evil@example.com');
    expect(decodeHeaderValue(encoded)).toBe('Zoë Bcc: evil@example.com');
    expect(encoded).not.toMatch(/[\r\n]/);
  });
});

describe('sanitizeHeaderValue', () => {
  it('collapses CRLF runs to a single space', () => {
    expect(sanitizeHeaderValue('  a@example.com\r\n\r\nBcc: b@example.com  ')).toBe(
      'a@example.com Bcc: b@example.com',
    );
  });

  it('handles bare carriage returns', () => {
    expect(sanitizeHeaderValue('a@example.com\rBcc: b@example.com')).toBe(
      'a@example.com Bcc: b@example.com',
    );
  });
});

describe('buildRawMessage', () => {
  const envelope = {
    to: 'jarvis@example.com',
    subject: 'Zoë 🚀',
    body: 'hello',
  };

  it('returns base64url of the full RFC 5322 message', () => {
    const raw = buildRawMessage(envelope);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const message = decodeRawMessage(raw);
    expect(message).toContain('To: jarvis@example.com\r\n');
    expect(message).toContain('MIME-Version: 1.0\r\n');
    expect(message).toContain('Content-Type: text/plain; charset=UTF-8\r\n');
    expect(message).toContain('\r\n\r\nhello');
  });

  it('encodes non-ASCII subjects while keeping ASCII subjects intact', () => {
    const decoded = decodeRawMessage(buildRawMessage(envelope));
    expect(decoded).toContain('Subject: =?UTF-8?B?Wm/DqyDwn5qA?=\r\n');

    const ascii = decodeRawMessage(
      buildRawMessage({ ...envelope, subject: 'Plain subject' }),
    );
    expect(ascii).toContain('Subject: Plain subject\r\n');
  });

  it('normalizes body newlines to CRLF', () => {
    const decoded = decodeRawMessage(
      buildRawMessage({ ...envelope, body: 'line one\nline two\r\nline three' }),
    );
    const body = decoded.split('\r\n\r\n')[1];
    expect(body).toBe('line one\r\nline two\r\nline three');
    expect(body.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('sanitizes the To header against header injection', () => {
    const decoded = decodeRawMessage(
      buildRawMessage({
        ...envelope,
        to: 'jarvis@example.com\r\nBcc: evil@example.com',
      }),
    );
    expect(decoded).toContain('To: jarvis@example.com Bcc: evil@example.com\r\n');
    expect(decoded).not.toContain('\r\nBcc:');
  });

  it('sanitizes the Subject against header injection', () => {
    const decoded = decodeRawMessage(
      buildRawMessage({
        ...envelope,
        subject: 'Hello\r\nBcc: evil@example.com',
      }),
    );
    expect(decoded).not.toContain('\r\nBcc:');
    expect(decoded.match(/^Subject: /gm)).toHaveLength(1);
  });
});
