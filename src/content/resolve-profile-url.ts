const MAX_STREAM_BYTES = 512 * 1024;

const SLUG_RE = /\/in\/([a-zA-Z0-9_-]+)\/?/g;

function isEncryptedSlug(slug: string): boolean {
  return /^ACo/.test(slug);
}

export async function resolveCleanProfileUrl(input: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const isMessagingProfileUrl =
    parsed.hostname === 'www.linkedin.com' && parsed.pathname.startsWith('/in/');

  const slugMatch = /^\/in\/([a-zA-Z0-9_-]+)/.exec(parsed.pathname);
  const slug = slugMatch?.[1];
  if (!slug || !isMessagingProfileUrl) {
    return null;
  }
  if (!isEncryptedSlug(slug)) {
    return parsed.origin + `/in/${slug}/`;
  }

  let response: Response;
  try {
    response = await fetch(input, { redirect: 'follow' });
  } catch {
    return null;
  }
  if (!response.ok || !response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let received = 0;

  try {
    while (received < MAX_STREAM_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      received += value.length;

      const found = extractCleanSlug(buffer);
      if (found) {
        await reader.cancel().catch(() => undefined);
        return `https://www.linkedin.com/in/${found}/`;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return null;
}

function extractCleanSlug(html: string): string | null {
  SLUG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLUG_RE.exec(html)) !== null) {
    const candidate = match[1];
    if (!isEncryptedSlug(candidate)) {
      return candidate;
    }
  }
  return null;
}
