import { describe, expect, it } from 'vitest';
import { createInitialEmailUiState, reduceEmailUiState } from './email-ui-state';

describe('email compose UI state', () => {
  it('starts with the compose form closed', () => {
    expect(createInitialEmailUiState()).toEqual({ composeOpen: false, expandedMessageId: null, selectedMessageIds: [] });
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

  it('selects individual messages and selects all visible messages', () => {
    const selected = reduceEmailUiState(createInitialEmailUiState(), { type: 'toggle-selection', messageId: '42' });
    expect(selected.selectedMessageIds).toEqual(['42']);
    expect(reduceEmailUiState(selected, { type: 'toggle-selection', messageId: '42' }).selectedMessageIds).toEqual([]);
    expect(reduceEmailUiState(selected, { type: 'select-visible', messageIds: ['42', '43'] }).selectedMessageIds).toEqual(['42', '43']);
  });

  it('clears selection and removes deleted messages from selection', () => {
    const selected = reduceEmailUiState(createInitialEmailUiState(), { type: 'select-visible', messageIds: ['42', '43'] });
    expect(reduceEmailUiState(selected, { type: 'remove-message', messageId: '42' }).selectedMessageIds).toEqual(['43']);
    expect(reduceEmailUiState(selected, { type: 'clear-selection' }).selectedMessageIds).toEqual([]);
  });
});
