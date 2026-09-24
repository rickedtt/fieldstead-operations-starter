const UID_OPTIONS = Object.freeze({ uid: true });

function requireMessageResult(result) {
  if (result === false) throw new Error('The message was not found in the mailbox.');
}

export async function performEmailMessageAction(client, uid, action) {
  const range = String(uid);
  let result;

  if (action === 'read') result = await client.messageFlagsAdd(range, ['\\Seen'], UID_OPTIONS);
  else if (action === 'unread') result = await client.messageFlagsRemove(range, ['\\Seen'], UID_OPTIONS);
  else if (action === 'star') result = await client.messageFlagsAdd(range, ['\\Flagged'], UID_OPTIONS);
  else if (action === 'unstar') result = await client.messageFlagsRemove(range, ['\\Flagged'], UID_OPTIONS);
  else if (action === 'delete') result = await client.messageDelete(range, UID_OPTIONS);
  else if (action === 'archive') {
    const mailboxes = await client.list();
    const archive = mailboxes.find((mailbox) => mailbox.specialUse === '\\All')?.path
      || mailboxes.find((mailbox) => /all mail|archive/i.test(mailbox.path))?.path;
    if (!archive) throw new Error('This provider does not expose an archive mailbox.');
    result = await client.messageMove(range, archive, UID_OPTIONS);
  } else throw new Error(`Unsupported email action: ${action}`);

  requireMessageResult(result);
  return { ok: true, action, uid: range };
}


export async function performEmailMessageActions(client, uids, action) {
  const normalized = [...new Set((uids || []).map(String).filter(Boolean))];
  if (!normalized.length) throw new Error('Select at least one message.');
  const range = normalized.join(',');
  const result = await performEmailMessageAction(client, range, action);
  return { ok: result.ok, action, uids: normalized };
}
