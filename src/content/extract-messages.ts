import { SELECTORS, isVisible, type ContactRef } from '@/content/detect-conversation';
import type { ComposerMessage, SenderKey } from '@/shared/composer';
import { computeMessageFingerprint } from '@/shared/fingerprint';

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const DAY_HEADER_RE = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i;
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function readText(row: HTMLElement): string {
  for (const selector of SELECTORS.messageText) {
    const node = row.querySelector<HTMLElement>(selector);
    if (node?.textContent) {
      return node.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  const clone = row.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('time, button, [aria-label], .msg-s-event-listitem__link, .msg-s-message-group__meta').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function resolveDayHeader(value: string, now: Date): Date | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  }
  if (trimmed === 'yesterday') {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    return yesterday;
  }
  const weekdayIndex = WEEKDAY_INDEX[trimmed];
  if (weekdayIndex !== undefined) {
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const daysBack = (target.getDay() - weekdayIndex + 7) % 7;
    return new Date(target.getFullYear(), target.getMonth(), target.getDate() - daysBack, 12);
  }
  const match = DAY_HEADER_RE.exec(value.trim());
  if (!match) return null;
  const month = MONTHS[match[1] as keyof typeof MONTHS];
  if (month === undefined) return null;
  const day = Number(match[2]);
  const year = match[3] ? Number(match[3]) : now.getFullYear();
  const candidate = new Date(year, month, day, 12);
  if (Number.isNaN(candidate.getTime())) return null;
  if (candidate.getMonth() !== month || candidate.getDate() !== day) return null;
  if (!match[3] && candidate.getTime() > now.getTime()) {
    return new Date(year - 1, month, day, 12);
  }
  return candidate;
}

function readTimestamp(row: HTMLElement, day: Date | null, now: Date): number | null {
  for (const selector of SELECTORS.messageTimestamp) {
    const node = row.querySelector<HTMLElement>(selector);
    const value = node?.getAttribute('datetime') ?? node?.textContent ?? '';
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
    const time = parseTime(value);
    if (time && day) {
      return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes).getTime();
    }
  }
  return null;
}

function readSender(row: HTMLElement): SenderKey {
  for (const selector of SELECTORS.contactMessageMarkers) {
    if (row.closest(selector)) {
      return 'contact';
    }
  }
  return 'self';
}

export interface ExtractedRow {
  row: HTMLElement;
  message: ComposerMessage;
}

export async function extractMessagesWithRows(
  root: HTMLElement,
  contact: ContactRef,
  now = new Date(),
): Promise<ExtractedRow[]> {
  const entries: ExtractedRow[] = [];
  let currentDay: Date | null = null;
  let carryTimestamp: number | null = null;

  for (const groupSelector of SELECTORS.messageDayGroups) {
    for (const group of root.querySelectorAll<HTMLElement>(groupSelector)) {
      if (!isVisible(group)) continue;
      for (const headerSelector of SELECTORS.messageDayHeader) {
        const header = group.querySelector<HTMLElement>(headerSelector);
        const headerText = header?.textContent?.trim() ?? '';
        if (headerText) {
          currentDay = resolveDayHeader(headerText, now);
          carryTimestamp = null;
        }
      }

      const seen = new Set<HTMLElement>();
      for (const rowSelector of SELECTORS.messageRows) {
        for (const row of group.querySelectorAll<HTMLElement>(rowSelector)) {
          if (!isVisible(row)) continue;
          if (seen.has(row)) continue;
          seen.add(row);
          const text = readText(row);
          if (!text) continue;
          const senderKey = readSender(row);
          const ownTimestamp = readTimestamp(row, currentDay, now);
          const timestampMs = ownTimestamp ?? carryTimestamp;
          if (ownTimestamp !== null) {
            carryTimestamp = ownTimestamp;
          }
          entries.push({
            row,
            message: {
              senderKey,
              timestampMs,
              text,
              fingerprint: await computeMessageFingerprint({
                senderKey: senderKey === 'self' ? 'self' : contact.contactUrl,
                epochMs: timestampMs,
                text,
              }),
            },
          });
        }
      }
    }
  }

  return entries;
}

export async function extractMessages(root: HTMLElement, contact: ContactRef, now = new Date()): Promise<ComposerMessage[]> {
  const entries = await extractMessagesWithRows(root, contact, now);
  return entries.map((entry) => entry.message);
}
