# Codebreaker Terminal

A realtime code-breaking duel. You set a secret code, your opponent sets one,
and you race to crack each other's — watching their digits land as they type.

**▶ Play it live: <https://codebreaker-seven.vercel.app/>** — client on Vercel, server self-hosted on a VPS (Caddy + pm2).

<!-- TODO(owner): add a short GIF of a round being played (already tracked in docs/planner.md) -->

## How to play

Both players pick a secret code. Take turns guessing; after each guess you get:

- **E** (exact) — right digit, right position
- **P** (partial) — right digit, wrong position

`E2 P1` means two digits are sitting exactly right and one more is in your code
but in the wrong place. First to crack the other's code wins — though if you get
there first, your opponent gets one last turn to level it, and a matching crack
is a draw.

The host sets the rules before the game: code length (3–6), whether digits may
repeat, and how many rounds.

## What's in it

- **Play a stranger, a friend, or the computer.** The landing screen lists open
  rooms — click one to join. No codes to paste.
- **Private rooms** stay off the list and are joined by their 4-character code,
  for when you want a specific person and nobody else.
- **Play vs computer** at three difficulties. It's a plain local algorithm, not
  an AI — no API keys, no network calls. *Easy* only remembers your last clue.
  *Medium* loses the thread on older ones, and needs about as many guesses as a
  person does. *Hard* forgets nothing and picks the guess expected to eliminate
  the most possibilities; a focused player still wins about 30% of the time.
  (Those numbers are measured, not guessed — there's a simulation harness.)
- **Bots are just players.** The host can add one to any free seat and kick
  anyone — bot or human — from the lobby, so "rematch, but harder" is a kick and
  a re-add rather than a setting.
- **You already have a name.** Guests get a generated one (*Static Owl*, *Rogue
  Signal*); reroll it, or type your own.
- **Live opponent input** — you see their digits appear as they type them.
- **Refresh-safe.** Drop out mid-game and you have 30 seconds to get back in.

## Stack

- **Client**: React + TypeScript + Tailwind + Vite (Vercel)
- **Server**: Node.js + Express + Socket.io (self-hosted VPS — Caddy + pm2)
- **Shared**: TypeScript types, socket event names, guest wordlist

No database — all game state lives in server memory.

## Structure

```
├── client/     Vite + React + TS + Tailwind
├── server/     Node + Express + Socket.io + TS
├── shared/     Shared types and event constants
└── docs/       (local notes, not in repo)
```

## Getting started

```bash
# client
cd client && npm install && npm run dev

# server (separate terminal)
cd server && npm install && npm run dev
```

Then open two browser windows (one incognito) at `http://localhost:5173`.

```bash
cd server && npm test    # server suite
cd client && npm test    # client suite
cd server && npm run sim # bot balance harness
```
