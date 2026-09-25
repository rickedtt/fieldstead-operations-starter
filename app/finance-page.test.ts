import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('Finance tab foundation', () => {
  it('adds Finance to navigation and renders a read-only finance view', () => {
    expect(page).toContain("'Finance'");
    expect(page).toContain("view === 'Finance' && <FinanceView state={state}");
    expect(page).toContain('function FinanceView');
    expect(page).toContain('QuickBooks not connected');
    expect(page).toContain('Read-only local summary');
    expect(page).toContain('<QuickBooksReadinessPanel />');
  });

  it('provides reusable finance layouts that remain fluid', () => {
    expect(css).toMatch(/\.finance-page\{[^}]*display:grid[^}]*min-width:0/);
    expect(css).toMatch(/\.finance-metrics\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
    expect(css).toMatch(/@media\(max-width:700px\)\{[^}]*\.finance-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  });
});
