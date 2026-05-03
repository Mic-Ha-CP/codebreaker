# Codebreaker Terminal

A 2-player realtime number codebreaking game.

## Status: In progress

## Stack

- **Client**: React + TypeScript + Tailwind + Vite (Vercel)
- **Server**: Node.js + Express + Socket.io (Railway)
- **Shared**: TypeScript types

## Structure

```
├── client/     Vite + React + TS + Tailwind
├── server/     Node + Express + Socket.io + TS
├── shared/     Shared types and event constants
└── docs/       Spec and planning docs (gitignored)
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

## What I learned

<!-- fill in after completion -->
