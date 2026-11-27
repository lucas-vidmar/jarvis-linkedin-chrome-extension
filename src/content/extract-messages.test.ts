// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractMessages,
  extractMessagesWithRows,
} from '@/content/extract-messages';
import { computeMessageFingerprint } from '@/shared/fingerprint';
import {
  CONTACT_URL,
  renderMessageList,
  renderThread,
  renderThreadWithGroups,
  resetDom,
  type DayGroupFixture,
} from '@/content/test-fixtures/linkedin-dom';

const NOW = new Date(2026, 7, 14, 12, 0, 0); // Friday, 14 Aug 2026, local noon
const CONTACT = { contactName: 'Ada Lovelace', contactUrl: CONTACT_URL };

function localStamp(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): number {
  return new Date(year, month, day, hours, minutes).getTime();
}

function mountGroups(groups: DayGroupFixture[]): HTMLElement {
  document.body.innerHTML = renderThreadWithGroups(groups);
  const root = document.querySelector<HTMLElement>('.msg-thread');
  if (!root) throw new Error('fixture did not render a thread root');
  return root;
}

describe('extractMessages', () => {
  beforeEach(() => {
    resetDom();
  });

  it('reads sender direction, text and datetimes in DOM order', async () => {
    const root = mountGroups([
      {
        header: 'Today',
        rows: [
          { text: 'Hi Ada', datetime: '2026-08-14T09:30:00' },
          { text: 'Hi Lin', sender: 'contact', datetime: '2026-08-14T09:31:00' },
        ],
      },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.senderKey)).toEqual(['self', 'contact']);
    expect(messages.map((message) => message.text)).toEqual(['Hi Ada', 'Hi Lin']);
    expect(messages.map((message) => message.timestampMs)).toEqual([
      localStamp(2026, 7, 14, 9, 30),
      localStamp(2026, 7, 14, 9, 31),
    ]);
  });

  it('resolves visible clock times against the day header', async () => {
    const root = mountGroups([
      {
        header: 'Today',
        rows: [
          { text: 'morning', time: '9:30 AM' },
          { text: 'midnight', time: '12:05 AM' },
          { text: 'noon-ish', time: '12:45 PM' },
          { text: 'late', time: '11:59 PM' },
        ],
      },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);

    expect(messages.map((message) => message.timestampMs)).toEqual([
      localStamp(2026, 7, 14, 9, 30),
      localStamp(2026, 7, 14, 0, 5),
      localStamp(2026, 7, 14, 12, 45),
      localStamp(2026, 7, 14, 23, 59),
    ]);
  });

  it('resolves relative day headers (today, yesterday, weekday names)', async () => {
    const root = mountGroups([
      { header: 'Yesterday', rows: [{ text: 'a', time: '10:00 AM' }] },
      { header: 'Monday', rows: [{ text: 'b', time: '10:00 AM' }] },
      { header: 'Sunday', rows: [{ text: 'c', time: '10:00 AM' }] },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);

    expect(messages.map((message) => message.timestampMs)).toEqual([
      localStamp(2026, 7, 13, 10, 0),
      localStamp(2026, 7, 10, 10, 0),
      localStamp(2026, 7, 9, 10, 0),
    ]);
  });

  it('resolves dated headers, including an implied year and rollover', async () => {
    const root = mountGroups([
      { header: 'Aug 12', rows: [{ text: 'a', time: '8:15 AM' }] },
      { header: 'August 12', rows: [{ text: 'b', time: '8:16 AM' }] },
      { header: 'Aug 12, 2025', rows: [{ text: 'c', time: '8:17 AM' }] },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages.map((message) => message.timestampMs)).toEqual([
      localStamp(2026, 7, 12, 8, 15),
      localStamp(2026, 7, 12, 8, 16),
      localStamp(2025, 7, 12, 8, 17),
    ]);

    // A date later in the calendar year than "now" must be last year.
    const january = new Date(2026, 0, 10, 12);
    const rolloverRoot = mountGroups([
      { header: 'Dec 31', rows: [{ text: 'new year', time: '11:00 PM' }] },
    ]);
    const rolled = await extractMessages(rolloverRoot, CONTACT, january);
    expect(rolled[0]?.timestampMs).toBe(localStamp(2025, 11, 31, 23, 0));
  });

  it('ignores unknown or impossible day headers and clock times', async () => {
    const root = mountGroups([
      { header: 'Someday 12', rows: [{ text: 'no day', time: '9:30 AM' }] },
      { header: 'Today', rows: [{ text: 'bad time', time: '25:99' }] },
      { header: 'Feb 30', rows: [{ text: 'bad date', time: '9:30 AM' }] },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages.map((message) => message.timestampMs)).toEqual([null, null, null]);
    expect(messages.map((message) => message.fingerprint)).toEqual([null, null, null]);
  });

  it('carries the last timestamp forward to rows without their own time', async () => {
    const root = mountGroups([
      {
        header: 'Today',
        rows: [
          { text: 'first', time: '9:30 AM' },
          { text: 'follow-up' },
          { text: 'third', time: '9:35 AM' },
          { text: 'follow-up again' },
        ],
      },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages.map((message) => message.timestampMs)).toEqual([
      localStamp(2026, 7, 14, 9, 30),
      localStamp(2026, 7, 14, 9, 30),
      localStamp(2026, 7, 14, 9, 35),
      localStamp(2026, 7, 14, 9, 35),
    ]);
  });

  it('resets the carried timestamp when a new day header appears', async () => {
    const root = mountGroups([
      {
        header: 'Yesterday',
        rows: [
          { text: 'yesterday first', time: '9:30 AM' },
          { text: 'yesterday carry' },
        ],
      },
      {
        header: 'Today',
        rows: [{ text: 'today carry' }, { text: 'today timed', time: '8:00 AM' }],
      },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages.map((message) => message.timestampMs)).toEqual([
      localStamp(2026, 7, 13, 9, 30),
      localStamp(2026, 7, 13, 9, 30),
      null,
      localStamp(2026, 7, 14, 8, 0),
    ]);
  });

  it('keeps carrying the timestamp into a following group without its own header', async () => {
    const root = mountGroups([
      { header: 'Today', rows: [{ text: 'timed', time: '9:30 AM' }] },
      { rows: [{ text: 'untimed in next group' }] },
    ]);

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages.map((message) => message.timestampMs)).toEqual([
      localStamp(2026, 7, 14, 9, 30),
      localStamp(2026, 7, 14, 9, 30),
    ]);
  });

  it('produces stable fingerprints, one per sender and message', async () => {
    const root = mountGroups([
      {
        header: 'Today',
        rows: [
          { text: 'Hi Ada', time: '9:30 AM' },
          { text: 'Hi Lin', sender: 'contact', time: '9:31 AM' },
          { text: '  Hi   Ada  ', time: '9:32 AM' },
        ],
      },
    ]);

    const first = await extractMessages(root, CONTACT, NOW);
    const second = await extractMessages(root, CONTACT, NOW);

    expect(first.map((message) => message.fingerprint)).toEqual(
      second.map((message) => message.fingerprint),
    );
    expect(first.every((message) => message.fingerprint?.length === 64)).toBe(true);
    expect(new Set(first.map((message) => message.fingerprint)).size).toBe(3);

    expect(first[0]?.fingerprint).toBe(
      await computeMessageFingerprint({
        senderKey: 'self',
        epochMs: localStamp(2026, 7, 14, 9, 30),
        text: 'Hi Ada',
      }),
    );
    expect(first[1]?.fingerprint).toBe(
      await computeMessageFingerprint({
        senderKey: CONTACT_URL,
        epochMs: localStamp(2026, 7, 14, 9, 31),
        text: 'Hi Lin',
      }),
    );
    // Whitespace is normalized before hashing.
    expect(first[2]?.fingerprint).toBe(
      await computeMessageFingerprint({
        senderKey: 'self',
        epochMs: localStamp(2026, 7, 14, 9, 32),
        text: 'Hi Ada',
      }),
    );
  });

  it('returns the row alongside each message', async () => {
    const root = mountGroups([
      { header: 'Today', rows: [{ text: 'one', time: '9:30 AM' }, { text: 'two', time: '9:31 AM' }] },
    ]);

    const entries = await extractMessagesWithRows(root, CONTACT, NOW);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.row).toBe(root.querySelectorAll('.msg-s-event-listitem')[0]);
    expect(entries[1]?.row).toBe(root.querySelectorAll('.msg-s-event-listitem')[1]);
  });

  it('falls back to cleaned row text when the canonical body is missing', async () => {
    document.body.innerHTML = renderThread({
      listHtml: renderMessageList([
        {
          header: 'Today',
          rows: [{ text: 'unused', time: '9:30 AM', omitBody: true }],
        },
      ]),
    });
    const row = document.querySelector<HTMLElement>('.msg-s-event-listitem')!;
    row.innerHTML = `
      Hello <strong>world</strong>
      <time class="msg-s-message-group__timestamp">9:30 AM</time>
      <button type="button">Actions</button>
      <a class="msg-s-event-listitem__link" href="#">link</a>
      <span class="msg-s-message-group__meta" aria-label="meta">meta</span>`;
    const root = document.querySelector<HTMLElement>('.msg-thread')!;

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe('Hello world');
    expect(messages[0]?.timestampMs).toBe(localStamp(2026, 7, 14, 9, 30));
  });

  it('collapses whitespace in the canonical body', async () => {
    document.body.innerHTML = renderThread({
      listHtml: renderMessageList([
        {
          header: 'Today',
          rows: [{ text: 'ignored', time: '9:30 AM' }],
        },
      ]),
    });
    document.querySelector('.msg-s-event-listitem__body')!.textContent = '  Hello \n\n  world  ';
    const root = document.querySelector<HTMLElement>('.msg-thread')!;

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages[0]?.text).toBe('Hello world');
  });

  it('skips empty, hidden and aria-hidden rows and hidden groups', async () => {
    const root = mountGroups([
      {
        header: 'Today',
        rows: [
          { text: '   ', time: '9:30 AM' },
          { text: 'hidden row', time: '9:31 AM', hidden: true },
          { text: 'visible row', time: '9:32 AM' },
        ],
      },
      {
        header: 'Yesterday',
        rows: [{ text: 'hidden group', time: '9:33 AM' }],
      },
    ]);
    root.querySelectorAll('.msg-s-message-list__event')[1]?.setAttribute('style', 'display: none');
    const ariaHidden = document.createElement('div');
    ariaHidden.className = 'msg-s-event-listitem';
    ariaHidden.setAttribute('aria-hidden', 'true');
    ariaHidden.innerHTML = '<p class="msg-s-event-listitem__body">aria hidden</p>';
    root.querySelector('.msg-s-message-list__event')?.append(ariaHidden);

    const messages = await extractMessages(root, CONTACT, NOW);
    expect(messages.map((message) => message.text)).toEqual(['visible row']);
  });
});
