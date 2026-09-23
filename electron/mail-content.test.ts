import { describe, expect, it } from 'vitest';
import { simpleParser } from 'mailparser';
import { parseMailContent, safeAttachmentFilename } from './mail-content.mjs';

describe('mail MIME content', () => {
  it('parses a multipart/related MIME message before resolving its CID image', async () => {
    const raw = [
      'From: sender@example.com',
      'To: office@example.com',
      'Subject: Related image',
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="fieldstead-boundary"',
      '',
      '--fieldstead-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Site photo</p><img src="cid:site-photo">',
      '--fieldstead-boundary',
      'Content-Type: image/png; name="site.png"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: inline; filename="site.png"',
      'Content-ID: <site-photo>',
      '',
      Buffer.from('png bytes').toString('base64'),
      '--fieldstead-boundary--',
      '',
    ].join('\r\n');
    const parsed = await simpleParser(raw);

    const result = parseMailContent(parsed);

    expect(result.text).toBe('Site photo');
    expect(result.inlineImages).toEqual([expect.objectContaining({ filename: 'site.png', contentId: 'site-photo' })]);
    expect(result.attachments).toEqual([]);
  });

  it('replaces a referenced CID placeholder with a safe inline image model', () => {
    const result = parseMailContent({
      text: 'Please see attached.\n\n[cid:image001.png@signature]\nJosh',
      html: '<p>Please see attached.</p><img src="cid:image001.png@signature"><script>steal()</script>',
      attachments: [{
        filename: 'logo.png',
        contentType: 'image/png',
        contentDisposition: 'inline',
        contentId: '<image001.png@signature>',
        content: Buffer.from('image bytes'),
        size: 11,
      }],
    });

    expect(result.text).toBe('Please see attached.\n\nJosh');
    expect(result.inlineImages).toEqual([expect.objectContaining({
      filename: 'logo.png',
      contentId: 'image001.png@signature',
      dataUrl: `data:image/png;base64,${Buffer.from('image bytes').toString('base64')}`,
    })]);
    expect(JSON.stringify(result)).not.toContain('<script>');
    expect(JSON.stringify(result)).not.toContain('steal()');
  });

  it('keeps regular attachment metadata without putting bytes in the render model', () => {
    const result = parseMailContent({
      text: 'Invoice attached',
      attachments: [{
        filename: '../../Q3 invoice.pdf',
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
        content: Buffer.from('pdf'),
        size: 3,
      }],
    });

    expect(result.attachments).toEqual([{
      id: 'attachment-1',
      filename: 'Q3 invoice.pdf',
      contentType: 'application/pdf',
      size: 3,
      available: true,
    }]);
    expect(result.attachments[0]).not.toHaveProperty('content');
    expect(result.attachments[0]).not.toHaveProperty('dataUrl');
  });

  it('handles HTML-only, malformed, and absent content without executing markup', () => {
    expect(parseMailContent(undefined)).toEqual({ text: '', inlineImages: [], attachments: [], files: [] });
    const result = parseMailContent({
      html: '<style>body{display:none}</style><h1>Hello &amp; welcome</h1><script>alert(1)</script><p>Details</p>',
      attachments: [{ filename: '', contentType: '', content: null }],
    });
    expect(result.text).toBe('Hello & welcome\nDetails');
    expect(result.text).not.toContain('alert');
    expect(result.attachments).toEqual([expect.objectContaining({ available: false })]);
  });

  it('normalizes unsafe and Windows-reserved filenames', () => {
    expect(safeAttachmentFilename('..\\..\\CON')).toBe('_CON');
    expect(safeAttachmentFilename(' report\u0000?.pdf ')).toBe('report_.pdf');
    expect(safeAttachmentFilename('', 2)).toBe('attachment-2');
  });
});
