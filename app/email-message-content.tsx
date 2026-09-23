export type EmailAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  available: boolean;
};

export type EmailInlineImage = Omit<EmailAttachment, 'available'> & {
  contentId: string;
  dataUrl: string;
};

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

export function EmailMessageContent({ message, onSaveAttachment }: {
  message: RenderableEmailMessage;
  onSaveAttachment: (attachment: EmailAttachment) => void;
}) {
  const inlineImages = message.inlineImages || [];
  const attachments = message.attachments || [];
  return <div className="email-message-content">
    {message.text ? <p className="email-message-body">{message.text}</p> : inlineImages.length === 0 && <p className="email-message-empty">No message content available.</p>}
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
        <button type="button" className="secondary" disabled={!attachment.available} onClick={() => onSaveAttachment(attachment)}>
          {attachment.available ? 'Save attachment' : 'Attachment unavailable'}
        </button>
      </div>)}</div>
    </div>}
  </div>;
}
