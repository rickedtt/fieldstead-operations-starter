import path from 'node:path';

const PREVIEWABLE_TYPES = new Map([
  ['application/pdf', '.pdf'],
  ['image/gif', '.gif'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['text/plain', '.txt'],
]);

export function previewExtension(attachment) {
  return PREVIEWABLE_TYPES.get(String(attachment?.contentType || '').toLowerCase()) || null;
}

export function isPreviewableAttachment(attachment) {
  return Boolean(attachment?.available !== false && previewExtension(attachment));
}

export function previewFilename(attachment) {
  const extension = previewExtension(attachment);
  if (!extension) throw new Error('Preview is unavailable for this attachment type. Save it to inspect it with an appropriate application.');
  const base = path.basename(String(attachment?.filename || 'attachment'), path.extname(String(attachment?.filename || '')));
  return `${base || 'attachment'}${extension}`;
}
