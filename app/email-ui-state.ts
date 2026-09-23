export type EmailUiState = { composeOpen: boolean; expandedMessageId: string | null };
export type EmailUiAction =
  | { type: 'open-compose' }
  | { type: 'cancel-compose' }
  | { type: 'send-succeeded' }
  | { type: 'toggle-message'; messageId: string }
  | { type: 'remove-message'; messageId: string };

export function createInitialEmailUiState(): EmailUiState {
  return { composeOpen: false, expandedMessageId: null };
}

export function reduceEmailUiState(state: EmailUiState, action: EmailUiAction): EmailUiState {
  if (action.type === 'open-compose') return { ...state, composeOpen: true };
  if (action.type === 'cancel-compose' || action.type === 'send-succeeded') return { ...state, composeOpen: false };
  if (action.type === 'remove-message') return state.expandedMessageId === action.messageId ? { ...state, expandedMessageId: null } : state;
  return { ...state, expandedMessageId: state.expandedMessageId === action.messageId ? null : action.messageId };
}
