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

  it('opens durable service-request details after intake conversion and reuses the attachment UI', async () => {
    const [page, panel] = await Promise.all([
      readFile(new URL('app/page.tsx', root), 'utf8'),
      readFile(new URL('app/email-intake-review-panel.tsx', root), 'utf8'),
    ]);
    expect(panel).toContain('onOpenServiceRequest');
    expect(panel).toContain('Open service request');
    expect(page).toContain('function ServiceRequestDrawer');
    expect(page).toContain('<OperationalAttachments ownerType="serviceRequest" ownerId={serviceRequest.id}');
    expect(page).toContain('getDurableServiceRequest');
  });

  it('offers complete local attachment-store export and states the manual retention boundary', async () => {
    const page = await readFile(new URL('app/page.tsx', root), 'utf8');
    expect(page).toContain('Export complete attachment store');
    expect(page).toContain('exportOperationalAttachmentStore');
    expect(page).toContain('checksum-verified manifest');
    expect(page).toContain('manual retention');
    expect(page).toContain('No automatic purge');
  });
});
