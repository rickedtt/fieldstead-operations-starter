import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('sidebar shell', () => {
  it('does not render the Fieldstead owner footer identity', () => {
    const shell = page.slice(page.indexOf('<aside className="sidebar">'), page.indexOf('</aside>'));

    expect(shell).not.toContain('Fieldstead owner');
    expect(shell).not.toContain('sidebar-foot');
  });
});