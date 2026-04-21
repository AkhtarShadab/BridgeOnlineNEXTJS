# BridgeOnline — Developer Learning Guide

A session-by-session breakdown of everything built in this project,
written for someone with strong DSA fundamentals and basic dev experience.

Each module builds on the previous one. Start from Session 01.

---

## Modules

| Module | Topic | Session |
|---|---|---|
| [01 — Architecture & Design](./01-architecture-and-design.md) | How the whole system fits together | Session 001 |
| [02 — Game Logic as Pure Functions](./02-game-logic-pure-functions.md) | Bridge rules, DSA inside the engine | Session 002 |
| [03 — Database Design with Prisma](./03-database-prisma.md) | Schema, FK constraints, ORMs | Session 003 |
| [04 — Real-Time with Socket.io](./04-realtime-socketio.md) | Events, rooms, pub-sub, state sync | Session 003 |
| [05 — Testing Strategy (5 Layers)](./05-testing-strategy.md) | Unit → Integration → E2E | Sessions 002–004 |
| [06 — WebRTC & Voice Chat](./06-webrtc-voice.md) | P2P, SDP, ICE, mesh topology | Session 001 |
| [07 — Scalability Gaps & Fixes](./07-scalability.md) | Redis, queues, reconnection, observability | Session 001 |

---

## Who This Is For

You know:
- Big-O notation, trees, graphs, hash maps, sorting algorithms
- Basic web concepts (HTTP, JSON, what a server is)
- Some TypeScript/JavaScript syntax

You are learning:
- How a production full-stack app is structured
- How real-time multiplayer games work under the hood
- How to test code systematically
- Why each architectural decision was made
