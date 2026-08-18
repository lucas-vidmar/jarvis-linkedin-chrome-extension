import { describe, expect, it } from 'vitest';
import { zohoContactUrlToJarvis } from '@/shared/zoho-url';

const CONTACT_ID = '998335000461306666';
const JARVIS_URL = `https://jarvis.agileengine.com/contacts/${CONTACT_ID}`;

describe('zohoContactUrlToJarvis', () => {
  it('maps a Zoho contact detail URL to its Jarvis contact URL', () => {
    expect(
      zohoContactUrlToJarvis(`https://crm.zoho.com/crm/org31013314/tab/Contacts/${CONTACT_ID}`),
    ).toBe(JARVIS_URL);
  });

  it('tolerates a trailing slash after the record id', () => {
    expect(
      zohoContactUrlToJarvis(`https://crm.zoho.com/crm/org31013314/tab/Contacts/${CONTACT_ID}/`),
    ).toBe(JARVIS_URL);
  });

  it('tolerates extra path segments after the record id', () => {
    expect(
      zohoContactUrlToJarvis(
        `https://crm.zoho.com/crm/org31013314/tab/Contacts/${CONTACT_ID}/Notes`,
      ),
    ).toBe(JARVIS_URL);
  });

  it('tolerates a hash suffix after the record id', () => {
    expect(
      zohoContactUrlToJarvis(`https://crm.zoho.com/crm/org31013314/tab/Contacts/${CONTACT_ID}#/Notes`),
    ).toBe(JARVIS_URL);
  });

  it('tolerates a query string after the record id', () => {
    expect(
      zohoContactUrlToJarvis(
        `https://crm.zoho.com/crm/org31013314/tab/Contacts/${CONTACT_ID}?tab=activity`,
      ),
    ).toBe(JARVIS_URL);
  });

  it('returns null for a contact list page (no record id)', () => {
    expect(zohoContactUrlToJarvis('https://crm.zoho.com/crm/org31013314/tab/Contacts')).toBeNull();
  });

  it('returns null for other record tabs', () => {
    expect(zohoContactUrlToJarvis('https://crm.zoho.com/crm/org31013314/tab/Deals/123')).toBeNull();
  });

  it('returns null for ContactsList, which is not a Contacts record', () => {
    expect(zohoContactUrlToJarvis('https://crm.zoho.com/crm/org31013314/tab/ContactsList/123')).toBeNull();
  });

  it('returns null for malformed URLs without the Contacts segment', () => {
    expect(zohoContactUrlToJarvis('https://crm.zoho.com/crm/org31013314/')).toBeNull();
    expect(zohoContactUrlToJarvis('https://crm.zoho.com/')).toBeNull();
  });

  it('returns null when the record id is not numeric', () => {
    expect(zohoContactUrlToJarvis('https://crm.zoho.com/crm/org31013314/tab/Contacts/abc')).toBeNull();
  });

  it('returns null for non-Zoho hosts', () => {
    expect(zohoContactUrlToJarvis('https://example.com/crm/org31013314/tab/Contacts/123')).toBeNull();
    expect(zohoContactUrlToJarvis('https://mail.zoho.com/crm/org31013314/tab/Contacts/123')).toBeNull();
  });

  it('accepts any crm.zoho.* regional host', () => {
    expect(
      zohoContactUrlToJarvis(`https://crm.zoho.eu/crm/org31013314/tab/Contacts/${CONTACT_ID}`),
    ).toBe(JARVIS_URL);
    expect(
      zohoContactUrlToJarvis(`https://crm.zoho.in/crm/org31013314/tab/Contacts/${CONTACT_ID}`),
    ).toBe(JARVIS_URL);
  });

  it('returns null for non-https Zoho URLs', () => {
    expect(
      zohoContactUrlToJarvis(`http://crm.zoho.com/crm/org31013314/tab/Contacts/${CONTACT_ID}`),
    ).toBeNull();
  });

  it('returns null for non-URL input', () => {
    expect(zohoContactUrlToJarvis('not a url')).toBeNull();
    expect(zohoContactUrlToJarvis('')).toBeNull();
  });
});