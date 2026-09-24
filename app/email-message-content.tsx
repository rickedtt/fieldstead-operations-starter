export type EmailAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  available: boolean;
};

const PREVIEWABLE_ATTACHMENT_TYPES = new Set(['application/pdf', 'image/gif', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']);

export function canPreviewAttachment(attachment: EmailAttachment) {
  return attachment.available && PREVIEWABLE_ATTACHMENT_TYPES.has(attachment.contentType.toLowerCase());
}

export type EmailInlineImage = Omit<EmailAttachment, 'available'> & {
  contentId: string;
  dataUrl: string;
};

export type EmailTextPart = { type: 'text' | 'link'; value: string };

const HTTP_LINK_PATTERN = /https?:\/\/[^\s<>]+/gi;
const TRAILING_LINK_PUNCTUATION = /[.,!?;:)}\]>'"]+$/;

export function linkifyEmailText(text: string): EmailTextPart[] {
  const parts: EmailTextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(HTTP_LINK_PATTERN)) {
    const start = match.index ?? 0;
    const candidate = match[0];
    const trailing = candidate.match(TRAILING_LINK_PUNCTUATION)?.[0] || '';
    const url = trailing ? candidate.slice(0, -trailing.length) : candidate;
    if (start > cursor) parts.push({ type: 'text', value: text.slice(cursor, start) });
    if (url) parts.push({ type: 'link', value: url });
    if (trailing) parts.push({ type: 'text', value: trailing });
    cursor = start + candidate.length;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}

export type RenderableEmailMessage = {
  id: string;
  text: string;
  inlineImages?: EmailInlineImage[];
  attachments?: EmailAttachment[];
};

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailMessageContent({ message, onOpenExternalLink, onPreviewAttachment, onSaveAttachment }: {
  message: RenderableEmailMessage;
  onOpenExternalLink: (url: string) => void;
  onPreviewAttachment: (attachment: EmailAttachment) => void;
  onSaveAttachment: (attachment: EmailAttachment) => void;
}) {
  const inlineImages = message.inlineImages || [];
  const attachments = message.attachments || [];
  return <div className="email-message-content">
    {message.text ? <p className="email-message-body">{linkifyEmailText(message.text).map((part, index) => part.type === 'link'
      ? <a key={`${index}-${part.value}`} href={part.value} onClick={(event) => { event.preventDefault(); onOpenExternalLink(part.value); }}>{part.value}</a>
      : <span key={`${index}-${part.value}`}>{part.value}</span>)}</p> : inlineImages.length === 0 && <p className="email-message-empty">No message content available.</p>}
    {inlineImages.length > 0 && <div className="email-inline-images">
      {inlineImages.map((image) => <figure key={image.id}>
        {/* MIME is restricted to a small raster allowlist before this data URL reaches the renderer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.dataUrl} alt={`Inline image: ${image.filename}`} loading="lazy" />
        <figcaption>{image.filename}</figcaption>
      </figure>)}
    </div>}
    {attachments.length > 0 && <div className="email-attachments" aria-label="Attachments">
      <p className="email-attachments-title">Attachments <span>{attachments.length}</span></p>
      <div className="email-attachment-grid">{attachments.map((attachment) => <div className="email-attachment" key={attachment.id}>
        <span className="email-attachment-icon" aria-hidden="true">↧</span>
        <span><strong>{attachment.filename}</strong><small>{attachment.contentType} · {formatFileSize(attachment.size)}</small></span>
        <span className="email-attachment-actions">
          {canPreviewAttachment(attachment)
            ? <button type="button" className="secondary" onClick={() => onPreviewAttachment(attachment)}>Preview</button>
            : <small>{attachment.available ? 'Preview unavailable' : 'Attachment unavailable'}</small>}
          <button type="button" className="secondary" disabled={!attachment.available} onClick={() => onSaveAttachment(attachment)}>
            {attachment.available ? 'Save attachment' : 'Attachment unavailable'}
          </button>
        </span>
      </div>)}</div>
    </div>}
  </div>;
}
