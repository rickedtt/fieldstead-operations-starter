import fs from 'node:fs/promises';
import path from 'node:path';

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/;

function validateReference(value) {
  const normalized = String(value ?? '');
  if (!REFERENCE.test(normalized) || normalized.includes('..')) throw new Error('Invalid attachment reference.');
  return normalized;
}

function referenceDirectory(root, accountId, messageId) {
  const account = validateReference(accountId);
  const message = validateReference(messageId);
  return path.join(root, Buffer.from(account).toString('base64url'), Buffer.from(message).toString('base64url'));
}

export function createAttachmentStore(rootDirectory) {
  const root = path.resolve(rootDirectory);
  return {
    async cacheMessage(accountId, messageId, attachments) {
      const directory = referenceDirectory(root, accountId, messageId);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const metadata = [];
      for (const attachment of Array.isArray(attachments) ? attachments : []) {
        const id = validateReference(attachment.id);
        const content = Buffer.isBuffer(attachment.content) ? attachment.content :
          attachment.content instanceof Uint8Array ? Buffer.from(attachment.content) : null;
        const item = {
          id,
          filename: String(attachment.filename || id),
          contentType: String(attachment.contentType || 'application/octet-stream'),
          size: content?.length || Number(attachment.size) || 0,
          available: Boolean(content),
        };
        if (content) await fs.writeFile(path.join(directory, `${id}.bin`), content, { mode: 0o600 });
        metadata.push(item);
      }
      await fs.writeFile(path.join(directory, 'index.json'), JSON.stringify(metadata), { mode: 0o600 });
      return metadata;
    },

    async metadata(accountId, messageId, attachmentId) {
      const directory = referenceDirectory(root, accountId, messageId);
      const id = validateReference(attachmentId);
      let items;
      try { items = JSON.parse(await fs.readFile(path.join(directory, 'index.json'), 'utf8')); }
      catch { throw new Error('Attachment metadata is not available. Sync this message again.'); }
      const item = Array.isArray(items) ? items.find((candidate) => candidate?.id === id) : null;
      if (!item) throw new Error('Attachment was not found.');
      return { directory, item };
    },

    async save(accountId, messageId, attachmentId, destination) {
      const { directory, item } = await this.metadata(accountId, messageId, attachmentId);
      if (!item.available) throw new Error('Attachment content is not available. Sync this message again.');
      const target = path.resolve(String(destination));
      await fs.copyFile(path.join(directory, `${item.id}.bin`), target);
      return { path: target, filename: item.filename, bytes: item.size };
    },
  };
}
