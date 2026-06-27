# BandBro — Product Requirements Document (v1)

**Status:** Draft v2 · Product scope (technical design deferred)
**Owner:** Tomas
**Last updated:** 2026-06-27

---

## 1. Summary

BandBro is a shared songbook for bands and players. It lets musicians find songs with lyrics and chords, tweak them to fit how *their* band actually plays a tune, organize them into setlists, and share the whole thing with bandmates so everyone is literally on the same page — including the bassist, who doesn't capo.

The core loop:

**Discover → Fork / Edit → Organize → Share → Perform (online or off)**

v1 ships as an **internal tool for Tomas's band(s)**, with a data model and UX designed so the same mechanics scale to a broader audience and a public community library later.

---

## 2. Problem

Bands juggle songs across screenshots, PDFs, Ultimate Guitar tabs, Google Docs, and group chats. The pain:

- The "official" version online is rarely how the band actually plays it (different key, simplified chords, skipped bridge).
- Edits live in one person's notes and never reach the rest of the band.
- Capo players and non-capo players are reading different realities of the same song.
- Setlists are assembled ad hoc the day of a rehearsal or gig.
- Venue wifi dies right when you need the chart.

BandBro treats a song as a **living, forkable document** a band owns together, renders it correctly **per player**, and keeps it available **offline**.

---

## 3. Goals & Non-Goals (v1)

### Goals
- [ ] A band can build a private, shared library of songs (lyrics + chords in ChordPro).
- [ ] Multiple **roles per band** (read vs write); a user can belong to **many bands**.
- [ ] **Personal scope** ("one-man-band") shippable alongside band scope.
- [ ] Fork any readable song into any writable scope (public→band, public→personal, **personal→band**, band→personal, band→band).
- [ ] Add fully custom songs from scratch.
- [ ] Transpose (key shift) without re-typing chords.
- [ ] **Per-player chord views** — capo'd players and non-capo players see the right chords from one chart.
- [ ] Playlists/setlists with ordering.
- [ ] **Live-play support: Offline PWA** (download a playlist's songs for gigs with no signal).
- [ ] **PDF export** of a playlist in order, rendered from ChordPro.
- [ ] Performance view (large readable text, auto-scroll, transpose, next/prev).

### Non-Goals (v1)
- ❌ Public open registration / large-scale community moderation.
- ❌ Licensing / copyright-takedown tooling (private band use only for now).
- ❌ TAB staves, MIDI, or audio playback.
- ❌ Real-time simultaneous co-editing (live cursors).
- ❌ Billing / monetization.

---

## 4. Target Users

v1 optimizes for **bands**, but the primitives serve everyone:

| Persona | Needs from BandBro | Priority |
|---|---|---|
| **The band** (group) | Shared library, agreed versions, per-player chords, setlists | **Primary** |
| **Solo player / hobbyist** | Personal songbook ("one-man-band"); tweak to their level | In v1 (personal scope) |
| **Teacher & student** | Share a song, annotate, practice list | Future |

A **band is just a shared workspace**. A solo player is a workspace of one (personal scope). Same machinery, different headcount — and since users can belong to many bands, a player in two groups gets two separate shared libraries plus their own personal one.

---

## 5. Core Concepts (the mental model)

The nouns the whole product is built from — worth locking before interface design.

- **Song** — metadata (title, artist, key, tempo, **capo**) + a ChordPro body (lyrics with inline `[C]` chords).
- **Scope** — *where* a song lives and who can touch it:
  - **Public / Curated** — read-only seeded library.
  - **Band (private)** — owned/editable by a band's members (per role).
  - **Personal (private)** — owned by one user.
- **Fork** — copy a readable song into a writable scope. Independent of the original; keeps provenance ("Forked from …").
- **Edit** — change a song in a scope you can write to.
- **Suggestion** — propose an edit to a song you can't write to; owner accepts/rejects. *(Should-have)*
- **Playlist / Setlist** — an ordered collection of songs (can mix scopes).
- **Band (Workspace)** — a group of members sharing a scope. Has **roles**.
- **Role** — a member's permission level within a band (see §9).
- **Member** — a user in a band, with a role and an **instrument/view preference** (drives per-player chord views, §7).

### Relationships (conceptual)

```
User ──member-of (with role)──> Band ──owns──> Songs (band scope)
User ──owns──> Songs (personal scope)
Any readable Song ──fork──> any writable scope (incl. personal → band)
Song <──contains── Playlist (ordered) ──belongs-to──> Band or User
Member ──has──> instrument/view preference (capo vs concert)
```

---

## 6. The Fork Model

The heart of the product. One rule governs it:

> **You can fork any song you can read into any scope you can write to.**

That covers every direction, including the one you flagged: a privately managed (personal) song can be **forked into a band** to share it. The fork is an independent copy; editing it never touches the source. Provenance is retained.

**Walkthrough:** Tomas has a private arrangement of an original tune in his personal scope. The band wants to learn it → **Fork to [band]** → it lands in the band library, editable by writers, untouched in his personal scope.

**Rules:**
- Write requires a writer/admin role in that scope (or it's your personal scope).
- For songs you can't write, you can **suggest** (Should-have).
- No "pull updates from origin" in v1 (a fork is fully independent).

---

## 7. Per-Player Chord Views (capo translation) ⭐

The differentiator. Solves the everyday band problem: the acoustic guitarist capos; the bassist and keys player don't, and currently transpose in their heads mid-song.

**Model — one chart, two truths:**
- A song stores a single chord chart written as **played shapes** + a `{capo: N}` value. (Matches the ChordPro convention you're already using.)
- **As-fingered view** — chart as written. Default for capo players.
- **Concert-pitch view** — chart transposed **up by N semitones**. Default for non-capo players (bass, keys).

**Worked example — Capo 2:**

| Plays | As-fingered (guitarist) | Concert pitch (bassist/keys) |
|---|---|---|
| Chord 1 | C | D |
| Chord 2 | G | A |
| Chord 3 | Am | Bm |
| Chord 4 | F | G |

**How a player lands on the right view:**
- Each member has an instrument / **"I use capo" vs "I don't"** preference → the correct view loads automatically.
- A manual toggle is always available on the song/performance screen.
- Normal **transpose** (key shift) is a separate, independent control layered on top.

This is cheaper to build than it looks: it's `transpose by capo offset`, reusing the same transpose engine ChordPro already needs. (One small authoring convention to confirm — see §12.)

---

## 8. Key User Journeys

Each maps roughly to a screen/flow for the design phase.

- **J1 — Find a song.** Search/browse across scopes (curated + bands + personal); filter by artist, key, tag.
- **J2 — Fork & make it ours.** Open a song → Fork to a scope → edit/transpose → save.
- **J3 — Add a custom song.** New Song → metadata + ChordPro body (side-by-side editor/preview) → save to a scope.
- **J4 — Set my view.** Pick instrument / capo preference → songs render as-fingered or concert automatically.
- **J5 — Build a setlist.** New Playlist → add + reorder songs → name it.
- **J6 — Take it offline.** Download a playlist → its songs are available with no signal.
- **J7 — Rehearse / perform.** Open playlist → Performance view (big text, auto-scroll, transpose, per-player chords, next/prev).
- **J8 — Print it.** Export a playlist to PDF in order (ChordPro-rendered) for a paper setlist.
- **J9 — Manage the band.** Invite members, assign roles; a user can join multiple bands.
- **J10 — Suggest an edit.** *(Should-have)* Propose a change to a song you can't write → owner accepts/rejects.

---

## 9. Roles & Permissions

Proposed three-role model (exact set tunable — see §12):

| Role | Manage band & members | Edit/add/delete songs | Build playlists | Read · transpose · perform · offline · PDF |
|---|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ | ✅ |
| **Writer** | ❌ | ✅ | ✅ | ✅ |
| **Reader** | ❌ | ❌ | ❌ (use only) | ✅ |

### Action matrix by scope

| Action | Curated | Band (as Reader) | Band (as Writer/Admin) | Personal (yours) |
|---|---|---|---|---|
| View / transpose / perform / offline / PDF | ✅ | ✅ | ✅ | ✅ |
| Fork (to a writable scope) | ✅ | ✅ | ✅ | ✅ |
| Edit / add | ❌ | ❌ (suggest) | ✅ | ✅ |
| Delete | ❌ | ❌ | ✅ (Admin/Writer per policy) | ✅ |
| Manage members & roles | ❌ | ❌ | ✅ (Admin) | n/a |

A user can hold **different roles in different bands** simultaneously.

---

## 10. Feature Breakdown (MoSCoW)

### Must have (v1)
- [ ] Auth; user can belong to **multiple bands** + a personal scope.
- [ ] Roles per band (Admin / Writer / Reader) + invites.
- [ ] Curated read-only library (small seeded set).
- [ ] Band + personal libraries (CRUD per role).
- [ ] Fork across any read→write scope (incl. personal→band).
- [ ] ChordPro song editor with side-by-side preview, metadata, tags, **capo**.
- [ ] Transpose (key shift).
- [ ] **Per-player chord views** (capo vs concert) + per-member preference.
- [ ] Playlists/setlists with ordering.
- [ ] **Offline PWA** — download a playlist's songs for offline use.
- [ ] **PDF export** of a playlist (ChordPro-rendered, in order).
- [ ] Performance view (large text, auto-scroll, transpose, per-player view, next/prev).
- [ ] Search & filter across scopes.

### Should have
- [ ] Suggestions / accept-reject for non-writable songs.
- [ ] Paste-import that parses common chord formats into ChordPro.
- [ ] Duplicate detection.
- [ ] Per-member private notes/annotations on a shared song.

### Could have
- [ ] Chord diagram rendering (fingerings; capo-aware).
- [ ] "Forked from" update prompts / sync.
- [ ] Smart lists (tags-as-playlists).

### Won't have (v1)
- ❌ Public sign-up & moderation, TAB notation, audio/MIDI, real-time co-editing, billing.

---

## 11. Content Sourcing & Rights Posture

- **Curated set:** small hand-seeded starter library so the app isn't empty.
- **"Community-contributed"** at v1 scale = bandmates adding songs to a shared library — not public UGC.
- **Rights:** private band use is low-risk; v1 avoids a public lyrics database. **If BandBro ever opens publicly, this is the #1 thing to revisit** (lyrics licensing, chord-transcription gray area, takedowns). Keeping provenance on forks and scopes cleanly separated now avoids painting into a corner later.

---

## 12. Open Questions (remaining)

1. **Role set:** confirm Admin / Writer / Reader — or do you want finer grain (e.g. per-song or per-playlist permissions)?
2. **Capo authoring convention:** standardize on *chart = played shapes + `{capo}` directive* (recommended, ChordPro-native), or also allow authoring in concert pitch? Pick one canonical form to avoid ambiguity.
3. **Instrument preference granularity:** a simple "capo / no-capo" toggle, or a fuller instrument list (guitar, bass, keys, …) that maps to a default view?
4. **PDF layout:** one song per page, or flow continuously? Include capo/key header per song? Whose view does the PDF render — as-fingered, concert, or selectable at export?
5. **Offline scope:** download per-playlist only (proposed), or also "all my band's songs"? Any edit-while-offline (queue + sync) in v1, or read-only offline?
6. **Delete policy in bands:** can any Writer delete, or Admin-only?

---

## 13. Phasing (rough)

- **Phase 1 — Songbook:** auth, multi-band + personal scope, roles/invites, curated + band + personal libraries, ChordPro editor, transpose, **per-player views**, search.
- **Phase 2 — Organize & perform:** playlists, performance view, **offline PWA**, **PDF export**.
- **Phase 3 — Collaborate:** suggestions, notes, refinements.
- **Phase 4 — Broaden (post-internal):** public scope, community library, rights/licensing.

*(Per-player views are in Phase 1 because they're core to how songs render; offline + PDF in Phase 2 as they sit on top of playlists.)*

---

## 14. Hand-off to Design

Screens this PRD implies — a solid starting set for Claude Design:

1. **Library / Browse** — scope switcher (Curated · each Band · Personal), search/filter.
2. **Song detail** — read view, per-player view toggle, transpose, fork/edit/suggest.
3. **ChordPro editor** — side-by-side source/preview, metadata incl. capo.
4. **Playlist / Setlist** — list, reorder, download-offline, export-PDF.
5. **Performance view** — large text, auto-scroll, transpose, per-player chords, next/prev.
6. **Band management** — members, roles, invites; multi-band switcher.
7. **Profile / preferences** — instrument & capo preference (drives default view).

---

*Next step: resolve the §12 questions (mostly small calls), then move to interface design in Claude Design.*
