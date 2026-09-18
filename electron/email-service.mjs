import fs from 'node:fs/promises';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { app, safeStorage } from 'electron';

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

function publicConfig(config) {
  if (!config) return null;
  return {
    provider: config.provider,
    email: config.email,
    displayName: config.displayName,
    imap: config.imap,
    smtp: config.smtp,
    lastTestedAt: config.lastTestedAt ?? null,
    configured: true,
  };
}

async function readConfig() {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(config), { mode: 0o600 });
}

function normalizeInput(input) {
  const clean = (value) => String(value ?? '').trim();
  const port = (value, fallback) => Number.parseInt(String(value ?? fallback), 10);
  const result = {
    provider: clean(input.provider) || 'Custom IMAP/SMTP',
    email: clean(input.email),
    displayName: clean(input.displayName),
    imap: { host: clean(input.imap?.host), port: port(input.imap?.port, 993), secure: input.imap?.secure !== false },
    smtp: { host: clean(input.smtp?.host), port: port(input.smtp?.port, 465), secure: input.smtp?.secure !== false },
    username: clean(input.username),
    password: String(input.password ?? ''),
  };
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
    throw new Error(`IMAP connection failed: ${error instanceof Error ? error.message : String(error)}`);
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
    throw new Error(`SMTP connection failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    transporter.close();
  }
}

export async function getEmailConfig() {
  return publicConfig(await readConfig());
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
  const stored = {
    provider: config.provider,
    email: config.email,
    displayName: config.displayName,
    imap: config.imap,
    smtp: config.smtp,
    username: config.username,
    encryptedPassword: encryptSecret(config.password),
    lastTestedAt: new Date().toISOString(),
  };
  await writeConfig(stored);
  return publicConfig(stored);
}

export async function clearEmailConfig() {
  try { await fs.unlink(configPath()); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return { configured: false };
}

export async function getStoredEmailSecrets() {
  const config = await readConfig();
  if (!config) return null;
  return { ...config, password: decryptSecret(config.encryptedPassword) };
}


export async function syncEmail() {
  const config = await getStoredEmailSecrets();
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
        });
      }
      return { ok: true, messages: messages.reverse(), syncedAt: new Date().toISOString() };
    } finally { lock.release(); }
  } catch (error) {
    throw new Error(`Inbox sync failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally { try { await client.close(); } catch {} }
}

export async function sendEmail(input) {
  const config = await getStoredEmailSecrets();
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
    throw new Error(`Email send failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally { transporter.close(); }
}
