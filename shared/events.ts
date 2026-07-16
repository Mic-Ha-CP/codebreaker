// Client → Server
export const C2S = {
  CREATE_ROOM: 'c:create_room',
  JOIN_ROOM: 'c:join_room',
  LEAVE_ROOM: 'c:leave_room',
  ADD_BOT: 'c:add_bot',
  KICK_PLAYER: 'c:kick_player',
  UPDATE_RULES: 'c:update_rules',
  TOGGLE_READY: 'c:toggle_ready',
  SUBMIT_SECRET: 'c:submit_secret',
  TYPING_UPDATE: 'c:typing_update',
  SUBMIT_GUESS: 'c:submit_guess',
  REQUEST_REMATCH: 'c:request_rematch',
  RECONNECT: 'c:reconnect',
  // Room discovery — see docs/lobby-broadcast-pattern.md
  LOBBY_SUBSCRIBE: 'c:lobby_subscribe',
  LOBBY_UNSUBSCRIBE: 'c:lobby_unsubscribe',
} as const;

// Server → Client
export const S2C = {
  ROOM_STATE: 's:room_state',
  ERROR: 's:error',
  OPPONENT_TYPING: 's:opponent_typing',
  REVEAL_GUESS: 's:reveal_guess',
  GAME_END: 's:game_end',
  KICK: 's:kick',
  /**
   * The room went away underneath you. Deliberately NOT a kick — nobody removed
   * you, the room stopped existing. See the idle sweep in RoomManager.
   */
  ROOM_CLOSED: 's:room_closed',
  LOBBY_LIST: 's:lobby_list',
} as const;
