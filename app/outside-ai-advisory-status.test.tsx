import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OutsideAiAdvisoryStatus, buildOutsideAiStatus } from './outside-ai-advisory-status';

describe('outside-AI advisory status surface', () => {
  it('reports the disabled fixture-only no-write boundary', () => {
    expect(buildOutsideAiStatus()).toMatchObject({
      enabled: false,
      mode: 'fixture-only',
      providerNeutral: true,
      networkCalls: false,
      credentials: false,
      recordWrites: false,
      ownerConfirmationRequired: true,
    });
  });

  it('renders an accessible minimal status with redaction and limits', () => {
    const html = renderToStaticMarkup(<OutsideAiAdvisoryStatus />);
    expect(html).toContain('Outside-AI advisory');
    expect(html).toContain('Disabled');
    expect(html).toContain('Fixture-only');
    expect(html).toContain('Redaction preview');
    expect(html).toContain('[REDACTED_EMAIL]');
    expect(html).toContain('Owner confirmation required');
    expect(html).toContain('No network, credentials, or record writes');
    expect(html).toContain('aria-label="Outside-AI advisory status"');
    expect(html).not.toMatch(/<button|<input|<select|<form|href=/);
  });

  it('does not access fetch, storage, or persistence', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storageGet = vi.spyOn(Storage.prototype, 'getItem');
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    buildOutsideAiStatus();
    renderToStaticMarkup(<OutsideAiAdvisoryStatus />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });
});
