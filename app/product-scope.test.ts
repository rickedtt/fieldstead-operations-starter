import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const roadmap = readFileSync(new URL('../docs/fieldstead-product-roadmap.md', import.meta.url), 'utf8');

describe('Starter product scope', () => {
  it('de-emphasizes inventory in navigation while preserving the existing view key', () => {
    expect(page).toContain("Inventory: 'Catalog & Assets'");
    expect(page).toContain("view === 'Inventory'");
    expect(page).toContain('Optional full-package capability');
  });

  it('documents catalog, assets, and inventory as optional full-package operations', () => {
    expect(readme).toContain('Catalog & Assets');
    expect(readme).toContain('optional full-package capability');
    expect(roadmap).toContain('Stage 7 — Optional catalog, assets, inventory, and job costing');
    expect(roadmap).toContain('not a core Starter requirement');
  });
});
