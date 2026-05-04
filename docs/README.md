# Signal AI – Docs

| Doc | What's inside |
| --- | --- |
| [architecture.md](./architecture.md) | System diagram, monorepo layout, domain model (`StrategyJSON` + recursive `ConditionGroup`), database schema, strategy execution flow, safety/guardrails, key-files cheat sheet. |
| [implementation.md](./implementation.md) | Feature-by-feature walkthrough: builder wizard, `GroupEditor`, mock-data mode, indicators & engine internals, validation, Upstox wrapper, WebSocket fan-out, order-flow gating, end-to-end example, extension points. |
| [requirements.md](./requirements.md) | Prerequisites (Node 18+, Python 3.10+), JS + Python deps, Supabase/Upstox setup, all env vars, 4-layer live-trading gate, one-shot setup checklist. |

Start with **architecture.md** for the big picture, then dip into
**implementation.md** for whichever subsystem you're working on.
