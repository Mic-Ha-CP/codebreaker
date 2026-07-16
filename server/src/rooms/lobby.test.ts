import { describe, it, expect } from 'vitest';
import { Room } from './Room.js';
import { RoomManager } from './RoomManager.js';
import { buildLobbyList } from './lobby.js';

function publicRoom(code: string, host = 'alice'): Room {
  const room = new Room(code);
  room.addPlayer('A', host);
  room.setDisplayNumber(1);
  return room;
}

describe('buildLobbyList', () => {
  it('projects a room down to what a list row needs', () => {
    const room = publicRoom('AAAA');
    expect(buildLobbyList([room])).toEqual([
      {
        code: 'AAAA',
        displayNumber: 1,
        hostNickname: 'alice',
        playerCount: 1,
        maxPlayers: 2,
        rules: { codeLength: 4, allowRepeats: false, totalRounds: 10 },
        status: 'waiting',
      },
    ]);
  });

  it('never lists a private room — being unlisted IS the feature', () => {
    const open = publicRoom('AAAA');
    const secret = new Room('BBBB');
    secret.addPlayer('B', 'bob');
    secret.setPrivate(true);

    const list = buildLobbyList([open, secret]);
    expect(list.map((r) => r.code)).toEqual(['AAAA']);
    expect(JSON.stringify(list)).not.toContain('BBBB');
    expect(JSON.stringify(list)).not.toContain('bob');
  });

  it('carries no secrets, no player states and no player ids', () => {
    const room = publicRoom('AAAA');
    room.addPlayer('B', 'bob');
    room.toggleReady('A');
    room.toggleReady('B'); // -> setting_secret
    room.submitSecret('A', [1, 2, 3, 4]);
    room.submitSecret('B', [5, 6, 7, 8]); // -> in_progress
    room.submitGuess(room.state.currentTurnPlayerId!, [9, 9, 9, 9]);

    const json = JSON.stringify(buildLobbyList([room]));
    expect(json).not.toContain('1234');
    expect(json).not.toContain('5678');
    expect(json).not.toContain('playerStates');
    expect(json).not.toContain('secret');
    expect(json).not.toContain('history');
    // The projection is a whitelist, so this holds by construction.
    expect(Object.keys(buildLobbyList([room])[0]).sort()).toEqual([
      'code',
      'displayNumber',
      'hostNickname',
      'maxPlayers',
      'playerCount',
      'rules',
      'status',
    ]);
  });

  it('reports waiting vs playing off the room phase', () => {
    const room = publicRoom('AAAA');
    room.addPlayer('B', 'bob');
    expect(buildLobbyList([room])[0]).toMatchObject({ status: 'waiting', playerCount: 2 });

    room.toggleReady('A');
    room.toggleReady('B');
    expect(buildLobbyList([room])[0].status).toBe('playing');
  });

  it('names the current host, even after the original host leaves', () => {
    const room = publicRoom('AAAA');
    room.addPlayer('B', 'bob');
    room.removePlayer('A');
    expect(buildLobbyList([room])[0].hostNickname).toBe('bob');
  });

  it('sorts by display number so the list does not reshuffle under the cursor', () => {
    const a = publicRoom('AAAA');
    a.setDisplayNumber(3);
    const b = publicRoom('BBBB');
    b.setDisplayNumber(1);
    const c = publicRoom('CCCC');
    c.setDisplayNumber(2);
    expect(buildLobbyList([a, b, c]).map((r) => r.displayNumber)).toEqual([1, 2, 3]);
  });

  it('is empty when every room is private', () => {
    const secret = new Room('BBBB');
    secret.addPlayer('B', 'bob');
    secret.setPrivate(true);
    expect(buildLobbyList([secret])).toEqual([]);
  });
});

describe('display numbers', () => {
  it('public rooms get sequential numbers, private rooms get none', () => {
    const mgr = new RoomManager();
    const a = mgr.createRoom('A', 'alice') as Room;
    const secret = mgr.createRoom('S', 'sam', undefined, { isPrivate: true }) as Room;
    const b = mgr.createRoom('B', 'bob') as Room;

    expect(a.state.displayNumber).toBe(1);
    expect(b.state.displayNumber).toBe(2);
    // A sequential number would make unlisted rooms walkable.
    expect(secret.state.displayNumber).toBeNull();
    expect(secret.state.isPrivate).toBe(true);
    mgr.destroy();
  });

  it('a freed number is reused — lowest unused wins', () => {
    const mgr = new RoomManager();
    const a = mgr.createRoom('A', 'alice') as Room;
    const b = mgr.createRoom('B', 'bob') as Room;
    expect([a.state.displayNumber, b.state.displayNumber]).toEqual([1, 2]);

    mgr.removeRoom(a.state.code);
    const c = mgr.createRoom('C', 'carol') as Room;
    expect(c.state.displayNumber).toBe(1);
    mgr.destroy();
  });

  it('keeps the random code as identity even for numbered public rooms', () => {
    const mgr = new RoomManager();
    const a = mgr.createRoom('A', 'alice') as Room;
    expect(a.state.code).toHaveLength(4);
    expect(mgr.getRoom(a.state.code)).toBe(a);
    mgr.destroy();
  });

  it('allRooms enumerates private and public alike — filtering is the lobby\'s job', () => {
    const mgr = new RoomManager();
    mgr.createRoom('A', 'alice');
    mgr.createRoom('S', 'sam', undefined, { isPrivate: true });
    expect(mgr.allRooms()).toHaveLength(2);
    expect(buildLobbyList(mgr.allRooms())).toHaveLength(1);
    mgr.destroy();
  });
});
