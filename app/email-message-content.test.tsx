import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EmailMessageContent, linkifyEmailText } from './email-message-content';

describe('email message content rendering', () => {
  it('detects ordinary HTTP and HTTPS links while preserving surrounding plain text', () => {
    expect(linkifyEmailText('See https://fieldstead.example/jobs and http://example.test/help.')).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', value: 'https://fieldstead.example/jobs' },
      { type: 'text', value: ' and ' },
      { type: 'link', value: 'http://example.test/help' },
      { type: 'text', value: '.' },
    ]);
  });

  it('does not linkify unsafe schemes or inject email HTML', () => {
    const html = renderToStaticMarkup(<EmailMessageContent message={{
      id: 'unsafe-links',
      text: '<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,bad file:///etc/passwd https://safe.example/path',
    }} onOpenExternalLink={vi.fn()} onPreviewAttachment={vi.fn()} onSaveAttachment={vi.fn()} />);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href=\"javascript:');
    expect(html).not.toContain('href=\"data:');
    expect(html).not.toContain('href=\"file:');
    expect(html).toContain('href=\"https://safe.example/path\"');
    expect(html).not.toContain('target=\"_blank\"');
  });

  it('renders text and CID images without interpreting email HTML', () => {
    const html = renderToStaticMarkup(<EmailMessageContent message={{
      id: '8', text: '<script>window.bad = true</script> Hello',
      inlineImages: [{ id: 'attachment-1', filename: 'Signature', contentId: 'sig', contentType: 'image/png', size: 4, dataUrl: 'data:image/png;base64,dGVzdA==' }],
      attachments: [],
    }} onOpenExternalLink={vi.fn()} onPreviewAttachment={vi.fn()} onSaveAttachment={vi.fn()} />);
    expect(html).toContain('&lt;script&gt;window.bad = true&lt;/script&gt; Hello');
    expect(html).not.toContain('<script>');
    expect(html).toContain('src="data:image/png;base64,dGVzdA=="');
    expect(html).toContain('Inline image: Signature');
  });

  it('renders body text and multiple inline images in their original sequence', () => {
    const html = renderToStaticMarkup(<EmailMessageContent message={{
      id: 'ordered', text: 'Before Between After',
      body: [
        { type: 'text', value: 'Before' },
        { type: 'image', imageId: 'one', filename: 'one.png', contentType: 'image/png', dataUrl: 'data:image/png;base64,b25l' },
        { type: 'text', value: 'Between' },
        { type: 'image', imageId: 'two', filename: 'two.png', contentType: 'image/png', dataUrl: 'data:image/png;base64,dHdv' },
        { type: 'text', value: 'After' },
      ],
      inlineImages: [], attachments: [],
    }} onOpenExternalLink={vi.fn()} onPreviewAttachment={vi.fn()} onSaveAttachment={vi.fn()} />);
    expect(html.indexOf('Before')).toBeLessThan(html.indexOf('src="data:image/png;base64,b25l"'));
    expect(html.indexOf('src="data:image/png;base64,b25l"')).toBeLessThan(html.indexOf('Between'));
    expect(html.indexOf('Between')).toBeLessThan(html.indexOf('src="data:image/png;base64,dHdv"'));
    expect(html.indexOf('src="data:image/png;base64,dHdv"')).toBeLessThan(html.indexOf('After'));
    expect(html).not.toContain('email-inline-images');
  });

  it('renders downloadable metadata and disables missing content', () => {
    const html = renderToStaticMarkup(<EmailMessageContent message={{
      id: '9', text: '', inlineImages: [], attachments: [
        { id: 'attachment-2', filename: 'proposal.pdf', contentType: 'application/pdf', size: 1536, available: true },
        { id: 'attachment-3', filename: 'missing.bin', contentType: 'application/octet-stream', size: 0, available: false },
      ],
    }} onOpenExternalLink={vi.fn()} onPreviewAttachment={vi.fn()} onSaveAttachment={vi.fn()} />);
    expect(html).toContain('proposal.pdf');
    expect(html).toContain('1.5 KB');
    expect(html).toContain('Preview');
    expect(html).toContain('Save attachment');
    expect(html).toContain('Attachment unavailable');
    expect(html).toContain('disabled=""');
  });

  it('only offers preview for safe browser-renderable attachment types', () => {
    const html = renderToStaticMarkup(<EmailMessageContent message={{
      id: '10', text: '', attachments: [
        { id: 'image', filename: 'site.jpg', contentType: 'image/jpeg', size: 10, available: true },
        { id: 'pdf', filename: 'quote.pdf', contentType: 'application/pdf', size: 10, available: true },
        { id: 'html', filename: 'unsafe.html', contentType: 'text/html', size: 10, available: true },
      ],
    }} onOpenExternalLink={vi.fn()} onPreviewAttachment={vi.fn()} onSaveAttachment={vi.fn()} />);
    expect((html.match(/>Preview<\/button>/g) || [])).toHaveLength(2);
    expect(html).toContain('Preview unavailable');
  });
});
