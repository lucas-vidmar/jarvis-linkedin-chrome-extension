// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { syncZohoJarvisLink } from '@/content/zoho-jarvis-button';

const JARVIS_URL = 'https://jarvis.agileengine.com/contacts/998335000461306666';

function mountedLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-jarvis-zoho-link]'));
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('syncZohoJarvisLink', () => {
  it('mounts one link next to the Send Email anchor on a contact page', () => {
    document.body.innerHTML =
      '<a class="em-send-email" aria-label="Send Email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);

    const links = mountedLinks();
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.getAttribute('href')).toBe(JARVIS_URL);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toBe('Jarvis');
    expect(link.getAttribute('aria-label')).toBe('Open in Jarvis');
    expect(link.className).toContain('em-send-email');
    expect(link.previousElementSibling?.getAttribute('aria-label')).toBe('Send Email');

    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);
  });

  it('mounts nothing for a null URL and removes an already mounted link', () => {
    syncZohoJarvisLink(null);
    expect(mountedLinks()).toHaveLength(0);

    document.body.innerHTML =
      '<a aria-label="Send Email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);

    syncZohoJarvisLink(null);
    expect(mountedLinks()).toHaveLength(0);
  });

  it('mounts nothing when no Send Email anchor exists, and removes an orphaned link', () => {
    document.body.innerHTML = '<div class="action-bar"></div>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(0);

    document.body.innerHTML =
      '<a aria-label="Send Email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);

    document.querySelector('[aria-label="Send Email"]')?.remove();
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(0);
  });

  it('matches the Send Email label case-insensitively', () => {
    document.body.innerHTML = '<a aria-label="send email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);
  });
});