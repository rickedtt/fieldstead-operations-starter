import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EmailMessageContent } from './email-message-content';

describe('email message content rendering', () => {
  it('renders text and CID images without interpreting email HTML', () => {
    const html = renderToStaticMarkup(<EmailMessageContent message={{
      id: '8', text: '<script>window.bad = true</script> Hello',
      inlineImages: [{ id: 'attachment-1', filename: 'Signature', contentId: 'sig', contentType: 'image/png', size: 4, dataUrl: 'data:image/png;base64,dGVzdA==' }],
      attachments: [],
    }} onSaveAttachment={vi.fn()} />);
    expect(html).toContain('&lt;script&gt;window.bad = true&lt;/script&gt; Hello');
    expect(html).not.toContain('<script>');
    expect(html).toContain('src="data:image/png;base64,dGVzdA=="');
    expect(html).toContain('Inline image: Signature');
  });

  it('renders downloadable metadata and disables missing content', () => {
    const html = renderToStaticMarkup(<EmailMessageContent message={{
      id: '9', text: '', inlineImages: [], attachments: [
        { id: 'attachment-2', filename: 'proposal.pdf', contentType: 'application/pdf', size: 1536, available: true },
        { id: 'attachment-3', filename: 'missing.bin', contentType: 'application/octet-stream', size: 0, available: false },
      ],
    }} onSaveAttachment={vi.fn()} />);
    expect(html).toContain('proposal.pdf');
    expect(html).toContain('1.5 KB');
    expect(html).toContain('Save attachment');
    expect(html).toContain('Attachment unavailable');
    expect(html).toContain('disabled=""');
  });
});
