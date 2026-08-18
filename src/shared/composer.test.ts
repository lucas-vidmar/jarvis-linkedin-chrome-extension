import { describe, expect, it } from 'vitest';
import {
  composeJarvisEnvelope,
  type ComposerMessage,
} from '@/shared/composer';
import { DEFAULT_SYNC_RECIPIENT } from '@/shared/recipient';

function message(overrides: Partial<ComposerMessage>): ComposerMessage {
  return {
    senderKey: 'self',
    timestampMs: 1_700_000_000_000,
    text: 'hi',
    fingerprint: null,
    ...overrides,
  };
}

describe('composeJarvisEnvelope', () => {
  const base = {
    contactName: 'Ada',
    contactUrl: 'https://www.linkedin.com/in/ada',
    selfName: 'Lin',
    scope: 'entire-thread' as const,
    syncedAt: new Date('2026-08-14T12:00:00Z'),
  };

  it('starts the body with the contact URL then the sync header line', () => {
    const envelope = composeJarvisEnvelope({ ...base, messages: [message({})] });
    const lines = envelope.body.split('\n');
    expect(lines[0]).toBe('https://www.linkedin.com/in/ada');
    expect(lines[1]).toBe('Synced 2026-08-14 — Entire thread');
  });

  it('formats sender names and timestamps per message', () => {
    const envelope = composeJarvisEnvelope({
      ...base,
      messages: [message({ senderKey: 'contact', text: 'hey' })],
    });
    expect(envelope.body).toContain('[Ada]');
    expect(envelope.body).toContain('hey');
  });

  it('reports the last included message fingerprint and compose epoch', () => {
    const last = message({ fingerprint: 'f'.repeat(64) });
    const envelope = composeJarvisEnvelope({
      ...base,
      messages: [message({ fingerprint: 'e'.repeat(64) }), last],
    });
    expect(envelope.lastMessageFingerprint).toBe('f'.repeat(64));
    expect(envelope.composedAtEpochMs).toBe(base.syncedAt.getTime());
  });

  it('reports null fingerprint when no message is included', () => {
    const envelope = composeJarvisEnvelope({ ...base, messages: [] });
    expect(envelope.lastMessageFingerprint).toBeNull();
  });

  it('truncates the body at MAX_BODY_CHARS and counts omitted messages', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      message({ text: `message number ${i} with enough padding to push the body over the limit` }),
    );
    const envelope = composeJarvisEnvelope({ ...base, messages: many });
    expect(envelope.body.length).toBeLessThanOrEqual(10_000);
    expect(envelope.truncated).toBe(true);
    expect(envelope.omittedCount).toBeGreaterThan(0);
    expect(envelope.body).toContain('Truncated:');
  });

  it('skips empty-text messages', () => {
    const envelope = composeJarvisEnvelope({
      ...base,
      messages: [message({ text: '   ' }), message({ text: 'real' })],
    });
    const lines = envelope.body.split('\n').filter((line) => line.startsWith('[Lin]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('real');
  });

  it('addresses the envelope to the default recipient unless overridden', () => {
    const envelope = composeJarvisEnvelope({ ...base, messages: [message({})] });
    expect(envelope.to).toBe(DEFAULT_SYNC_RECIPIENT);
  });

  it('uses the provided recipient for the envelope', () => {
    const envelope = composeJarvisEnvelope({
      ...base,
      recipient: 'future@jarvis.example.com',
      messages: [message({})],
    });
    expect(envelope.to).toBe('future@jarvis.example.com');
  });

  it('ignores a blank recipient and falls back to the default', () => {
    const envelope = composeJarvisEnvelope({
      ...base,
      recipient: '   ',
      messages: [message({})],
    });
    expect(envelope.to).toBe(DEFAULT_SYNC_RECIPIENT);
  });
});
