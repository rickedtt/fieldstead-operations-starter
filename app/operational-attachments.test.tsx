import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

describe('operational attachment UI integration', () => {
  it('renders explicit attachment actions in the job drawer and a backup warning', async () => {
    const page = await readFile(new URL('app/page.tsx', root), 'utf8');
    expect(page).toContain('function OperationalAttachments');
    expect(page).toContain('Add attachment');
    expect(page).toContain('Preview');
    expect(page).toContain('Export');
    expect(page).toContain('Delete');
    expect(page).toContain('getOperationalAttachmentBackupManifest');
    expect(page).toContain('Managed attachment content is not included');
    expect(page).toContain('<OperationalAttachments ownerType="job" ownerId={job.id}');
  });
});
