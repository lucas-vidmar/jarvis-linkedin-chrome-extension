import { SCOPE_OPTIONS, type ScopeId } from '@/shared/scopes';

const configuredRecipient: string | undefined = import.meta.env.WXT_JARVIS_RECIPIENT;

export const JARVIS_RECIPIENT =
  typeof configuredRecipient === 'string' && configuredRecipient.trim() !== ''
    ? configuredRecipient.trim()
    : 'jarvis@agileengine.com';
export const MAX_BODY_CHARS = 10_000;

export type SenderKey = 'self' | 'contact';

export interface ComposerMessage {
  senderKey: SenderKey;
  timestampMs: number | null;
  text: string;
}

export interface ComposerInput {
  contactName: string;
  contactUrl: string;
  selfName: string;
  scope: ScopeId;
  syncedAt: Date;
  messages: ComposerMessage[];
}

export interface JarvisEnvelope {
  to: string;
  subject: string;
  body: string;
  truncated: boolean;
  omittedCount: number;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatClockTime(date: Date): string {
  let hours = date.getHours();
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${pad(date.getMinutes())} ${meridiem}`;
}

function formatMdy(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function scopeLabel(scope: ScopeId): string {
  return SCOPE_OPTIONS.find((option) => option.id === scope)?.label ?? scope;
}

function sortMessages(messages: ComposerMessage[]): ComposerMessage[] {
  let carry: number | null = null;
  const keys = messages.map((message) => {
    const key = message.timestampMs ?? carry;
    if (message.timestampMs !== null) {
      carry = message.timestampMs;
    }
    return key;
  });

  let lookahead: number | null = null;
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    if (keys[index] === null) {
      keys[index] = lookahead;
    } else {
      lookahead = keys[index];
    }
  }

  return messages
    .map((message, index) => ({ message, key: keys[index], index }))
    .sort((a, b) => {
      if (a.key !== null && b.key !== null) {
        return a.key - b.key || a.index - b.index;
      }
      if (a.key === null && b.key === null) {
        return a.index - b.index;
      }
      return a.key === null ? 1 : -1;
    })
    .map((entry) => entry.message);
}

export function composeJarvisEnvelope(input: ComposerInput): JarvisEnvelope {
  const sorted = sortMessages(input.messages);
  const contactName = input.contactName.trim() || 'Contact';
  const selfName = input.selfName.trim() || 'You';
  const parts = [input.contactUrl, `Synced ${formatDate(input.syncedAt)} — ${scopeLabel(input.scope)}`, ''];

  let size = parts.join('\n').length;
  let truncated = false;
  let omittedCount = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const message = sorted[index];
    const text = message.text.trim();
    if (!text) {
      continue;
    }
    const senderName = message.senderKey === 'self' ? selfName : contactName;

    let stamp = '';
    if (message.timestampMs !== null) {
      const date = new Date(message.timestampMs);
      if (!Number.isNaN(date.getTime())) {
        stamp = ` [${formatClockTime(date)} - ${formatMdy(date)}]`;
      }
    }

    const line = `[${senderName}]${stamp} ${text}`;
    const additional = line.length + 1;
    if (size + additional > MAX_BODY_CHARS) {
      truncated = true;
      omittedCount = sorted.length - index;
      break;
    }
    parts.push(line);
    size += additional;
  }

  if (truncated) {
    let notice = `[Truncated: ${omittedCount} message(s) omitted — thread exceeded the email size limit]`;
    while (size + notice.length + 1 > MAX_BODY_CHARS && parts.length > 3) {
      const dropped = parts.pop() ?? '';
      size -= dropped.length + 1;
      omittedCount += 1;
      notice = `[Truncated: ${omittedCount} message(s) omitted — thread exceeded the email size limit]`;
    }
    parts.push(notice);
  }

  return {
    to: JARVIS_RECIPIENT,
    subject: `LinkedIn sync: ${contactName}`,
    body: parts.join('\n'),
    truncated,
    omittedCount,
  };
}

export function composeComposeUrl(envelope: JarvisEnvelope): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: envelope.to,
    su: envelope.subject,
    body: envelope.body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
