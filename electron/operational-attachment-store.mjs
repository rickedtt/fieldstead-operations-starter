import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { safeAttachmentFilename } from './mail-content.mjs';
import { previewExtension } from './attachment-preview.mjs';

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['application/pdf', ['.pdf']],
  ['text/plain', ['.txt']],
]);

function validateReference(value) {
  const normalized = String(value ?? '');
  if (!REFERENCE.test(normalized) || normalized.includes('..')) throw new Error('Invalid attachment reference.');
  return normalized;
}

function validateOwnerType(value) {
  if (value !== 'job' && value !== 'serviceRequest') throw new Error('Attachment owner type is not supported.');
  return value;
}

function validateContentType(value, filename) {
  const contentType = String(value ?? '').toLowerCase();
  const extensions = ALLOWED_TYPES.get(contentType);
  if (!extensions) throw new Error('This attachment type is not allowed.');
  if (!extensions.includes(path.extname(filename).toLowerCase())) throw new Error('Attachment filename does not match its content type.');
  return contentType;
}

function contentDirectory(root, attachmentId) {
  return path.join(root, 'content', Buffer.from(validateReference(attachmentId)).toString('base64url'));
}

async function loadIndex(root) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeIndex(root, items) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = path.join(root, `index-${process.pid}-${Date.now()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(items, null, 2), { mode: 0o600 });
  await fs.rename(temporary, path.join(root, 'index.json'));
}

async function appendAudit(root, event) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.appendFile(path.join(root, 'audit.jsonl'), `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

function publicMetadata(item) {
  return {
    id: item.id, ownerType: item.ownerType, ownerId: item.ownerId, filename: item.filename,
    contentType: item.contentType, size: item.size, checksum: item.checksum,
    createdAt: item.createdAt, createdBy: item.createdBy, source: item.source,
  };
}

export function createOperationalAttachmentStore(rootDirectory, options = {}) {
  const root = path.resolve(rootDirectory);
  const maxBytes = Number(options.maxBytes) || DEFAULT_MAX_BYTES;
  return {
    async importFile(input) {
      const id = validateReference(input.id);
      const ownerType = validateOwnerType(input.ownerType);
      const ownerId = validateReference(input.ownerId);
      const actorId = String(input.actorId ?? '').trim();
      const createdAt = String(input.createdAt ?? '').trim();
      if (!actorId || !createdAt) throw new Error('Attachment audit identity and time are required.');
      const filename = safeAttachmentFilename(input.originalFilename || path.basename(String(input.sourcePath)), 1);
      const contentType = validateContentType(input.contentType, filename);
      const sourcePath = path.resolve(String(input.sourcePath));
      const sourceStat = await fs.stat(sourcePath);
      if (!sourceStat.isFile()) throw new Error('Attachment source must be a file.');
      if (sourceStat.size > maxBytes) throw new Error(`Attachment exceeds the ${maxBytes} byte size limit.`);
      const items = await loadIndex(root);
      if (items.some((item) => item.id === id)) throw new Error('Attachment reference already exists.');
      const directory = contentDirectory(root, id);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const storageName = 'content.bin';
      try {
        const checksumHash = createHash('sha256');
        const checksumHandle = await fs.open(sourcePath, 'r');
        try {
          for await (const chunk of checksumHandle.readableWebStream()) checksumHash.update(Buffer.from(chunk));
        } finally {
          await checksumHandle.close();
        }
        const checksum = `sha256:${checksumHash.digest('hex')}`;
        await fs.copyFile(sourcePath, path.join(directory, storageName));
        await fs.chmod(path.join(directory, storageName), 0o600);
        const item = {
          id, ownerType, ownerId, filename, contentType, size: sourceStat.size, checksum,
          createdAt, createdBy: actorId, source: { kind: String(input.source?.kind || 'desktop-upload') }, storageName,
        };
        await writeIndex(root, [...items, item]);
        await appendAudit(root, { action: 'attachment.added', attachmentId: id, ownerType, ownerId, actorId, occurredAt: createdAt, checksum });
        return publicMetadata(item);
      } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });
        throw error;
      }
    },

    async list(ownerType, ownerId) {
      const type = validateOwnerType(ownerType);
      const id = validateReference(ownerId);
      return (await loadIndex(root)).filter((item) => item.ownerType === type && item.ownerId === id).map(publicMetadata);
    },

    async metadata(attachmentId) {
      const id = validateReference(attachmentId);
      const item = (await loadIndex(root)).find((candidate) => candidate.id === id);
      if (!item) throw new Error('Attachment was not found.');
      return item;
    },

    async contentPath(attachmentId) {
      const item = await this.metadata(attachmentId);
      return { path: path.join(contentDirectory(root, item.id), item.storageName), filename: item.filename, bytes: item.size };
    },

    async exportFile(attachmentId, destination) {
      const item = await this.metadata(attachmentId);
      const source = path.join(contentDirectory(root, item.id), item.storageName);
      const target = path.resolve(String(destination));
      await fs.copyFile(source, target);
      return { path: target, filename: item.filename, bytes: item.size };
    },

    async preview(attachmentId) {
      const item = await this.metadata(attachmentId);
      const extension = previewExtension(item);
      if (!extension) throw new Error('Preview is unavailable for this attachment type. Export it to inspect it with an appropriate application.');
      const directory = contentDirectory(root, item.id);
      const target = path.join(directory, `preview${extension}`);
      await fs.copyFile(path.join(directory, item.storageName), target);
      return { path: target, filename: item.filename, bytes: item.size };
    },

    async delete(attachmentId, input) {
      const item = await this.metadata(attachmentId);
      const actorId = String(input?.actorId ?? '').trim();
      const deletedAt = String(input?.deletedAt ?? '').trim();
      if (!actorId || !deletedAt) throw new Error('Attachment deletion audit identity and time are required.');
      const items = await loadIndex(root);
      await fs.rm(contentDirectory(root, item.id), { recursive: true, force: true });
      await writeIndex(root, items.filter((candidate) => candidate.id !== item.id));
      const tombstone = { ...publicMetadata(item), deletedAt, deletedBy: actorId };
      await appendAudit(root, { action: 'attachment.deleted', attachmentId: item.id, ownerType: item.ownerType, ownerId: item.ownerId, actorId, occurredAt: deletedAt, checksum: item.checksum });
      return tombstone;
    },

    async backupManifest() {
      const attachments = (await loadIndex(root)).map(publicMetadata);
      return {
        version: 1,
        createdAt: new Date().toISOString(),
        attachmentCount: attachments.length,
        contentIncluded: false,
        warning: attachments.length ? 'Managed attachment content is not included in the JSON backup. Copy the desktop attachment store with the backup.' : 'No managed attachment content exists.',
        attachments,
      };
    },

    async auditPath() {
      return { path: path.join(root, 'audit.jsonl') };
    },
  };
}

export const OPERATIONAL_ATTACHMENT_MAX_BYTES = DEFAULT_MAX_BYTES;
export const OPERATIONAL_ATTACHMENT_MIME_TYPES = Object.freeze([...ALLOWED_TYPES.keys()]);
