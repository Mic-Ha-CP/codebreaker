import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { C2S, S2C } from '../../shared/events.js';
import { RoomManager } from './rooms/RoomManager.js';
import { Room } from './rooms/Room.js';
import { BotDriver, type BotHooks } from './game/bot/BotDriver.js';
import { isBotDifficulty } from './game/bot/solver.js';
import type { GuessResult, PlayerId } from '../../shared/types.js';

let roomManager: RoomManager;

const DISCONNECT_FORFEIT_MS = 30_000;

export function initSocket(server: HTTPServer, clientOrigin: string) {
  roomManager = new RoomManager();
  const botDriver = new BotDriver();
  // Covers every exit a room has, including RoomManager's idle sweep — without
  // this the driver would leak solver state for swept solo rooms.
  roomManager.onRoomRemoved((code) => botDriver.detach(code));

  const io = new Server(server, {
    cors: { origin: clientOrigin, credentials: true },
  });

  const botHooks: BotHooks = {
    onStateChange: (room) => broadcastRoomState(io, room),
    onGuess: (room, result, gameEnded) => emitGuessOutcome(io, room, result, gameEnded),
  };

  /**
   * The single choke point after any room mutation: push the new state to the
   * humans, then let the bot notice whether it now owes a move. A no-op for
   * ordinary 2-human rooms.
   */
  function afterRoomMutation(room: Room): void {
    broadcastRoomState(io, room);
    botDriver.tick(room, botHooks);
  }

  // Track current socket per playerId so we can: (a) route emits via
  // io.to(playerId) (each socket joins its own playerId room on
  // create/join/reconnect) and (b) detect a stale-but-still-connected
  // socket on reconnect and kick it.
  const socketIdToPlayerId = new Map<string, PlayerId>();
  const playerIdToSocketId = new Map<PlayerId, string>();

  function bindPlayer(socket: Socket, playerId: PlayerId): void {
    socketIdToPlayerId.set(socket.id, playerId);
    playerIdToSocketId.set(playerId, socket.id);
    socket.join(playerId);
  }

  function unbindSocket(socketId: string): PlayerId | undefined {
    const playerId = socketIdToPlayerId.get(socketId);
    socketIdToPlayerId.delete(socketId);
    if (playerId && playerIdToSocketId.get(playerId) === socketId) {
      playerIdToSocketId.delete(playerId);
    }
    return playerId;
  }

  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── Create room ──────────────────────────────────────────────────────
    socket.on(C2S.CREATE_ROOM, (payload: { playerId: string; nickname: string; rules?: Partial<import('../../shared/types.js').Rules> }) => {
      const { playerId, nickname, rules } = payload;
      if (!playerId || !nickname || nickname.trim().length === 0) {
        socket.emit(S2C.ERROR, { code: 'invalid_input', message: 'Nickname is required' });
        return;
      }

      const result = roomManager.createRoom(playerId, nickname.trim());
      if ('error' in result) {
        socket.emit(S2C.ERROR, { code: result.error, message: getErrorMessage(result.error) });
        return;
      }

      const room = result;
      socket.join(room.state.code);
      bindPlayer(socket, playerId);

      if (rules) {
        room.updateRules(playerId, rules);
      }

      const clientState = room.toClientState(playerId);
      socket.emit(S2C.ROOM_STATE, clientState);
      console.log(`[room] ${room.state.code} created by ${nickname} (${playerId})`);
    });

    // ── Create solo room (vs computer) ───────────────────────────────────
    socket.on(C2S.CREATE_SOLO, (payload: { playerId: string; nickname: string; difficulty: string }) => {
      const { playerId, nickname, difficulty } = payload ?? {};
      if (!playerId || !nickname || nickname.trim().length === 0) {
        socket.emit(S2C.ERROR, { code: 'invalid_input', message: 'Nickname is required' });
        return;
      }
      if (!isBotDifficulty(difficulty)) {
        socket.emit(S2C.ERROR, { code: 'invalid_input', message: getErrorMessage('invalid_input') });
        return;
      }

      const result = roomManager.createRoom(playerId, nickname.trim());
      if ('error' in result) {
        socket.emit(S2C.ERROR, { code: result.error, message: getErrorMessage(result.error) });
        return;
      }

      const room = result;
      const attached = botDriver.attach(room, difficulty);
      if ('error' in attached) {
        roomManager.removeRoom(room.state.code);
        socket.emit(S2C.ERROR, { code: attached.error, message: getErrorMessage(attached.error) });
        return;
      }

      socket.join(room.state.code);
      bindPlayer(socket, playerId);

      socket.emit(S2C.ROOM_STATE, room.toClientState(playerId));
      botDriver.tick(room, botHooks); // the bot readies itself up
      console.log(`[room] ${room.state.code} solo (${difficulty}) created by ${nickname}`);
    });

    // ── Join room ────────────────────────────────────────────────────────
    socket.on(C2S.JOIN_ROOM, (payload: { playerId: string; nickname: string; code: string }) => {
      const { playerId, nickname, code } = payload;
      if (!playerId || !nickname || nickname.trim().length === 0) {
        socket.emit(S2C.ERROR, { code: 'invalid_input', message: 'Nickname is required' });
        return;
      }

      const roomCode = code.toUpperCase().trim();
      const room = roomManager.getRoom(roomCode);
      if (!room) {
        socket.emit(S2C.ERROR, { code: 'room_not_found', message: 'Room not found' });
        return;
      }

      if (botDriver.isSolo(roomCode)) {
        socket.emit(S2C.ERROR, { code: 'solo_room', message: getErrorMessage('solo_room') });
        return;
      }

      if (room.state.phase !== 'lobby') {
        socket.emit(S2C.ERROR, { code: 'game_in_progress', message: 'Game already in progress' });
        return;
      }

      const result = room.addPlayer(playerId, nickname.trim());
      if ('error' in result) {
        socket.emit(S2C.ERROR, { code: result.error, message: getErrorMessage(result.error) });
        return;
      }

      socket.join(room.state.code);
      bindPlayer(socket, playerId);

      afterRoomMutation(room);
      console.log(`[room] ${playerId} (${nickname}) joined ${room.state.code}`);
    });

    // ── Reconnect ────────────────────────────────────────────────────────
    socket.on(C2S.RECONNECT, (payload: { playerId: string; roomCode: string }) => {
      const { playerId, roomCode } = payload ?? {};
      if (!playerId || !roomCode) {
        socket.emit(S2C.ERROR, { code: 'reconnect_failed', message: 'Reconnect payload invalid' });
        return;
      }

      const room = roomManager.getRoom(roomCode.toUpperCase().trim());
      if (!room || !room.getPlayer(playerId)) {
        socket.emit(S2C.ERROR, { code: 'reconnect_failed', message: 'Session expired' });
        return;
      }

      // Kick any stale-but-connected socket holding the slot (two-tab guard).
      const existingSocketId = playerIdToSocketId.get(playerId);
      if (existingSocketId && existingSocketId !== socket.id) {
        const existing = io.sockets.sockets.get(existingSocketId);
        if (existing?.connected) {
          existing.emit(S2C.KICK, { reason: 'Reconnected from another window' });
          existing.disconnect(true);
        }
        unbindSocket(existingSocketId);
      }

      socket.join(room.state.code);
      bindPlayer(socket, playerId);
      room.markReconnected(playerId);

      socket.emit(S2C.ROOM_STATE, room.toClientState(playerId));
      afterRoomMutation(room);
      console.log(`[room] ${playerId} reconnected to ${room.state.code}`);
    });

    // ── Leave room ───────────────────────────────────────────────────────
    socket.on(C2S.LEAVE_ROOM, () => {
      const playerId = socketIdToPlayerId.get(socket.id);
      const room = playerId ? roomManager.getRoomByPlayer(playerId) : null;
      if (!playerId || !room) {
        socket.emit(S2C.ERROR, { code: 'not_in_room', message: 'You are not in a room' });
        return;
      }

      socket.leave(room.state.code);
      socket.leave(playerId);
      unbindSocket(socket.id);
      room.removePlayer(playerId);

      if (botDriver.isSolo(room.state.code)) {
        // A bot must never be left holding a room on its own.
        roomManager.removeRoom(room.state.code);
      } else if (room.state.players.length === 0) {
        roomManager.removeRoom(room.state.code);
      } else {
        afterRoomMutation(room);
      }
    });

    // ── Toggle ready ─────────────────────────────────────────────────────
    socket.on(C2S.TOGGLE_READY, () => {
      const playerId = socketIdToPlayerId.get(socket.id);
      const room = playerId ? roomManager.getRoomByPlayer(playerId) : null;
      if (!playerId || !room) {
        socket.emit(S2C.ERROR, { code: 'not_in_room', message: 'You are not in a room' });
        return;
      }

      const result = room.toggleReady(playerId);
      if ('error' in result) {
        socket.emit(S2C.ERROR, { code: result.error, message: getErrorMessage(result.error) });
        return;
      }

      afterRoomMutation(room);
    });

    // ── Update rules ─────────────────────────────────────────────────────
    socket.on(C2S.UPDATE_RULES, (payload: { rules: Partial<import('../../shared/types.js').Rules> }) => {
      const playerId = socketIdToPlayerId.get(socket.id);
      const room = playerId ? roomManager.getRoomByPlayer(playerId) : null;
      if (!playerId || !room) {
        socket.emit(S2C.ERROR, { code: 'not_in_room', message: 'You are not in a room' });
        return;
      }

      const result = room.updateRules(playerId, payload.rules);
      if ('error' in result) {
        socket.emit(S2C.ERROR, { code: result.error, message: getErrorMessage(result.error) });
        return;
      }

      afterRoomMutation(room);
    });

    // ── Submit secret ────────────────────────────────────────────────────
    socket.on(C2S.SUBMIT_SECRET, (payload: { secret: number[] }) => {
      const playerId = socketIdToPlayerId.get(socket.id);
      const room = playerId ? roomManager.getRoomByPlayer(playerId) : null;
      if (!playerId || !room) {
        socket.emit(S2C.ERROR, { code: 'not_in_room', message: 'You are not in a room' });
        return;
      }

      const result = room.submitSecret(playerId, payload.secret);
      if ('error' in result) {
        socket.emit(S2C.ERROR, { code: result.error, message: getErrorMessage(result.error) });
        return;
      }

      afterRoomMutation(room);
    });

    // ── Typing update ───────────────────────────────────────────────────
    socket.on(C2S.TYPING_UPDATE, (payload: { buffer: (number | null)[] }) => {
      const playerId = socketIdToPlayerId.get(socket.id);
      const room = playerId ? roomManager.getRoomByPlayer(playerId) : null;
      if (!playerId || !room) return;

      const opponentId = room.getOpponentId(playerId);
      if (opponentId) {
        io.to(opponentId).emit(S2C.OPPONENT_TYPING, { buffer: payload.buffer });
      }
    });

    // ── Submit guess ─────────────────────────────────────────────────────
    socket.on(C2S.SUBMIT_GUESS, (payload: { guess: number[] }) => {
      const playerId = socketIdToPlayerId.get(socket.id);
      const room = playerId ? roomManager.getRoomByPlayer(playerId) : null;
      if (!playerId || !room) {
        socket.emit(S2C.ERROR, { code: 'not_in_room', message: 'You are not in a room' });
        return;
      }

      const result = room.submitGuess(playerId, payload.guess);
      if ('error' in result) {
        socket.emit(S2C.ERROR, { code: result.error, message: getErrorMessage(result.error) });
        return;
      }

      emitGuessOutcome(io, room, result.result, result.gameEnded);
      botDriver.tick(room, botHooks); // it may now be the bot's turn
    });

    // ── Request rematch ──────────────────────────────────────────────────
    socket.on(C2S.REQUEST_REMATCH, () => {
      const playerId = socketIdToPlayerId.get(socket.id);
      const room = playerId ? roomManager.getRoomByPlayer(playerId) : null;
      if (!playerId || !room) {
        socket.emit(S2C.ERROR, { code: 'not_in_room', message: 'You are not in a room' });
        return;
      }

      if (room.state.phase !== 'ended') {
        socket.emit(S2C.ERROR, { code: 'wrong_phase', message: 'Game is not over' });
        return;
      }

      room.rematch();
      afterRoomMutation(room); // the bot re-readies for the new game
    });

    // ── Disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', (reason: string) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);

      const playerId = socketIdToPlayerId.get(socket.id);
      if (!playerId) return;

      // Only release the mapping if this socket is the current owner —
      // a fresh c:reconnect on a new socket may have already overwritten
      // the entry, in which case we don't want to wipe the new socket's
      // binding.
      if (playerIdToSocketId.get(playerId) === socket.id) {
        playerIdToSocketId.delete(playerId);
      }
      socketIdToPlayerId.delete(socket.id);

      const room = roomManager.getRoomByPlayer(playerId);
      if (!room) return;

      const player = room.getPlayer(playerId);
      if (!player) return;

      if (room.state.phase === 'lobby') {
        room.removePlayer(playerId);
        if (botDriver.isSolo(room.state.code) || room.state.players.length === 0) {
          roomManager.removeRoom(room.state.code);
        } else {
          afterRoomMutation(room);
        }
        return;
      }

      // In-game disconnect: mark + start a cancellable 30s forfeit timer. Solo
      // rooms included — the human may still reconnect inside the window.
      room.markDisconnected(playerId);
      afterRoomMutation(room);

      const timer = setTimeout(() => {
        const stillDisconnected = room.getPlayer(playerId)?.connected === false;
        if (stillDisconnected && room.state.phase !== 'ended') {
          const opponentId = room.getOpponentId(playerId);
          if (opponentId) {
            const endPayload = room.endGame(opponentId, 'disconnect');
            io.to(room.state.code).emit(S2C.GAME_END, endPayload);
            io.to(room.state.code).emit(S2C.ROOM_STATE, room.toClientState(opponentId));
          }
        }
        room.clearDisconnectTimer(playerId);
      }, DISCONNECT_FORFEIT_MS);

      room.setDisconnectTimer(playerId, timer);
    });
  });

  return io;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function broadcastRoomState(io: Server, room: Room): void {
  for (const player of room.state.players) {
    const clientState = room.toClientState(player.id);
    io.to(player.id).emit(S2C.ROOM_STATE, clientState);
  }
}

/**
 * Emits the fallout of one guess. Shared by the human handler and the bot
 * driver so a bot turn is indistinguishable from a human turn on the wire.
 */
function emitGuessOutcome(io: Server, room: Room, result: GuessResult, gameEnded: boolean): void {
  io.to(room.state.code).emit(S2C.REVEAL_GUESS, { result });

  if (gameEnded) {
    const revealedSecrets: Record<string, number[]> = {};
    for (const player of room.state.players) {
      const pState = room.state.playerStates[player.id];
      if (pState?.secret) revealedSecrets[player.id] = pState.secret;
    }
    io.to(room.state.code).emit(S2C.GAME_END, {
      winnerId: room.state.winnerId,
      isDraw: room.state.isDraw,
      reason: 'guessed' as const,
      revealedSecrets,
    });
  }

  broadcastRoomState(io, room);
}

function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    room_full: 'Room is full (max 2 players)',
    server_full: 'Server is full (max 5 rooms). Try again later.',
    already_in_room: 'You are already in this room',
    room_not_found: 'Room not found. Check the code and try again.',
    wrong_phase: 'This action is not allowed in the current game phase',
    forbidden: 'Only the host can change rules',
    player_not_found: 'Player not found',
    already_submitted: 'You already submitted your secret',
    not_your_turn: 'It\'s not your turn',
    no_opponent: 'No opponent found',
    opponent_secret_not_set: 'Opponent has not set their secret yet',
    invalid_input: 'Invalid input',
    invalid_format: 'Invalid format',
    wrong_length: 'Wrong length',
    invalid_digit: 'Invalid digit (must be 0-9)',
    repeats_not_allowed: 'Repeats are not allowed',
    invalid_length: 'Code length must be between 3 and 6',
    invalid_rounds: 'Total rounds must be between 5 and 50',
    not_in_room: 'You are not in a room',
    game_in_progress: 'Game already in progress',
    reconnect_failed: 'Could not reconnect to your previous game',
    solo_room: 'That room is a solo game against the computer',
  };
  return messages[code] || 'An error occurred';
}
