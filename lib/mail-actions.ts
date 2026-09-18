export type EmailMessageAction = 'reply' | 'forward' | 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'delete';

const LABELS: Record<EmailMessageAction, string> = { reply: 'Reply', forward: 'Forward', read: 'Mark read', unread: 'Mark unread', star: 'Star', unstar: 'Unstar', archive: 'Archive', delete: 'Delete' };

export function emailActionLabel(action: EmailMessageAction) { return LABELS[action]; }

export function replySubject(subject: string) { return /^re:\s*/i.test(subject) ? subject : `Re: ${subject}`; }

export function forwardSubject(subject: string) { return /^fwd?:\s*/i.test(subject) ? subject : `Fwd: ${subject}`; }
