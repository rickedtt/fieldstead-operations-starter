import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { app, safeStorage } from 'electron';
import { normalizeMailProvider, getMailProviderProfile } from '../lib/mail-provider-runtime.mjs';

const CONFIG_FILE = 'email-connection.json';

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function requireEncryption() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure operating-system credential storage is unavailable on this device.');
  }
}

function encryptSecret(value) {
  requireEncryption();
  return safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(value) {
  requireEncryption();
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    provider: account.provider,
    email: account.email,
    displayName: account.displayName,
    imap: account.imap,
    smtp: account.smtp,
    lastTestedAt: account.lastTestedAt ?? null,
    configured: true,
  };
}

async function readStore() {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    if (Array.isArray(raw.accounts)) return raw;
    // Migrate the original single-account format without exposing its secret.
    if (raw.encryptedPassword) { const id = raw.id || randomUUID(); return { activeAccountId: id, accounts: [{ ...raw, id }] }; }
    return { activeAccountId: null, accounts: [] };
  } catch (error) {
    if (error?.code === 'ENOENT') return { activeAccountId: null, accounts: [] };
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(store), { mode: 0o600 });
}

async function getAccount(accountId) {
  const store = await readStore();
  const id = accountId || store.activeAccountId;
  const account = store.accounts.find((candidate) => candidate.id === id) || store.accounts[0];
  if (!account) throw new Error('Email is not configured on this device.');
  return { store, account };
}

function describeMailError(error) {
  if (!error) return 'Unknown mail-server error.';
  const parts = [
    error.message,
    error.code,
    error.responseStatus,
    error.responseText,
    error.authenticationFailed ? 'authentication failed' : '',
  ].filter(Boolean).map(String);
  return [...new Set(parts)].join(' — ') || String(error);
}

function normalizeInput(input) {
  const clean = (value) => String(value ?? '').trim();
  const port = (value, fallback) => Number.parseInt(String(value ?? fallback), 10);
  const result = {
    provider: normalizeMailProvider(input.provider, input.email),
    email: clean(input.email),
    displayName: clean(input.displayName),
    imap: { host: clean(input.imap?.host), port: port(input.imap?.port, 993), secure: input.imap?.secure !== false },
    smtp: { host: clean(input.smtp?.host), port: port(input.smtp?.port, 465), secure: input.smtp?.secure !== false },
    username: clean(input.username),
    password: String(input.password ?? '').replace(/\s+/g, ''),
  };
  if (result.provider !== 'unknown') {
    const profile = getMailProviderProfile(result.provider);
    result.imap = { ...profile.imap };
    result.smtp = { ...profile.smtp };
  }
  if (!result.email || !result.username || !result.password || !result.imap.host || !result.smtp.host) {
    throw new Error('Email address, username, password, IMAP host, and SMTP host are required.');
  }
  if (!Number.isInteger(result.imap.port) || !Number.isInteger(result.smtp.port)) {
    throw new Error('IMAP and SMTP ports must be valid numbers.');
  }
  return result;
}

async function testImap(config) {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.username, pass: config.password },
    logger: false,
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`IMAP connection failed: ${describeMailError(error)}`);
  } finally {
    try { await client.close(); } catch {}
  }
}

async function testSmtp(config) {
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.username, pass: config.password },
    logger: false,
  });
  try {
    await transporter.verify();
  } catch (error) {
    throw new Error(`SMTP connection failed: ${describeMailError(error)}`);
  } finally {
    transporter.close();
  }
}

export async function getEmailAccounts() {
  const store = await readStore();
  return { accounts: store.accounts.map(publicAccount), activeAccountId: store.activeAccountId || store.accounts[0]?.id || null };
}

export async function getEmailConfig() {
  const result = await getEmailAccounts();
  return result.accounts.find((account) => account.id === result.activeAccountId) || null;
}

export async function testEmailConnection(input) {
  const config = normalizeInput(input);
  await testImap(config);
  await testSmtp(config);
  return { ok: true, message: 'IMAP and SMTP connections verified.' };
}

export async function saveEmailConfig(input) {
  const config = normalizeInput(input);
  await testImap(config);
  await testSmtp(config);
  const store = await readStore();
  const stored = {
    id: randomUUID(),
    provider: config.provider,
    email: config.email,
    displayName: config.displayName,
    imap: config.imap,
    smtp: config.smtp,
    username: config.username,
    encryptedPassword: encryptSecret(config.password),
    lastTestedAt: new Date().toISOString(),
  };
  store.accounts = [...store.accounts, stored];
  store.activeAccountId = stored.id;
  await writeStore(store);
  return publicAccount(stored);
}

export async function clearEmailConfig(accountId) {
  const store = await readStore();
  const id = accountId || store.activeAccountId;
  store.accounts = store.accounts.filter((account) => account.id !== id);
  store.activeAccountId = store.accounts[0]?.id || null;
  await writeStore(store);
  return { configured: store.accounts.length > 0, accounts: store.accounts.map(publicAccount), activeAccountId: store.activeAccountId };
}

export async function getStoredEmailSecrets(accountId) {
  const { account } = await getAccount(accountId);
  return { ...account, password: decryptSecret(account.encryptedPassword) };
}


export async function syncEmail(accountId) {
  const config = await getStoredEmailSecrets(accountId);
  if (!config) throw new Error('Email is not configured on this device.');
  const client = new ImapFlow({ host: config.imap.host, port: config.imap.port, secure: config.imap.secure, auth: { user: config.username, pass: config.password }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const messages = [];
      const start = Math.max(1, (client.mailbox.exists || 0) - 24);
      for await (const message of client.fetch(`${start}:*`, { uid: true, envelope: true, source: true })) {
        const parsed = await (await import('mailparser')).simpleParser(message.source);
        messages.push({
          id: String(message.uid),
          subject: message.envelope?.subject || '(no subject)',
          from: message.envelope?.from?.[0]?.address || '',
          fromName: message.envelope?.from?.[0]?.name || '',
          receivedAt: message.envelope?.date?.toISOString?.() || new Date().toISOString(),
          text: parsed.text?.slice(0, 20000) || '',
          unread: !message.flags?.has?.('\\Seen'),
          starred: message.flags?.has?.('\\Flagged') || false,
        });
      }
      return { ok: true, messages: messages.reverse(), syncedAt: new Date().toISOString() };
    } finally { lock.release(); }
  } catch (error) {
    throw new Error(`Inbox sync failed: ${describeMailError(error)}`);
  } finally { try { await client.close(); } catch {} }
}

export async function emailMessageAction(accountId, uid, action) {
  const config = await getStoredEmailSecrets(accountId);
  const client = new ImapFlow({ host: config.imap.host, port: config.imap.port, secure: config.imap.secure, auth: { user: config.username, pass: config.password }, logger: false });
  const lock = await client.getMailboxLock('INBOX');
  try {
    const range = String(uid);
    if (action === 'read') await client.messageFlagsAdd(range, ['\\Seen']);
    else if (action === 'unread') await client.messageFlagsRemove(range, ['\\Seen']);
    else if (action === 'star') await client.messageFlagsAdd(range, ['\\Flagged']);
    else if (action === 'unstar') await client.messageFlagsRemove(range, ['\\Flagged']);
    else if (action === 'delete') await client.messageDelete(range);
    else if (action === 'archive') {
      const mailboxes = await client.list();
      const archive = mailboxes.find((mailbox) => mailbox.specialUse === '\\All')?.path || mailboxes.find((mailbox) => /all mail|archive/i.test(mailbox.path))?.path;
      if (!archive) throw new Error('This provider does not expose an archive mailbox.');
      await client.messageMove(range, archive);
    } else throw new Error(`Unsupported email action: ${action}`);
    return { ok: true, action, uid: range };
  } catch (error) {
    throw new Error(`Email action failed: ${describeMailError(error)}`);
  } finally {
    lock.release();
    try { await client.close(); } catch {}
  }
}

export async function sendEmail(input, accountId) {
  const config = await getStoredEmailSecrets(accountId);
  if (!config) throw new Error('Email is not configured on this device.');
  const to = String(input?.to ?? '').trim();
  const subject = String(input?.subject ?? '').trim();
  const text = String(input?.text ?? '');
  if (!to || !subject || !text) throw new Error('Recipient, subject, and message are required.');
  const transporter = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, auth: { user: config.username, pass: config.password }, logger: false });
  try {
    const result = await transporter.sendMail({ from: { name: config.displayName || config.email, address: config.email }, to, subject, text });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    throw new Error(`Email send failed: ${describeMailError(error)}`);
  } finally { transporter.close(); }
}
