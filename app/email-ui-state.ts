export type EmailUiState = { composeOpen: boolean; expandedMessageId: string | null; selectedMessageIds: string[] };
export type EmailUiAction =
  | { type: 'open-compose' }
  | { type: 'cancel-compose' }
  | { type: 'send-succeeded' }
  | { type: 'toggle-message'; messageId: string }
  | { type: 'toggle-selection'; messageId: string }
  | { type: 'select-visible'; messageIds: string[] }
  | { type: 'clear-selection' }
  | { type: 'remove-message'; messageId: string };

export function createInitialEmailUiState(): EmailUiState {
  return { composeOpen: false, expandedMessageId: null, selectedMessageIds: [] };
}

export function reduceEmailUiState(state: EmailUiState, action: EmailUiAction): EmailUiState {
  if (action.type === 'open-compose') return { ...state, composeOpen: true };
  if (action.type === 'cancel-compose' || action.type === 'send-succeeded') return { ...state, composeOpen: false };
  if (action.type === 'clear-selection') return { ...state, selectedMessageIds: [] };
  if (action.type === 'toggle-selection') return { ...state, selectedMessageIds: state.selectedMessageIds.includes(action.messageId) ? state.selectedMessageIds.filter((id) => id !== action.messageId) : [...state.selectedMessageIds, action.messageId] };
  if (action.type === 'select-visible') return { ...state, selectedMessageIds: [...new Set(action.messageIds)] };
  if (action.type === 'remove-message') return { ...state, expandedMessageId: state.expandedMessageId === action.messageId ? null : state.expandedMessageId, selectedMessageIds: state.selectedMessageIds.filter((id) => id !== action.messageId) };
  return { ...state, expandedMessageId: state.expandedMessageId === action.messageId ? null : action.messageId };
}
