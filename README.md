# BandBro

A shared songbook for bands and players: find songs with lyrics + chords (ChordPro), fork them into a
band or personal library, transpose them, render the right chords **per player** (capo vs concert),
organize them into setlists, and perform them on stage — online or fully offline.

**Built with** Bun · Elysia · better-auth · Prisma (SQLite) · React 19 · TanStack Router/Query ·
chordsheetjs · Tailwind v4 / shadcn.

## Getting started

```bash
bun install
cp .env.example .env        # set DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
bun run db:migrate          # apply migrations
bun run dev                 # http://localhost:3000  (landing /, app /app, api /api)
```

## Docs

- **[CLAUDE.md](CLAUDE.md)** — architecture, current state, decisions, and the full task breakdown. Start here.
- **[docs/BandBro-PRD.md](docs/BandBro-PRD.md)** — product requirements.
- **[docs/BandBro-Design-Briefs.md](docs/BandBro-Design-Briefs.md)** — per-screen design briefs.

See `package.json` for the full `db:*` / `auth:generate` script set.
