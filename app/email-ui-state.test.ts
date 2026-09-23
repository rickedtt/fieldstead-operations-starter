import { describe, expect, it } from 'vitest';
import { createInitialEmailUiState, reduceEmailUiState } from './email-ui-state';

describe('email compose UI state', () => {
  it('starts with the compose form closed', () => {
    expect(createInitialEmailUiState()).toEqual({ composeOpen: false, expandedMessageId: null });
  });

  it('opens and cancels compose', () => {
    const opened = reduceEmailUiState(createInitialEmailUiState(), { type: 'open-compose' });
    expect(opened.composeOpen).toBe(true);
    expect(reduceEmailUiState(opened, { type: 'cancel-compose' }).composeOpen).toBe(false);
  });

  it('closes compose after a successful send', () => {
    const opened = reduceEmailUiState(createInitialEmailUiState(), { type: 'open-compose' });
    expect(reduceEmailUiState(opened, { type: 'send-succeeded' }).composeOpen).toBe(false);
  });

  it('toggles expanded email details', () => {
    const expanded = reduceEmailUiState(createInitialEmailUiState(), { type: 'toggle-message', messageId: '42' });
    expect(expanded.expandedMessageId).toBe('42');
    expect(reduceEmailUiState(expanded, { type: 'toggle-message', messageId: '42' }).expandedMessageId).toBeNull();
  });

  it('collapses a deleted or archived message', () => {
    const expanded = reduceEmailUiState(createInitialEmailUiState(), { type: 'toggle-message', messageId: '42' });
    expect(reduceEmailUiState(expanded, { type: 'remove-message', messageId: '42' }).expandedMessageId).toBeNull();
  });
});
