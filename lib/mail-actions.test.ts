import { describe, expect, it } from 'vitest';
import { emailActionLabel, replySubject } from './mail-actions';

describe('email message actions', () => {
  it('provides clear labels for message actions', () => {
    expect(emailActionLabel('reply')).toBe('Reply');
    expect(emailActionLabel('archive')).toBe('Archive');
    expect(emailActionLabel('delete')).toBe('Delete');
  });

  it('does not duplicate reply prefixes', () => {
    expect(replySubject('Project update')).toBe('Re: Project update');
    expect(replySubject('Re: Project update')).toBe('Re: Project update');
  });
});
