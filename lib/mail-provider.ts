const DOMAIN_PROVIDERS = new Map([
  ['gmail.com', 'google'], ['googlemail.com', 'google'],
  ['outlook.com', 'microsoft'], ['hotmail.com', 'microsoft'], ['live.com', 'microsoft'],
  ['yahoo.com', 'yahoo'], ['icloud.com', 'icloud'], ['me.com', 'icloud'],
  ['zoho.com', 'zoho'],
]);

const PROFILES = {
  google: { id: 'google', name: 'Google Workspace / Gmail', authMode: 'oauth-or-app-password', imap: { host: 'imap.gmail.com', port: 993, secure: true }, smtp: { host: 'smtp.gmail.com', port: 465, secure: true } },
  microsoft: { id: 'microsoft', name: 'Microsoft 365 / Outlook', authMode: 'oauth-or-app-password', imap: { host: 'outlook.office365.com', port: 993, secure: true }, smtp: { host: 'smtp.office365.com', port: 587, secure: false } },
  yahoo: { id: 'yahoo', name: 'Yahoo Mail', authMode: 'app-password', imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true } },
  icloud: { id: 'icloud', name: 'iCloud Mail', authMode: 'app-password', imap: { host: 'imap.mail.me.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.me.com', port: 587, secure: false } },
  zoho: { id: 'zoho', name: 'Zoho Mail', authMode: 'app-password', imap: { host: 'imap.zoho.com', port: 993, secure: true }, smtp: { host: 'smtp.zoho.com', port: 465, secure: true } },
  unknown: { id: 'unknown', name: 'Other provider', authMode: 'manual', imap: { host: '', port: 993, secure: true }, smtp: { host: '', port: 465, secure: true } },
};

export function detectMailProvider(email) {
  const domain = String(email || '').trim().toLowerCase().split('@').pop() || '';
  if (domain.endsWith('.onmicrosoft.com')) return 'microsoft';
  return DOMAIN_PROVIDERS.get(domain) || 'unknown';
}

export function getMailProviderProfile(provider) {
  const profile = PROFILES[provider] || PROFILES.unknown;
  return structuredClone(profile);
}
