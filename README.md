# Codebreaker Terminal

A 2-player realtime number codebreaking game.

**▶ Play it live: <https://codebreaker-seven.vercel.app/>** — client on Vercel, server on Render.

<!-- TODO(owner): add a short GIF of a round being played (already tracked in docs/planner.md) -->

## Stack

- **Client**: React + TypeScript + Tailwind + Vite (Vercel)
- **Server**: Node.js + Express + Socket.io (Render)
- **Shared**: TypeScript types

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

## How to play

Two players. One sets a secret code, the other guesses it — and vice versa.
Get feedback after each guess: E (exact) = right digit, right position. P (partial) = right digit, wrong position.
