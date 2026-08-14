# BandBro — Architecture & Build Plan

> A shared songbook for bands and players: discover → fork → organize → share → perform (online or off).
> This file is the working map of the project — what exists, how it's wired, the decisions still
> open, and the task breakdown to get from scaffolding to v1.

> **Status (v1 build complete).** The Phase-1 + Phase-2 plan in §7 is implemented: schema +
> migration + seed, the shared transpose/capo engine (tested), the full API surface, and all
> screens (Library, Song View, ChordPro editor, Capo views, Live mode, Setlists, Band management,
> Preferences, Home) plus offline PWA and PDF export. Decisions D1–D9 are all **decided** (D3 was
> adjusted — see below). Remaining/next: richer drag-reorder, member role-editing UI, suggestion
> review UI, and the polish items in §7/G. Build & verify locally with `bun test`, `bunx biome check`,
> and `bun build ./src/frontend/index.html`.
>
> **Prisma in a sandboxed/offline env:** the Prisma CLI downloads its schema-engine from
> `binaries.prisma.sh`, which some sandboxes block for Node's fetch. If `prisma generate`/`migrate`
> fails with ECONNRESET, download the binary once with `curl` and point the CLI at it:
> `PRISMA_SCHEMA_ENGINE_BINARY=/path/to/schema-engine` (+ `NODE_EXTRA_CA_CERTS` for the proxy CA).

**Read alongside:**
- [`docs/BandBro-PRD.md`](docs/BandBro-PRD.md) — product scope, personas, fork model, roles, MoSCoW, phasing.
- [`docs/BandBro-Design-Briefs.md`](docs/BandBro-Design-Briefs.md) — per-screen design briefs.
- The nine designed screens (Claude Design exports): Home, Login, Library, Song View, ChordPro Editor,
  Live Mode, Playlist, Band Management, Preferences, plus the Design System sheet.

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Bun** | dev/build/test; `Bun.serve` is the HTTP server (`src/backend/index.ts`). |
| API | **Elysia** | `src/backend/api.ts`; service-per-file under `src/backend/services/`. |
| Type-safe client | **Eden Treaty** + `eden-tanstack-react-query` | End-to-end types from `Api` type → frontend. |
| Auth | **better-auth** + `organization` plugin | Email/password; orgs = bands. `src/backend/auth.ts`. |
| DB | **SQLite** via **Prisma 7** (`libsql` adapter) | Schema split across `prisma/models/*.prisma`. |
| Frontend | **React 19** + **TanStack Router** (file-based) + **TanStack Query** | SPA mounted at `/app`. |
| Editor | **CodeMirror** + `@chordbook/codemirror-lang-chordpro` | ChordPro source editing. |
| ChordPro | **custom parser** (`src/shared/chordpro.ts`) | Parse + transpose engine; no runtime ChordPro lib dependency. |
| PDF export | **`chordpro` CLI** (server-side) | Setlist PDFs, rendered from a generated ChordPro doc + config (§D8). |
| UI | **shadcn** (base-nova) + **Tailwind v4** + Tabler icons | Tokens in `src/frontend/index.css`. |
| Lint/format | **Biome** | `biome.json` (tabs, double quotes). |
| Deploy | **Railway** (RAILPACK) | `railway.json`. |

**Three entry surfaces** (`src/backend/index.ts`): `/` → marketing landing (`src/landing`), `/app/*` → the
React SPA (`src/frontend`), `/api/*` → Elysia. The SPA uses `/app` as router basepath.

---

## 2. Repo layout

```
src/
  backend/
    index.ts            Bun.serve — routes / → landing, /app → SPA, /api → Elysia
    api.ts              Elysia app + route definitions + response schemas (exports `Api` type)
    auth.ts             better-auth config + `auth`/`authOptional` Elysia macros
    prisma.ts           Prisma client singleton
    services/           one file per operation (songs*, songbooks*) — pure functions, take {user,…}
  frontend/
    routes/             TanStack file-based routes (_auth/*, _protected/*, design.tsx)
    components/         ChordSheet, CapoToggle, TransposeStepper, RoleBadge, OfflinePill, MetaChip,
                        SongEditor, SongPreview, + ui/ (shadcn primitives)
    contexts/           SessionContext, UserContext
    lib/                utils (cn), push (stub)
    api.ts / auth.ts    Eden client + better-auth React client
    index.css           Design tokens (see §6)
  shared/               isomorphic code (currently addNumbers demo) — transpose engine goes here
  generated/            Prisma client + TanStack route tree (do not hand-edit)
  landing/              marketing page
prisma/
  schema.prisma         generator + datasource only
  models/auth.prisma    better-auth models (User, Session, Account, Verification, Organization, Member, Invitation)
  models/songs.prisma    domain models (Song, Chart, Artist, Credit, Songbook, SongbookSong)
  migrations/
```

### Commands

```bash
bun run dev          # dev server + tsr route watcher (NODE_ENV=development)
bun run prod         # production server
bun test             # tests
bun run db:create    # create a migration (--create-only)
bun run db:migrate   # apply migrations (deploy)
bun run db:push      # push schema without migration (prototyping)
bun run db:generate  # regenerate Prisma client
bun run auth:generate  # regenerate prisma/models/auth.prisma from better-auth config
bun run import:kytary <url|file.html> [-o dir]   # akordy.kytary.cz sheet → ChordPro
```

**Importers.** `src/shared/kytary.ts` converts an akordy.kytary.cz ("SmartChords") song page
into ChordPro by walking its `#sheet-content` markup (`div.scs-section[data-type]` → sections,
`span.scs-chord` → inline `[chords]`), rewriting European note names (`H`→`B`, `B`→`Bb` via
`notation.internationalChord`, §D11) so the §D5 engine reads them. The conversion is pure + unit-tested; `src/tools/importKytary.ts` is the
CLI wrapper (fetch or local file → stdout or `<slug>.cho`). Pages carry no key/capo/tempo, so
only `{title}`/`{artist}` are emitted (plus `{x_source}` for provenance).

In-app, the same converter backs **`POST /api/songs/import`** (`services/songsImport.ts`): it takes
`{url, organizationId}`, checks `requireWrite` **and** the URL's host against an allowlist *before*
fetching (the URL is user-supplied — the allowlist is the SSRF guard), then creates the song through
the normal `songsCreate` path so metadata/credits/tags are derived identically. Statuses: 400 bad
URL/host, 403 no write role, 404 missing page, 422 page holds no chord sheet, 502 fetch failed.
`ImportSongDialog`/`ImportSongButton` sit beside "New song" on Home + Library and navigate to
`/app/songs/$slug/edit` on success, so the importer's output lands in the editor for key/capo.

---

## 3. Domain model — concepts → schema

The PRD's mental model (§5) and how it maps onto the current Prisma schema:

| Concept (PRD) | Schema today | Status |
|---|---|---|
| **User** | `User` (better-auth) | ✅ |
| **Band (workspace)** | `Organization` + `Member` + `Invitation` (org plugin) | ✅ structure; roles need config (§5, D6) |
| **Personal scope** ("one-man-band") | — | ❌ **not modeled** (D1) |
| **Curated/public scope** | `Song.organizationId = null` / `Chart.organizationId = null` | ✅ convention exists |
| **Song** (title, artist, key, tempo, capo, tags + ChordPro) | `Song` (name, year) + `Chart` (content, key, capo) + `Credit`→`Artist` | ⚠️ partial — no tempo/time-sig/tags (D4) |
| **Chart** (an arrangement) | `Chart` (content, key, capo, forkedFromId) | ✅ |
| **Fork** | `Chart.forkedFrom` self-relation | ⚠️ granularity + slug uniqueness unresolved (D3) |
| **Playlist / Setlist** | `Songbook` + `SongbookSong` (order) | ✅ structure; services are stubs |
| **Role** (Admin/Writer/Reader) | `Member.role: String` (better-auth default `owner`/`admin`/`member`) | ❌ needs Admin/Writer/Reader mapping (D6) |
| **Member view preference** (capo/concert default) | — | ❌ **not modeled** (D2) |
| **Suggestion** (propose edit to non-writable song) | — | ❌ not modeled (should-have) |

### Scope model (the load-bearing convention)

A song/chart's **scope** is derived from `organizationId`:
- `null` → **Curated** (read-only seeded library).
- a **personal** org id → **Personal** (one user).
- a **band** org id → **Band** (shared, role-gated).

`songsList`/`songsRead` already filter on `organizationId IS NULL OR member-of(org)`. Write paths
(`songsUpdate`, `songsDelete`, fork target) must additionally enforce the caller's **role** in that org.

---

## 4. Current state — scaffolded vs. stubbed

**Built / ported:**
- Auth wiring (email+password, org plugin), `auth`/`authOptional` macros, protected route layout.
- `songsList`, `songsRead` (scope-filtered), `songsCreate` (name + single chart only — ignores credits/metadata).
- Design system in code: tokens, fonts, and ported components — `ChordSheet`, `CapoToggle`,
  `TransposeStepper`, `RoleBadge`, `OfflinePill`, `MetaChip`, `SongEditor` (CodeMirror), `SongSheet`
  (renders the shared engine's blocks). Showcased at the `/app/design` route.
- Prisma schema for Song/Chart/Artist/Credit/Songbook/SongbookSong + better-auth models; 3 migrations.

**Stubbed / missing:**
- `songsUpdate`, `songsDelete` → empty functions.
- **All** songbook services (`songbooksList/Read/Create/Update/Delete`) → empty.
- No fork endpoint, no search/filter params, no PDF export, no preferences endpoint.
- Frontend routes are placeholders: `_protected/index` = "Hello {name}", `songs.$slug` / `songs.search`
  = raw data dumps, `song.$slug` = a hardcoded ChordPro editor demo. None of the nine designs are built.
- `lib/push.ts` is a non-functional stub; no service worker, manifest, or offline cache.
- Personal scope, member preferences, roles-as-Admin/Writer/Reader, tags, suggestions: not modeled.

---

## 5. Architecture decisions

Decisions that shape the data model and must be settled before/while building. **(R)** = recommendation;
several map to PRD §12 open questions.

### D1 — Personal scope = a personal Organization *(R: decided-by-default)*
The schema dropped per-row `userId` ownership in favor of `organizationId`. Cleanest path, and exactly
what PRD §4 implies ("a solo player is a workspace of one"): **auto-create a hidden personal Organization
on user signup** and treat it as the Personal scope. Reuses all org/membership/fork machinery; no second
ownership axis. → Task: signup hook + a flag (`Organization.metadata` or a `personal` boolean) to hide
personal orgs from the band switcher and forbid inviting members.

### D2 — Default chord view stored on User *(R)*
The Preferences screen shows a single account-level "Default chord view" (as-fingered / concert). Store
`defaultChordView` on **User** (global) rather than per-`Member`; per-song toggle stays client-side, and a
per-band override can be added later if needed (PRD §12 Q3). → Task: add column + expose via better-auth
`additionalFields` / an update endpoint.

### D3 — Fork granularity, slug uniqueness, provenance *(DECIDED — implemented)*
**Fork copies the Song + its chosen Chart into the target scope** (`songsFork`), keeping
`Song.forkedFromId` + `Chart.forkedFromId` for the "forked from Curated" provenance shown on the Song
View. On slug uniqueness I kept `Song.slug` **globally unique** but generate it with a **collision
suffix** (`uniqueSongSlug` → `house-of-the-rising-sun-2`). This avoids changing the global
`/app/songs/$slug` URL scheme to be scope-aware (the alternative, `@@unique([organizationId, slug])`,
forces scope into every song URL). Trade-off: forked titles can carry a numeric suffix in their slug —
acceptable for v1; revisit if/when songs need scope-qualified URLs.

### D4 — ChordPro is the source of truth; metadata is denormalized on write *(R)*
The `{title}{artist}{key}{capo}{tempo}{tags}` directives live in the chart `content`. Keep `content`
authoritative, but **parse on save** into denormalized columns (`key`, `capo`, `tempo`, `timeSignature`,
and tags) so Library can sort/filter without parsing every row. Add the missing columns; add a `Tag` model
+ `SongTag` join (tags describe the song, not the arrangement). The shared ChordPro parser extracts these on parse.

### D5 — Transpose & capo are pure client-side, in `src/shared` *(R)*
Transpose (key shift) and the capo→concert translation are the **same operation**: shift every chord by N
semitones. The designs ship a tiny, dependency-free engine (`shiftRoot`/`transposeChord`, sharp-spelling,
slash-chord aware). Port it to `src/shared/transpose.ts`, use it for
both controls, and derive the **concert view = transpose by `+capo`**. No API involved. One canonical
engine → identical results in Song View, Live mode, and PDF export.

**Source-level transpose (baking).** Views transpose the *render*; the editor can also transpose the
**source**. `src/shared/chordproSource.ts` (`transposeChordproSource`, unit-tested) rewrites every inline
`[chord]` plus the `{key}` directive in the ChordPro text — used by the editor toolbar's "Transpose source"
stepper so an imported song written in E/F#m/C#m/B becomes G/Am/Em/D for everyone, not just the current
viewer. `{capo}` is deliberately left alone (a capo is a physical position, not a property of the written
chords). Baked output is spelled for the **target key** (`keyAccidental` in `transpose.ts`: +3 from C gives
Eb/Ab/Bb, not D#/G#/A#); the view/PDF paths keep the sharps-only default. `chordproSource.ts` also owns the
`concertChordpro`/`stripCapoDirective` helpers the PDF export uses (moved out of `chordproPdf.ts`).

### D6 — Roles via better-auth access control *(needs config)*
Map the org plugin to the PRD's three roles. Define an access-control instance with **Admin / Writer /
Reader** (Admin = manage band+members+songs; Writer = CRUD songs + build playlists; Reader = read/
transpose/perform/offline/PDF) and enforce it in write services. PRD §12 Q1/Q6: confirm whether any Writer
can delete or Admin-only. → Task: `betterAuth` `ac`/`roles` config + a `requireRole(orgId, level)` guard
used by `songsUpdate`/`songsDelete`/fork/songbook writes.

### D7 — Offline PWA: service worker + per-playlist cache, read-only in v1 *(R)*
Live mode must run with no signal. Plan: add a **web app manifest** + **service worker** (precache the app
shell; runtime-cache a playlist's song payloads on "Download for offline" into the **Cache API / IndexedDB**).
v1 is **read-only offline** (no edit-queue/sync — PRD §12 Q5). Scope = per-playlist download (matches the
Playlist screen's "Download for offline" control). Wire SW registration into the Bun build. Note:
`lib/push.ts` (web push) is unrelated to offline and not a v1 must-have — leave it parked.

### D8 — PDF export: server-side via the `chordpro` CLI *(DECIDED — implemented)*
The Playlist screen exports an ordered, one-song-per-page chord-sheet PDF with a render-mode choice
(as-fingered / concert / both; capo'd songs print twice under "both"). This is rendered **server-side by
the reference `chordpro` CLI** (`GET /api/songbooks/:id/pdf?mode=…`, `songbooksPdf` service):
- We build one ChordPro document for the whole setlist — songs joined by `{new_song}` so the CLI paginates
  one song per page and auto-generates a table of contents.
- For **concert** view we rewrite the source (transpose every `[chord]`/`{key}` by the capo amount and drop
  `{capo}`) with the shared §D5 engine, so the PDF matches the on-screen views. **both** emits a capo'd song
  twice (as-fingered, then a `(concert)` copy). See `src/shared/chordproPdf.ts` (unit-tested).
- **Layout** lives in `src/shared/chordproConfig.ts`, written to a temp JSON and passed as `--config`. It
  overrides four
  unhelpful CLI defaults: `papersize: a4`; `labels.width: 0` + `labels.comment: comment_italic` so section
  names ("Verse 1", "Riff") sit *above* their section as an italic comment instead of in a left margin that
  eats ~65pt of line width; `songbook.dual-pages: false`, since stock chordpro is duplex and starts every
  song on a right-hand page — which put a **blank filler page between most songs**; and
  `diagrams.show: false` (+ `kbdiagrams`), dropping the chord-shape strip along the bottom of each song,
  which also hands ~60pt of every page back to the chart.
- **Two columns on demand.** A song that doesn't fit one page is set in two columns (`{columns: 2}`, injected
  after its `{title}` so it's scoped to that song) rather than spilling over the page break.
  `needsTwoColumns` (in `chordproPdf.ts`) decides from an estimate of the rendered height — the CLI has no
  fit-to-page option, so we model its line heights (`LINE_HEIGHT` in `chordproConfig.ts`) over the parsed
  blocks. `PAGE_BODY_HEIGHT` is calibrated against the real CLI: a 720pt body fits an A4 page, 734pt doesn't.
  Two columns are used **only when they actually land the song on one page** and **only when no tab staff is
  wider than half the page** — chordpro reflows lyrics but renders verbatim (tab) lines as written, so a wide
  staff would be clipped at the column edge. Both guards are unit-tested.
- **Tables of contents.** Two, both at the front: *Table of Contents* (setlist order) then *Contents by
  Title*; the stock third table (by artist) is dropped. They stay at the front because the CLI can only emit
  them there — **don't** try to lift the by-title pages to the back afterwards (we did, with `pdf-lib`, and
  reverted): a table's rows are link annotations pointing at page objects, so copying only those pages into
  another document leaves every link dangling. A single-song setlist gets no table at all (the CLI omits it).
- ChordPro 6 renders Unicode out of the box (Czech diacritics confirmed), so no font config is needed.
  An optional `CHORDPRO_CONFIG` env points the CLI at a JSON config for custom layout/fonts; it is passed
  *after* ours, so a deployment can override any of the above.
- **Deploy:** the `chordpro` binary must be on the server. The `Dockerfile` is Ubuntu-based and installs
  the prebuilt `chordpro` apt package (Debian/`oven/bun` has no such package, so a CPAN build there is
  brittle — this avoids it), then copies the Bun binary from `oven/bun`. `railway.json` uses the
  `DOCKERFILE` builder. The endpoint returns **501** if the binary is missing, so the app still boots
  without it.
- A dependency-free fallback remains: the print route `/app/setlists/$id/print` renders the same content
  with `@media print` for the browser's print-to-PDF (no longer the primary path, kept for offline/no-CLI).

### D9 — Backend conventions (already established — keep)
One **service function per operation** in `src/backend/services/`, taking a plain args object
(`{ user, session, … }`); `api.ts` wires HTTP + declares **explicit `t.Object` response schemas** (these
drive Eden's client types — keep them tight). Frontend never imports services — only the Eden `api` proxy.

### D10 — Fan experience: public QR share + read-only live view *(implemented)*
The band shares a 5-character **session code** from the stage; fans open a public, no-auth Live view on
their own phones that auto-follows the current song. Implements the "Fan experience" Claude Design handoff.
- **Model.** `LiveSession` (`code` unique, `songbookId`, denormalized `organizationId`, `currentSongIndex`)
  in `prisma/models/songs.prisma`; the relation lives on `Songbook` so deleting a band cascades its sessions.
- **API (`services/liveSessions.ts`, group `/live`).** `POST /live` (auth, member-only) creates/reuses the
  active session for a setlist; `POST /live/:code/current` (auth) pushes the band's current index; **`GET
  /live/:code` is public/no-auth** and returns the resolved read-only setlist (chart `content` + meta) plus
  the current index — fans poll it (~4s). "Watching" is a lightweight **in-memory heartbeat** (per-`clientId`,
  15s window; single-instance, resets on restart) — no DB writes on the hot read path.
- **Frontend.** Public routes `s.index.tsx` (join-by-code landing) + `s.$code.tsx` (the fan live view, the
  immersive "Now Playing" direction 1c — full-screen lyrics + a subtle accent glow, with all controls in an
  expandable bottom drawer) sit **outside `_protected`/`_auth`** so they need no session. The drawer is the
  shadcn `Drawer` (`components/ui/drawer.tsx`, built on `vaul`) used as a **persistent, non-modal snap drawer**
  (peek → full). They render the warm paper/dark palette by overriding the theme CSS vars on the view root and
  on the drawer's portalled content (`lib/fanTheme.ts`), reusing the shared `ChordSheet`/`SongSheet` (extended
  with `hideChords` + `align`) and transpose engine — identical chord sheets to the band's Live mode. View
  prefs (chords/size/theme/transpose) are **per-device**, never broadcast.
- **Band entry points.** `ShareSheet` (always-dark, band-facing) + `ShareWithFansModal` are wired into Live
  mode ("Share with the room") and the setlist view (`showPrint`). `lib/useFanSession.ts` lazily creates the
  session on first share and syncs `currentSongIndex` as the band advances. QR via `qrcode-generator`.
- **URLs.** The design names `bandbro.live/s/<code>`; this single-app build serves the fan view at
  `/app/s/<code>` and encodes the **real reachable origin** in the QR/copy-link (`lib/fanSession.ts`) so codes
  actually scan. A production reverse-proxy can map `bandbro.live` → this app with no code change.

### D11 — Note names: international **stored**, European **read and written** *(implemented)*
What we persist and compute on is always the international convention (`B` = B natural, `Bb` = B-flat) — that's
what `transpose.ts` understands and what the kytary importer normalizes to. What a user sees and types is the
Central-European convention by default: `H` for B natural, `B` for anything sounding as B-flat. Both chord-level
mappers live in **`src/shared/notation.ts`** (`displayChord`/`displayKey` out, `internationalChord` in — the
former `kytary.normalizeChordConvention`, moved here); the ChordPro-text-level pair
(`displayChordproSource`/`internationalChordproSource` in `chordproSource.ts`) rewrites **only `[chords]` and the
`{key}` directive**, never lyrics/titles, via one `mapChordproChords` helper shared with the transpose rewrite.
All unit-tested.
- **Render:** `ChordSheet` prints `displayChord(...)`, so every chord sheet (Song View, Live, fan view, editor
  preview, print) shows `H`/`B`; each key-label site wraps its value in `displayKey`.
- **Editor:** `ChordProEditorScreen` keeps the pane text (`source`) in the display convention and derives the
  international `content` from it (`useMemo`) for the preview, metadata, transpose-bake and save. Conversion is
  strictly **at the boundary** — once on load, on each save — never per keystroke: a round trip on every
  keystroke would rewrite `Bb` back to `B` under the cursor and make typing flats impossible. A footer under the
  pane states the convention.
- **Round trip** is pitch-exact for `B`/`Bb`; `A#` comes back as the enharmonically equal `Bb`. The inherent
  ambiguity is that international-convention text *pasted* into the editor reads its `B` as B-flat — the price of
  the convention, hence the footer hint.
- The server-side PDF (`chordpro` CLI, §D8) renders raw source and stays international.
- Every entry point takes a `NoteConvention` argument (defaulting to `european`), so the per-user preference
  (a sibling of `defaultChordView`, §D2) is a matter of threading it down — deliberately not built yet.

---

## 6. Design system (for building the screens)

Tokens already in `src/frontend/index.css`; mirror the Claude Design exports exactly.

- **Accent (warm amber):** light `#c2711a`, dark `#e8a13a` (`--primary`). One accent only.
- **Surfaces:** light bg `#ffffff` / surface `#f5f7f9` / surface-2 `#eef1f5`; dark bg `#16181c` /
  `#1d2025` / `#23262c`. Ink/muted/border tokens per theme.
- **`--ok` `#3fae7a`** for the online/offline indicator dot.
- **Fonts:** Space Grotesk (`font-display` — titles, buttons, labels), IBM Plex Sans (`font-sans` — lyrics,
  body), IBM Plex Mono (`font-mono` — **chords**, meta, key/capo chips).
- **Light = desktop authoring; Dark = stage / Live mode.** Theme toggle is global.
- **The chord sheet is the hero** everywhere — chords (mono, accent) sit above lyrics; clean alignment,
  generous line-height. `ChordSheet` is the atomic component reused by Song View, editor preview, Live
  mode, and PDF.
- **The capo/concert toggle (`CapoToggle`) is one recognizable control** appearing identically on Song
  View, Live mode, and Preferences.

---

## 7. Task breakdown

Grouped by area, then sequenced into the PRD's phases at the end. Foundation tasks (DB, engine, roles)
unblock most screens — do them first.

### A. Data model & migrations
- [ ] **A1.** Personal scope: signup hook to auto-create a personal `Organization`; mark/hide personal orgs (D1).
- [ ] **A2.** Roles: configure better-auth access control with Admin/Writer/Reader; seed `owner`→Admin mapping (D6).
- [ ] **A3.** Add `User.defaultChordView` (`asfingered` | `concert`) (D2).
- [ ] **A4.** Song metadata: add `tempo`, `timeSignature` to `Chart`; add `Tag` + `SongTag` join (D4).
- [ ] **A5.** Fork model: add `Song.forkedFromId`; change slug uniqueness to `@@unique([organizationId, slug])`; migration + backfill (D3).
- [ ] **A6.** *(should-have)* `Suggestion` model (chartId, proposedContent, proposerId, status, timestamps).
- [ ] **A7.** Seed script for the Curated library (the ~7 traditional songs shown in the Library design).

### B. Shared engine & utilities
- [ ] **B1.** Port the transpose engine to `src/shared/transpose.ts` (chord shift, sharp-spelling, slash chords) (D5).
- [ ] **B2.** ChordPro metadata parser: `content` → `{title,artist,key,capo,tempo,timeSig,tags,sections}` for denormalization + preview (D4).
- [ ] **B3.** "Two views from one chart" helper: given `(content, capo, transposeSteps, view)` → rendered blocks for `ChordSheet`.

### C. APIs (Elysia services)
- [ ] **C1.** `songsCreate` v2: accept full metadata + credits/artists (find-or-create Artist) + scope selector; derive slug per-scope.
- [ ] **C2.** Implement `songsUpdate` + `songsDelete` with `requireRole` write guards (D6).
- [ ] **C3.** `songsList` filters: `scope/orgId`, `q` (title/artist), `artist`, `key`, `tag` (powers Library search).
- [ ] **C4.** **Fork** endpoint `POST /songs/:slug/fork` → copies Song+Chart into a writable target org, sets provenance (D3).
- [ ] **C5.** Songbooks (playlists): implement list/read/create/update/delete + add/remove song + reorder (`order`).
- [ ] **C6.** Preferences endpoint (or better-auth `additionalFields`) to read/update `defaultChordView`.
- [ ] **C7.** *(should-have)* Suggestions: create / list / accept (apply to chart) / reject.
- [ ] **C8.** Bands/members/invitations: wire better-auth org client calls (create band, invite by email/link, change role, switch active org) — mostly config + UI, little custom API.

### D. PWA / offline (D7)
- [ ] **D1.** Web app manifest + icons; register a service worker in the Bun build.
- [ ] **D2.** App-shell precache; offline fallback for `/app`.
- [ ] **D3.** "Download for offline" → cache a playlist's resolved song payloads (Cache API/IndexedDB); progress UI; "Available offline" state.
- [ ] **D4.** Offline detection → `OfflinePill`; ensure Live mode reads cached data with no network.

### E. PDF export (D8)
- [ ] **E1.** Print-styled route rendering a playlist in order (one song/page, page-break, capo/key header).
- [ ] **E2.** Render-mode option: as-fingered / concert / both (capo'd song prints twice); reuse `ChordSheet` + transpose engine.

### F. Screens (each = TanStack route + components + the APIs above)

| # | Screen | Route(s) | Key pieces / reused components | Depends on |
|---|---|---|---|---|
| F1 | **Song View** (build first) | `/app/songs/$slug` | `ChordSheet`, `CapoToggle`, `TransposeStepper`, fork/edit/suggest actions, "forked from" provenance, "Open in Live mode" | B1–B3, C2/C4 |
| F2 | **ChordPro Editor** | `/app/songs/$slug/edit`, `/app/songs/new` | `SongEditor` (left) + `SongPreview`/`ChordSheet` (right), metadata fields, **Save-to scope selector** | B2, C1/C2 |
| F3 | **Capo behavior** | (on F1 + F4) | `CapoToggle` wired to B3; show active capo value; default from `defaultChordView` | B1/B3, C6 |
| F4 | **Live mode** (mobile/tablet-first) | `/app/live/$playlistId` | Big chord sheet, auto-scroll w/ speed, prev/next + swipe, transpose + capo toggle, `OfflinePill` | B3, C5, D-* |
| F5 | **Library / Browse** | `/app` or `/app/library` | Scope switcher (Curated · bands · Personal), search + filters, results list w/ Open/Fork | C3/C4 |
| F6 | **Playlist / Setlist** | `/app/setlists`, `/app/setlists/$id` | Ordered drag-reorder list, add-song search, **Download offline** + **Export PDF**, clone | C5, D-*, E-* |
| F7 | **Band Management** | `/app/bands`, `/app/bands/$id` | Member list + `RoleBadge`, invite (link/email) + role assign, band switcher | A2, C8 |
| F8 | **Preferences** | `/app/preferences` | `CapoToggle` as default-view setting + worked example, theme toggle, account + memberships | A3, C6 |
| F9 | **Home / Dashboard** | `/app` (or `/app/home`) | "Up next" gig + setlist, jump-back-in, recent songs, your bands; Live-mode CTA | C3/C5, C8 |
| F10 | **Auth** | `/app/login`, `/app/register` | better-auth email/password; style to design (Login.dc.html) | — |
| F11 | **App shell / nav** | `_protected/layout` | Top bar (BandBro logo, section, theme toggle), active-org context, route guards | A1/A2 |

### G. Cross-cutting
- [ ] **G1.** Active-organization (scope) context provider in the frontend, synced to `session.activeOrganizationId`.
- [ ] **G2.** Role-aware UI (hide Edit/Delete/Manage for Readers; show "Suggest" instead).
- [ ] **G3.** Replace placeholder routes/data-dumps; remove the demo `EXAMPLE`/`addNumbers` once real flows exist.
- [ ] **G4.** Tests for the transpose engine (B1) and capo translation (golden cases from PRD §7 worked example).

### Phasing (PRD §13)
- **Phase 1 — Songbook:** A1–A5, A7, B*, C1–C4, C6, F1–F3, F5, F7, F8, F10, F11, G1–G2.
- **Phase 2 — Organize & perform:** C5, D*, E*, F4, F6, F9.
- **Phase 3 — Collaborate:** A6, C7 (suggestions); per-member notes.
- **Phase 4 — Broaden:** public scope, community library, rights/licensing (out of v1).

---

## 8. Open product questions (PRD §12) blocking specific tasks

1. **Role set** Admin/Writer/Reader confirmed? → D6 / A2.
2. **Capo authoring convention** = played shapes + `{capo}` (recommended canonical). → B-/D4.
3. **Instrument preference granularity** simple capo/no-capo (assumed) vs full instrument list. → A3.
4. **PDF layout** header content + default render mode + whose view. → E*.
5. **Offline scope** per-playlist (assumed) vs "all band songs"; read-only (assumed). → D*.
6. **Delete policy** any Writer vs Admin-only. → D6 / C2.

Resolve these as you reach the dependent tasks; defaults above are the recommended answers.
