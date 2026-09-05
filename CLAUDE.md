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
  models/bands.prisma    band invite links (BandInvite, BandInviteUse) — see §D13
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
| **Invite** (join a band) | `BandInvite` + `BandInviteUse` (link/QR); legacy `Invitation` (email) | ✅ §D13 |

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

### D7 — Offline PWA: root-scoped service worker + per-setlist snapshot, read-only in v1 *(implemented)*
Live mode must run with no signal, and the *installed* app must open with no signal. It now does. Three
pieces, each of which was individually broken before:
- **Scope.** Bun serves the SPA's content-hashed bundle from the **origin root** (`/chunk-<hash>.js`),
  not from under `/app` — so the original worker, scoped to `/app/`, could never see, let alone cache, the
  two files the app needs to start. The installed PWA cached the shell HTML and then opened to a blank
  page. The worker is now registered at **scope `/`** (`src/frontend/index.tsx`), which the server permits
  with `Service-Worker-Allowed: /` on `/app/sw.js`; the worker itself still ignores `/` (the marketing
  landing) and `/api/*`. Old `/app/`-scoped registrations are unregistered on first load.
- **Precache.** Hashed filenames mean there is no fixed list to precache, so on `install` the worker
  fetches the shell (`/app/`) and reads its `<script>`/`<link>` URLs back out of the markup —
  `extractShellAssets` in `src/shared/shellAssets.ts` (pure + unit-tested; it also normalizes the
  `/../../chunk-x.js` hrefs Bun emits, exactly as the browser does). Document and assets are cached as a
  pair, and every online `/app` navigation refreshes both together, so a rebuild can never leave cached
  HTML pointing at hashes that aren't in the cache. Assets are served **cache-first** (a content hash
  can't go stale); navigations are network-first, falling back to the cached shell for any `/app/*` URL.
  Because the worker imports from `src/shared`, it is **bundled at request time** by `serveSw()` in
  `src/backend/index.ts` (`Bun.build`, cached per process) rather than served as a static file.
- **The auth gate.** `_protected/layout` bounces to `/login` whenever there is no session, and the session
  is a network read — so offline the whole app bounced to a login form that also couldn't reach the server.
  `lib/sessionSnapshot.ts` persists the last known session/user and `__root.tsx` boots from it **when, and
  only when, the session read errored**; an explicit "no session" answer (sign-out, expiry) clears it. The
  snapshot is a **UI affordance, not authorization** — it grants nothing, and every API route still goes
  through the server's `auth` macros and role guards. It also **blanks the session token, IP and user
  agent** on the way in: the real credential is an httpOnly cookie the page can't read, nothing on the
  client reads the token, and copying a bearer credential into localStorage for no gain would be a
  straight security regression. With no signal and no snapshot, the layout sends the player to `/offline`
  instead of `/login`.

**What offline actually gives you.** `/app/offline` (route `src/frontend/routes/offline.tsx`, deliberately
*outside* `_protected`) is the shelf: every downloaded setlist with its title, song count and download age,
each openable straight into Live mode, each removable. The same list surfaces on Home under "Available
offline". Live mode reads the snapshot through `getOfflineSetlist` as react-query `initialData`, treats the
user as optional, and skips the fan-session sync when there's no network — a failed sync degrades silently
and never stalls the chart. "Share with fans" is disabled offline, since the fan view is served, not cached.
`OfflinePill` marks the offline state on Home and on the shelf.

**Store.** `lib/offline.ts` keeps per-setlist payloads in **localStorage** under
`bandbro:offline:setlist:<id>`, plus a `bandbro:offline:meta` index for the listing. Not IndexedDB: a
60-song set of ChordPro text is ~200 KB against a ~5 MB budget, and the reads must be **synchronous**
(Live mode's `initialData`, the setlist screen's `useState` seed). Exported API is unchanged except that
`downloadSetlist` now returns a boolean (a quota failure is reported rather than silently pretending), and
`listOfflineSetlists`/`useOfflineSetlists`/`OfflineSetlistMeta` are new. The listing is driven by the
payload keys, so it self-heals and picks up sets downloaded before the index existed.

**Manifest/install.** `start_url` and `scope` are both `/app/` (they were `/app` and `/app/`, which is not
in scope), and the icons are real committed PNGs served from `src/backend/index.ts` — the inline SVG data
URI is not reliably accepted for Android/Chrome installability. `src/tools/generateIcons.ts` regenerates
them (192/512 plus a 512 maskable with a safe-zone margin); `index.tsx` also adds an `apple-touch-icon`,
which iOS needs because it ignores the manifest's icons.

**Offline, server-backed controls are hidden, not disabled.** A greyed-out button on a stage is noise: it
says "this exists" and then refuses, and half a screen of them reads as breakage. Every control that needs
the server is removed from the DOM when `useOnline()` is false — create/edit/delete/fork/import, the
`chordpro` PDF export, "Share with fans", invites, role changes, the account-level preference write, and the
Library's search box (a server query). A screen whose actions all disappear says why in one line rather than
showing a blank, in the voice Home already uses ("You're offline — the library needs a connection."), and
those screens' queries drop to `retry: false` so the honest message arrives at once instead of after three
retries. `ImportSongButton` hides *itself* so no call site has to remember. Controls that run purely on the
device — transpose, capo view, display prefs, theme, prev/next, the offline search — always stay.

v1 stays **read-only offline** (no edit queue or sync — PRD §12 Q5), scoped per setlist. Note: `lib/push.ts`
(web push) is unrelated to offline and not a v1 must-have — leave it parked.

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
  overrides the CLI defaults that don't suit a setlist: `papersize: a4`; `labels.width: 0` +
  `labels.comment: comment_italic` so section names ("Verse 1", "Riff") sit *above* their section as an
  italic comment instead of in a left margin that eats ~65pt of line width; `songbook.dual-pages: false`,
  since stock chordpro is duplex and starts every song on a right-hand page — which put a **blank filler page
  between most songs**; and `diagrams.show: false` (+ `kbdiagrams`), dropping the chord-shape strip along the
  bottom of each song, which also hands ~60pt of every page back to the chart.
- **Type** (`FONT_SIZE`/`SPACING`/`CHORD_COLOR` in `chordproConfig.ts`). The CLI's 12pt lyrics on 1.2 leading
  are book settings; a chart is read in glances off a stand, so lyrics drop to 11pt on 1.1 and **chords stay
  at 10pt** — they're what a player looks for, and they now sit slightly larger than the lyrics. Chords print
  **dark red** (`#8b1a1a`), the one colour in the document. Together with the reclaimed diagram strip and
  two columns, a 60-song setlist went 91 → 80 pages with **no song spanning a page turn**.
  Spell fonts through a *family* (`sans italic 11`), never a physical corefont name: `Helvetica-Oblique`
  is what the CLI's own default uses, but in a user config it resolves to nothing and the text silently
  comes out upright. `Helvetica-Narrow` is likewise a dead end — the CLI remaps corefonts onto the Free*
  Unicode faces (which is what renders Czech diacritics), and it lands on plain Arial, no narrower at all.
- **Capo** is appended to the printed song title ("Sen (capo 4)") via `formats.title.title`, expanded from
  the song's own `{capo}` — so concert copies, which have had that directive stripped, correctly show none.
  The tables of contents interpolate `%{title}` directly and so stay free of it.
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
- **Only chords are mapped — `isChord` (notation.ts) is the gate.** Brackets also hold section markers
  (`[Bridge]`, `[Chorus]`) and notes to the player (`[Repeat this]`), and a note letter is an ordinary first
  letter of an English word. `isChord` matches a root (`A`–`H` + `#`/`b`) followed by a **closed** suffix
  alphabet (`m`/`mi`/`maj`/`sus`/`add`/`dim`/digits/…), so anything else is copied through byte-for-byte by
  `displayChord`/`internationalChord`, by `mapChordproChords` and by **`transposeChord`** (§D5 — same defect:
  the render path transposes every parsed segment, so `[Bridge]` used to become `[C#ridge]`, and a bake down a
  semitone wrote `[Bhorus]` into the DB). Chord *lists* in one bracket (`[Em, G#, Eb, Bb]`) are not chords
  either — no single root to map — so they are left alone rather than half-rewritten.
  `src/tools/repairSectionMarkers.ts` (`bun run repair:markers [--write]`) is the one-off repair for rows
  already damaged; it restores the shifted first letter from a dictionary of section words and reports, never
  guesses, the rest.
- The server-side PDF (`chordpro` CLI, §D8) renders raw source and stays international.
- Every entry point takes a `NoteConvention` argument (defaulting to `european`), so the per-user preference
  (a sibling of `defaultChordView`, §D2) is a matter of threading it down — deliberately not built yet.

### D12 — Live mode display prefs: per-device, with a measured fit-to-screen *(implemented)*
Live mode gets the fan view's kind of view controls — text size, line spacing, 1/2/3 columns, fit-to-screen and a
theme toggle — in a `DisplaySettings` panel above the control bar (`components/DisplaySettings.tsx`). These describe
a player's *physical setup* (an iPad on a stand vs. a phone on a mic clip), not the song, so they're stored per
device in localStorage (`lib/liveDisplay.ts`) and never broadcast to fans or bandmates.
- **`<ChordSheet>` gained `gap` and `columns`.** `gap` scales every vertical gap; `columns` lays the sheet out in
  CSS multicol with `break-inside: avoid` on each section, so a long song divides its height instead of scrolling
  (3 columns is a landscape-tablet setting; tabs still scroll if a staff is wider than a column).
- **Lines wrap only at word boundaries** (`wordGroups`). A segment is a run of lyrics under one chord, which matches
  neither end of a word — ChordPro puts chords mid-word (`My shallow h[Em]eart's`) and then runs several words to the
  next one — so with one flex item per segment a narrow column printed "My shallow h / eart's" and refused to break
  inside the long run after it. Each segment is now split at its internal spaces and the pieces whose boundary isn't
  whitespace are glued back into one flex item. A chord wider than its own word keeps overhanging the words after it
  (`width: 0` when the next part carries no chord), as it did when the whole run was one span.
- **The vertical rhythm is now proportional to `lyricSize`** rather than absolute px — the ratios reproduce the
  design's 34/12/9/6 exactly at the default 21px lyric (Song View, editor preview and print are unchanged), and the
  section label scales with it too. This is load-bearing for fit-to-screen: with fixed gaps, a song with a dozen
  sections carries hundreds of px that never shrink, and the fit bottoms out long before the song fits.
- **Fit-to-screen** (`lib/useFitScale.ts`) binary-searches the largest text scale whose content still fits the
  scroll container. Height isn't a smooth function of font size (text reflows), so there's no closed form: each
  candidate is committed as state and measured in a **layout** effect, which React re-runs before paint — the whole
  search resolves inside one frame, so the intermediate sizes are never visible. `resetKey` (song, gap, columns,
  view, transpose) restarts it; a `ResizeObserver` covers rotation and split view. `FIT_MIN` is a **legibility**
  floor, not a fitting one — a song with several tab staves won't fit an iPad at any readable size, and it's better
  to let that one scroll than to shrink it to 8px.
- The Live song title + key **scroll with the chart** instead of holding a permanent row across the top; the setlist
  name and position live in the top bar already.

### D13 — Joining a band is a link, not an email *(implemented)*
This deployment has no mail transport, so better-auth's `inviteMember({email})` flow delivered nothing —
the Bands screen's invite box was dead UI. A band is now joined by following an unguessable **invite
link**: an admin holds up its QR at rehearsal, or pastes the URL (or reads out the code) over whatever
channel the band already uses.
- **Model** (`prisma/models/bands.prisma`). `BandInvite` (unique `code`, organization, granted `role`,
  `createdBy`, nullable `expiresAt`/`maxUses` = never/unlimited, `revokedAt`) + `BandInviteUse`
  (`@@unique([inviteId, userId])`) — the use rows are what make "who joined through this link?"
  answerable, and what stops a single-use link being spent twice by the same person re-opening it.
  The back-relations on `Organization`/`User` are hand-added to the otherwise generated `auth.prisma`.
- **Code** (`src/shared/bandInvite.ts`, unit-tested). Same unambiguous alphabet as the stage code
  (§D10) but **10 characters ≈ 50 bits**: a fan code only unlocks a read-only view of one gig, whereas
  an invite link is a bearer credential to a band's songbook. Validity (`inviteStatus` → active /
  revoked / expired / exhausted) is a pure function, so the redeem guard and the admin list's labels
  can't disagree; revoked deliberately outranks expired.
- **API** (`services/bandInvites.ts`, group `/bands`). Admin-only create/list/revoke plus a cancel for
  legacy email `Invitation` rows; `GET /bands/join/:code` is **public/no-auth** so the join page can
  say "Join The Wildcards as Writer" *before* asking anyone to sign in, and `POST /bands/join/:code`
  redeems (adds the `Member` row + a use, idempotent for an existing member, `410` for a dead link).
  The preview deliberately returns only band name + role + status — the caller holds nothing but a code.
- **Frontend.** `/app/join/$code` (+ `/app/join` for typing a code) sits outside `_protected`/`_auth`,
  like the fan routes. A visitor without a session is sent to login/register with a **`redirect` search
  param** (validated on the `_auth` layout, guarded by `safeRedirect` against off-site targets) and comes
  back to the join button; the protected-route guard passes the same param, so any bounced destination
  now survives the login. The Bands screen mints links (role · expiry · single/multi-use) and lists the
  outstanding ones with their joiners and a Revoke; legacy pending email invitations are shown, marked
  undeliverable, with Cancel only — nothing creates new ones.

### D14 — Setlist order is dragged; "where I left off" is per-device *(implemented)*
Reordering a set with up/down arrows is a click per position — wrong for the one screen a player edits
minutes before a gig. The setlist detail view now uses **dnd-kit** (`@dnd-kit/core` + `/sortable` +
`/modifiers`), the maintained standard for React drag-and-drop, with a grip handle on the left of each row.
- Listeners are bound to the **grip alone**, not the row, so the song title stays a link and a touch
  anywhere else still scrolls the page. `touch-none` on the grip is what makes a finger drag work at all —
  without it the browser claims the gesture for scrolling and the row never moves.
- The pointer sensor arms after 4px so a tap on the handle is still a tap; the keyboard sensor
  (`sortableKeyboardCoordinates`) keeps the same reorder reachable without a mouse. Drags are restricted
  to the vertical axis and to the list.
- The new order is applied **optimistically** — otherwise the dragged row snaps back for the length of the
  PUT + refetch — and dropped again as soon as the server's own order changes or the mutation fails.

**Offline the setlist screen drops the drag entirely.** Reordering is a PUT, so with no signal there is
nothing to drag *to*; rather than leave dead handles, the offline render has no `DndContext` at all and the
rows are plain rows (`SongRow` is presentational, wrapped by a `SortableSongRow` only when online — hooks
can't be conditional). Each row's remove ✕ becomes a **play** link into `/live/$id?song=N`, reusing §D15's
jump-to-song param, which turns the set into a skip-ahead list — the thing you actually want from this
screen at a gig. The screen itself is snapshot-backed like Live mode (`getOfflineSetlist` as `initialData`
+ `retry: false`); before that it sat on "Loading…" forever offline, and a set that isn't on the device now
fails fast into an honest panel pointing at `/offline`.

Per-device UI state generally lives in localStorage, next to the theme (`lib/theme.ts`) and the Live
display prefs (§D12): the Library's scope selection is now remembered the same way
(`useRememberedScope` in `lib/scopes.ts`), so coming back lands on the band you were browsing instead of
resetting to Curated. Deliberately **not** in the URL — it's "where I left off", not a shareable address —
and dropped once the org list confirms the user can no longer browse it (left the band, different account).

### D15 — Offline Live-mode sync: no peer channel in v1; local search instead *(implemented)*
Full analysis in [`docs/offline-live-sync.md`](docs/offline-live-sync.md). This is **band-internal** sync —
one player taps next, the others' Live mode follows — not the fan feature, though both ride the same
server-mediated mechanism (§D10), which is exactly why it dies with no internet.
- **Bluetooth is not reachable from a web app.** Web Bluetooth implements the GATT *central* role only, so
  two browsers can never see each other, and it is absent from Safari entirely. A platform limit, not an
  engineering one.
- **A shared network is necessary but not sufficient.** Bands are typically already on a local WiFi network
  for the mixer, so the devices *can* address each other — but a web page cannot open a listening socket,
  so with only phones on that network there is no server and no rendezvous point.
- **What would work:** run this single Bun process on a laptop joined to that network and everything works
  unchanged. Packaging it as a one-command "host tonight's gig" (start, print the LAN URL + a QR) is the
  right next step, deliberately not built on spec. WebRTC peers connect on a LAN with no ICE servers, but
  signalling has to go out of band — QR offer/answer, two scans per bandmate, plus a QR *decoder* we don't
  ship — so it stays a designed option.
- **What ships instead: local search** (`src/shared/songSearch.ts`, pure + unit-tested; UI on `/app/offline`).
  Titles, artists **and lyrics** across every downloaded set, with no signal, and a hit opens Live mode at
  that song (`/app/live/$id?song=N`). Two details make it work on real charts: lyrics are recovered through
  the shared ChordPro parser, so a phrase matches across a chord written mid-word (`A[G]mazing grace`) where
  a substring search over the source finds nothing; and both query and text are folded to unaccented
  lowercase, so `sen` finds `Šeň`. The fold keeps an index map back to the source, so a lyric snippet is cut
  from the original and keeps its diacritics. The corpus is built on demand from the stored payloads rather
  than kept as a second index — one source of truth can't go stale.


### D16 — Mobile chrome: a peek bar + drawer in Live mode, a sheet for the nav *(implemented)*
Both surfaces broke on a phone in the same way — a single flex row of controls that overflowed. Measured at
390px, Live mode's control row stretched the layout viewport to **642px**, pushing Next, the auto-scroll
controls and the display button off-screen and cutting off the chart itself. The fix in both places reuses
the pattern the fan view already performs (§D10): a persistent peek bar over a `vaul` bottom drawer
(`components/ui/drawer.tsx`). One interaction vocabulary, no new dependency.
- **Live mode** splits its controls by *when* a player touches them. **Mid-song** ones stay on the peek row
  within thumb reach: prev/next, auto-scroll on/off, and the jump-to-song. **Between-song** settings go in
  the drawer: capo/concert, transpose, scroll speed, the `DisplaySettings` panel and sharing. That split is
  what keeps the row inside 390px. From `lg` up, capo + transpose are mirrored inline so a tablet or desktop
  loses nothing. The top bar thinned to status · setlist · exit, which is what stopped "Share with fans"
  wrapping onto two lines.
- **The drawer's second tab is the setlist** — the current set in order, current song marked, each row
  tapping to it, with a search box over `searchSongs` (§D15) matching titles, artists *and* lyrics. It is
  built from the payload Live mode already holds, so it works from a downloaded snapshot, and tapping a row
  moves the index rather than navigating, so transpose, scroll position and auto-scroll all survive. Pure
  half in `lib/liveSetlist.ts` (unit-tested); UI in `components/LiveSetlistPanel.tsx`.
- **`AppNav`** keeps its desktop row unchanged and, below `md`, moves the sections into the same kind of
  bottom sheet behind a hamburger; the wordmark and theme toggle stay in the bar at every width, and the
  active section shows both as the bar's label and as the sheet's highlighted row. Two latent bugs surfaced
  while there: `to="/"` lacked `activeOptions.exact` so Home read as active everywhere, and the active
  colour never applied at all — `activeProps` and the base class are equal-specificity Tailwind colour
  utilities, so the base won. Link colours now live in `activeProps`/`inactiveProps`, never the base class.
- **Library rows** are a stacked card below `sm` and the five-column table from `sm` up. The fixed grid
  (~652px) sat inside `overflow-hidden`, so on a phone the Key, Capo, Open and Fork columns were silently
  clipped away — invisible *and* untappable, while every overflow check passed.

**Measuring this.** Test at a **fixed** narrow viewport (`newContext({ viewport: { width: 390, … } })`), not
Playwright's `devices["iPhone 13"]`: with `isMobile` emulation Chromium expands the layout viewport to fit
overflowing content, so `scrollWidth === innerWidth` passes at `innerWidth = 454` and the page looks fine
while being broken. Assert `innerWidth === 390` too, or skip the device descriptor.

### D17 — The deploy has to hold a slow request, migrate itself, and prove it booted *(implemented)*
Three separate production failures on Railway, all of them in the gap between "the code works" and
"the deployment works". Diagnosed from `railway logs --http` + `railway status --json`; the service
runs on **2 shared vCPU / 2 GB**, which is what turns each of these from theoretical into daily.

- **`Bun.serve`'s `idleTimeout` defaults to 10 seconds, and a request whose handler is still working
  counts as idle.** The server-side setlist PDF (§D8) takes tens of seconds there — ~3s for 60 songs on
  a dev laptop, several times that on two shared cores. So Bun dropped the socket at 10s, Railway's edge
  read the reset as an upstream failure and **retried the request twice more**, each retry spawning
  another full `chordpro` render, and finally answered **502 after 36s** — while all three renders went
  on to succeed, unread, in the background. That is the whole of "PDF export doesn't work in
  production": the renderer was never broken. `idleTimeout: 255` (Bun's maximum) in
  `src/backend/index.ts` is the fix; the PDF service caps itself well under it so we answer first.
- **Renders are now serialized behind a bounded queue** (`src/backend/concurrencyGate.ts`, unit-tested;
  1 running, 3 waiting, 503 beyond that) with a **120s kill-timeout** on the subprocess. `chordpro` is
  single-threaded Perl and CPU-bound, so concurrent renders starve Bun's event loop and make every
  request on the box look hung — and because a failed export is retried by both the user and the edge
  proxy, the pile-up is the normal case, not the rare one. The gate hands a freed slot *directly* to the
  next waiter rather than decrementing a counter, so a request arriving in between can't jump the queue
  and push `active` over the cap. The service logs `waitedMs`/`renderMs`: a render creeping towards the
  timeout is the early warning that exports are about to start failing again.
- **Migrations never ran on deploy.** The image's `CMD` was just `bun run src/backend/index.ts`, so the
  schema silently lagged the code: §D13's `band_invite`/`band_invite_use` tables did not exist in
  production for the entire life of that deploy and **every `/api/bands/:id/invites` request 500'd**.
  Start now runs `prisma migrate deploy` before `exec`ing the server (migrations can't run at build
  time — the SQLite file is on a volume that only exists at runtime), and a failure aborts the boot
  rather than serving against the wrong schema. That needs Prisma's **schema** engine (the query path
  doesn't — that's the libsql driver adapter), which `bun install --ignore-scripts` never downloaded:
  the Dockerfile fetches it at build time and points `PRISMA_SCHEMA_ENGINE_BINARY` at it, reading the
  commit out of the installed `@prisma/engines-version` so it can't drift from the lockfile. A
  `.dockerignore` was added at the same time so `docker build .` on a laptop reproduces the image
  instead of dropping the host's macOS `node_modules` on top of the Linux ones.
- **`GET /api/health`** (no auth) issues a `SELECT 1` and is wired to `railway.json`'s
  `healthcheckPath`, so a boot that can't reach `/data` — or a migration that fails — fails the deploy
  instead of taking traffic. Be clear about what this does *not* buy: Railway calls the healthcheck
  **only at deploy time** ("Railway does not monitor the healthcheck endpoint after the deployment has
  gone live"), and `restartPolicyType: ON_FAILURE` only reacts to the process *exiting*. Nothing on the
  platform can restart a container that wedges while alive — hence "it froze and needed a rebuild".
  Catching that needs external uptime monitoring or an in-process watchdog; neither is built.

**Still open: the export should be a job, not a request.** Capping the render at 120s under a 255s
socket timeout buys headroom, it doesn't remove the ceiling — a long enough setlist on a slow enough
box still runs out of connection. The right shape is `POST` returns a job id, the client polls, the PDF
lands in storage. Deliberately not built here; this change was scoped to stopping the bleeding.

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
- [x] **D1.** Web app manifest + PNG icons; root-scoped service worker, bundled by `serveSw()`.
- [x] **D2.** App-shell precache (shell HTML + the hashed bundle it names); every `/app/*` navigation falls back to it.
- [x] **D3.** "Download for offline" → per-setlist snapshot in localStorage; `/app/offline` shelf + "Available offline" on Home.
- [x] **D4.** Offline detection → `OfflinePill`; Live mode reads the snapshot with no network; session snapshot lets the installed app boot signed-in.
- [ ] **D5.** Download progress UI, and a size/quota warning for very large setlists.

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
| F7 | **Band Management** | `/app/bands`, `/app/join/$code` | Member list + `RoleBadge`, invite links + QR + outstanding-invite list (§D13), band switcher | A2, C8 |
| F8 | **Preferences** | `/app/preferences` | `CapoToggle` as default-view setting + worked example, theme toggle, account + memberships | A3, C6 |
| F9 | **Home / Dashboard** | `/app` (or `/app/home`) | "Up next" gig + setlist, jump-back-in, recent songs, your bands; Live-mode CTA | C3/C5, C8 |
| F10 | **Auth** | `/app/login`, `/app/register` | better-auth email/password; style to design (Login.dc.html) | — |
| F11 | **App shell / nav** | `_protected/layout` | Top bar (BandBro logo, section, theme toggle) + mobile sheet nav (§D16), active-org context, route guards | A1/A2 |

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
