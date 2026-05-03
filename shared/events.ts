// Client → Server
export const C2S = {
  CREATE_ROOM: 'c:create_room',
  JOIN_ROOM: 'c:join_room',
  LEAVE_ROOM: 'c:leave_room',
  UPDATE_RULES: 'c:update_rules',
  TOGGLE_READY: 'c:toggle_ready',
  SUBMIT_SECRET: 'c:submit_secret',
  TYPING_UPDATE: 'c:typing_update',
  SUBMIT_GUESS: 'c:submit_guess',
  REQUEST_REMATCH: 'c:request_rematch',
} as const;

// Server → Client
export const S2C = {
  ROOM_STATE: 's:room_state',
  ERROR: 's:error',
  OPPONENT_TYPING: 's:opponent_typing',
  REVEAL_GUESS: 's:reveal_guess',
  GAME_END: 's:game_end',
  KICK: 's:kick',
} as const;
