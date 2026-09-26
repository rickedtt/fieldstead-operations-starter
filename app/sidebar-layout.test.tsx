import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('sidebar layout', () => {
  it('does not render the owner footer that can overlap navigation', () => {
    const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    expect(page).not.toContain('<div className="sidebar-foot"><span className="avatar">FS</span><span>Fieldstead owner</span></div>');
    expect(page).not.toContain('Fieldstead owner</span>');
  });
});