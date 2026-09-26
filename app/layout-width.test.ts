import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('main workspace layout', () => {
  it('keeps the established desktop shell and content measure', () => {
    expect(css).toMatch(/\.app-shell\{[^}]*grid-template-columns:238px 1fr/);
    expect(css).toMatch(/\.app-shell\{grid-template-columns:238px minmax\(0,1fr\)\}/);
    expect(css).not.toMatch(/minmax\(640px,1fr\)/);
    expect(css).toMatch(
      /\.content\{[^}]*width:min\(1180px,calc\(100% - 48px\)\)[^}]*margin:0 auto/,
    );
    expect(css).not.toMatch(/\/\* Fluid application canvas:/);
  });

  it('keeps email layout safeguards scoped to the email page', () => {
    expect(css).toMatch(/\.email-page\{[^}]*width:100%[^}]*min-width:0/);
  });

  it('contains expanded email content and wraps attachment actions', () => {
    const regressionGuard = css.slice(css.indexOf('/* Expanded mail and desktop resize regression guard. */'));
    expect(regressionGuard).toMatch(/\.email-inbox-card[^}]*overflow:hidden/);
    expect(regressionGuard).toMatch(/\.email-message-card[^}]*min-width:0[^}]*max-width:100%/);
    expect(regressionGuard).toMatch(/\.email-message-content[^}]*min-width:0[^}]*max-width:100%/);
    expect(regressionGuard).toMatch(/\.email-message-body[^}]*font-size:13px[^}]*overflow-wrap:anywhere/);
    expect(regressionGuard).toMatch(/\.email-attachment-actions[^}]*display:flex[^}]*flex-wrap:wrap/);
  });

  it('keeps both top actions available while allowing compact wrapping', () => {
    expect(css).toMatch(/\.header-actions \.desktop-only\{display:inline-flex\}/);
    expect(css).toMatch(/@media\(max-width:1000px\)[\s\S]*?\.header-actions\{[^}]*max-width:none/);
  });

  it('prevents document-level horizontal overflow', () => {
    expect(css).toMatch(/html,body\{[^}]*max-width:100%[^}]*overflow-x:hidden/);
  });

  it('keeps Settings vertically reachable at the minimum 800x600 desktop size', () => {
    const persistentSidebar = css.slice(css.indexOf('/* Persistent side navigation:'));

    expect(persistentSidebar).toMatch(/\.sidebar\{[^}]*min-width:0[^}]*overflow:hidden/);
    expect(persistentSidebar).toMatch(/\.sidebar nav\{[^}]*min-height:0[^}]*overflow-y:auto[^}]*scrollbar-width:none/);
    expect(persistentSidebar).toMatch(/\.sidebar nav::-webkit-scrollbar\{display:none\}/);
    expect(persistentSidebar).toMatch(/\.sidebar-foot\{[^}]*flex:none/);
  });

  it('uses a compact sidebar rhythm at the supported 800x600 window size', () => {
    const compactSidebar = css.slice(css.indexOf('/* Compact supported-window sidebar:'));

    expect(compactSidebar).toMatch(/@media\(max-height:760px\) and \(min-width:801px\)/);
    expect(compactSidebar).toMatch(/\.sidebar\{[^}]*padding:12px 10px 10px/);
    expect(compactSidebar).toMatch(/\.nav-item\{[^}]*min-height:30px[^}]*padding:6px 8px[^}]*font-size:11px/);
    expect(compactSidebar).toMatch(/\.sidebar-foot\{[^}]*display:none/);
  });

  it('lets the narrow-window safeguard win over persistent desktop sidebar rules', () => {
    const persistentSidebar = css.indexOf('/* Persistent side navigation:');
    const narrowSafeguard = css.indexOf(
      '/* Narrow previews must not let later desktop-shell rules',
    );

    expect(persistentSidebar).toBeGreaterThan(-1);
    expect(narrowSafeguard).toBeGreaterThan(persistentSidebar);
    expect(css.slice(narrowSafeguard)).toMatch(
      /@media\(max-width:800px\)\{[^}]*\.app-shell,.app-shell\.sidebar-collapsed\{display:block;min-width:0\}\.sidebar\{display:none\}/,
    );
    expect(css.slice(narrowSafeguard)).toMatch(/\.mobile-nav\{display:grid!important\}/);
  });
});
