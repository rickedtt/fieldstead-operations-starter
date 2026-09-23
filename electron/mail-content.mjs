const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function text(value) {
  return typeof value === 'string' ? value : '';
}

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1]?.toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    try { return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match; } catch { return match; }
  });
}

function htmlToSafeText(html) {
  return decodeEntities(text(html)
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeContentId(value) {
  return text(value).trim().replace(/^<|>$/g, '').toLowerCase();
}

export function safeAttachmentFilename(value, index = 1) {
  const basename = text(value).replaceAll('\\', '/').split('/').pop()?.trim() || `attachment-${index}`;
  let safe = basename.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').replace(/[. ]+$/g, '').slice(0, 180);
  if (!safe) safe = `attachment-${index}`;
  if (WINDOWS_RESERVED.test(safe)) safe = `_${safe}`;
  return safe;
}

function attachmentBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return null;
}

export function parseMailContent(parsed) {
  if (!parsed || typeof parsed !== 'object') return { text: '', inlineImages: [], attachments: [], files: [] };
  const html = text(parsed.html);
  const referencedCids = new Set();
  for (const match of html.matchAll(/\bcid\s*:\s*([^\s"'<>]+)/gi)) referencedCids.add(normalizeContentId(match[1]));
  let body = text(parsed.text);
  for (const match of body.matchAll(/\[cid\s*:\s*([^\]]+)\]/gi)) referencedCids.add(normalizeContentId(match[1]));
  body = body.replace(/\[cid\s*:\s*[^\]]+\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) body = htmlToSafeText(html);

  const inlineImages = [];
  const attachments = [];
  const files = [];
  const sourceAttachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  sourceAttachments.forEach((attachment, zeroIndex) => {
    const index = zeroIndex + 1;
    const id = `attachment-${index}`;
    const filename = safeAttachmentFilename(attachment?.filename, index);
    const contentType = text(attachment?.contentType).trim().toLowerCase() || 'application/octet-stream';
    const contentId = normalizeContentId(attachment?.contentId || attachment?.cid);
    const content = attachmentBuffer(attachment?.content);
    const size = Number.isFinite(attachment?.size) && attachment.size >= 0 ? attachment.size : (content?.length || 0);
    const isInline = Boolean(contentId) && INLINE_IMAGE_TYPES.has(contentType) && Boolean(content) && content.length <= MAX_INLINE_IMAGE_BYTES &&
      (referencedCids.has(contentId) || text(attachment?.contentDisposition).toLowerCase() === 'inline');
    const file = { id, filename, contentType, content, size, available: Boolean(content) };
    files.push(file);
    if (isInline) {
      inlineImages.push({
        id, filename, contentId, contentType, size,
        dataUrl: `data:${contentType};base64,${content.toString('base64')}`,
      });
    } else {
      attachments.push({ id, filename, contentType, size, available: Boolean(content) });
    }
  });

  return { text: body, inlineImages, attachments, files };
}
