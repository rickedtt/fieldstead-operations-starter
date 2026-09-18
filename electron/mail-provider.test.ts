import { describe, expect, it } from 'vitest';
import { detectMailProvider, getMailProviderProfile } from '../lib/mail-provider';

describe('mail provider onboarding', () => {
  it('detects Google Workspace and Gmail addresses', () => {
    expect(detectMailProvider('thomas@fieldsteadsystems.com')).toBe('unknown');
    expect(detectMailProvider('person@gmail.com')).toBe('google');
  });

  it('detects Microsoft-hosted addresses', () => {
    expect(detectMailProvider('person@outlook.com')).toBe('microsoft');
    expect(detectMailProvider('person@company.onmicrosoft.com')).toBe('microsoft');
  });

  it('returns provider guidance without exposing credentials', () => {
    const profile = getMailProviderProfile('google');
    expect(profile.authMode).toBe('oauth-or-app-password');
    expect(profile.imap.host).toBe('imap.gmail.com');
    expect(profile.smtp.host).toBe('smtp.gmail.com');
    expect(profile).not.toHaveProperty('password');
    expect(profile).not.toHaveProperty('token');
    expect(profile).not.toHaveProperty('secret');
  });

  it('uses manual setup for unknown providers', () => {
    expect(getMailProviderProfile('unknown').authMode).toBe('manual');
    expect(detectMailProvider('owner@localbusiness.example')).toBe('unknown');
  });
});
