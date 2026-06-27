# BandBro — Claude Design Brief Pack

**How to use this:** paste the **Intro brief** first and settle on a visual direction. Then work down the screens *in order* — each block is self-contained, so paste one at a time. Build the **Song view** first; it's the atomic component every other screen reuses.

**Device model (important):** BandBro is two experiences in one product.
- **Desktop-first** for everything you *manage and author*: library, song editing, playlists, band admin, preferences.
- **Mobile / tablet-first** for **Live mode** only — the screen propped on a music stand, often offline, sometimes used mid-song.

Design desktop layouts for all screens except Live mode, which is phone/tablet-first.

---

## 0 · Intro brief (paste first)

```
I'm designing BandBro, a shared songbook for bands and players.

What it does: find songs with lyrics + chords (stored in ChordPro format), fork
them into a band or personal library, edit and transpose them, organize them into
setlists, and share them with bandmates.

It's two experiences in one product:
- A DESKTOP app for managing and authoring: browsing the library, editing songs,
  building playlists, managing the band. Design these desktop-first.
- A MOBILE/TABLET "Live mode" for performance: a phone or tablet on a music stand,
  often offline, sometimes used mid-song. Design this one phone/tablet-first with
  large, high-contrast, readable-across-a-room type.

The atomic unit of the whole app is a "song page": lyrics with chord symbols sitting
above the words (like a chord sheet). Every screen is built around showing or editing
this. Get it looking right once, then reuse it everywhere.

Before we draw any screens, propose 2–3 visual directions for the overall system:
color palette, typography (must stay readable at a distance for Live mode), spacing,
and especially how a song page / chord sheet should look. Once we pick one, we'll
design screen by screen starting with the song view.

Tone: a tool made BY a band, not a generic SaaS dashboard. Warm and confident, not
corporate. Think "well-made instrument," not "enterprise admin panel."
```

---

## 1 · Song view (build this first)

> The atomic component. Everything else reuses it.

```
Design the Song View — the read-only screen for a single song. DESKTOP-first.

This is the core component of the whole app, so make it excellent and reusable.

Contents:
- Header: title, artist, key, tempo, capo, tags.
- Body: a chord sheet — lyrics with chord symbols positioned above the words.
  Chords and lyrics must align cleanly; chords visually distinct from lyrics.
- Section labels (Verse, Chorus, Bridge) clearly marked.

Controls on this screen:
- Transpose up / down (changes the displayed key).
- A capo/no-capo view toggle (explained in a later brief — leave a clear spot for it).
- Actions: Fork (copy into a writable library), Edit, and Suggest (for songs the
  user can't edit directly).

Make the chord sheet the hero. Clean typographic rhythm, comfortable line height,
nothing competing with the chords-over-lyrics layout.
```

---

## 2 · ChordPro editor

> Wraps the Song view as a live preview.

```
Design the ChordPro Editor. DESKTOP-first.

Layout: side-by-side. Left = a plain-text ChordPro source editor. Right = a live
preview that is exactly the Song View component from before (so edits render instantly
as a real chord sheet).

ChordPro basics to reflect: chords are written inline in brackets like [C] [G] [Am]
directly before the syllable they fall on; directives like {title:}, {capo: 2},
{key:} and section markers like {start_of_chorus} configure the song.

Above or beside the editor: metadata fields (title, artist, key, tempo, capo, tags)
and a Save control with a scope selector (which library this saves to: a band, or
personal).

Keep the two panes balanced and the preview faithful — this is where songwriters
will spend real time.
```

---

## 3 · Per-player capo views (behavior on the Song view)

> The signature feature. Paste this so Design treats the toggle as a real transform, not decoration.

```
Add the "per-player chord view" behavior to the Song View and Live mode.

The problem it solves: a guitarist plays with a capo and reads the chord SHAPES they
finger; the bassist and keys player don't use a capo and need the chords that actually
SOUND. Right now they transpose in their heads mid-song.

Model — one chart, two views:
- A song stores one chord chart written as the played shapes, plus a capo value
  (e.g. capo 2).
- "As-fingered" view = chart as written. Default for capo players.
- "Concert pitch" view = chart transposed UP by the capo amount. Default for non-capo
  players (bass, keys).

Worked example, Capo 2:
  As-fingered (guitarist):  C   G   Am   F
  Concert pitch (bass/keys): D   A   Bm   G

UI: a clear, prominent capo / no-capo toggle on the Song View and in Live mode. Each
member also has a default (set in preferences), so the right view loads automatically,
but the toggle is always one tap away. Show the active capo value somewhere visible so
players know a translation is happening.

This is the product's standout feature — make the toggle feel like a first-class,
recognizable control, the same everywhere it appears.
```

---

## 4 · Live mode (the device flip — phone/tablet)

> Only mobile/tablet-first screen in the app.

```
Design Live mode — the performance screen. PHONE / TABLET-first. This is the only
mobile-first part of the app.

Context: the device is on a music stand, possibly far from the player's eyes, often
OFFLINE (the current playlist has been downloaded), sometimes operated mid-song with
one hand or a foot pedal.

Requirements:
- Large, high-contrast, readable-across-a-room type. Minimal chrome.
- Auto-scroll (with adjustable speed) and clear next/previous song controls
  (big tap targets; swipe to advance).
- Transpose and the capo/no-capo toggle accessible without leaving the song.
- The current chord sheet is the hero — strip away everything non-essential.
- Reuse the Song View chord-sheet layout, scaled up and decluttered for stage use.
- An offline indicator so the player knows the setlist is available without signal.

Optimize for glanceability and zero fumbling. Think stage, not desk.
```

---

## 5 · Library / Browse

```
Design the Library / Browse screen. DESKTOP-first.

Purpose: find songs across scopes. A scope switcher lets the user view: the curated
read-only library, each band they belong to, and their personal library. (A user can
belong to multiple bands plus a personal "one-man-band" scope.)

Elements:
- Scope switcher (Curated · Band A · Band B · Personal).
- Search + filters (artist, key, tag).
- Results as a scannable list/grid of songs showing title, artist, key, capo.
- Per-song quick actions: open, and Fork (copy into a writable scope, e.g. personal → a
  band, or curated → your band). Forking keeps a "forked from" note.

Make scanning a large library fast and switching scopes obvious.
```

---

## 6 · Playlist / Setlist

> Carries the offline-download and PDF-export controls.

```
Design the Playlist / Setlist screen. DESKTOP-first.

Purpose: assemble an ordered list of songs for a rehearsal or gig (songs can come from
any scope).

Elements:
- Ordered list of songs with drag-to-reorder.
- Add-song flow (search across scopes).
- Playlist name + simple metadata (e.g. "Friday gig @ The Anchor").
- Two prominent output actions for live use:
  1. Download for offline — makes this playlist available in Live mode with no signal
     (read-only offline).
  2. Export PDF — renders the playlist in order as a printable chord-sheet PDF. The
     export offers a render mode: as-fingered, concert pitch, or BOTH. Under "both," a
     capo'd song prints on two consecutive pages (as-fingered, then concert); a song
     with no capo prints once. One song per page, each page with a capo/key header.

Keep reordering effortless and the two output actions easy to find.
```

---

## 7 · Band management

```
Design the Band Management screen. DESKTOP-first.

Purpose: manage a band (workspace) and its members.

Elements:
- Member list with roles: Admin (manages band + members + songs), Writer (edit/add/
  delete songs, build playlists), Reader (read, transpose, perform, offline, PDF — no
  editing).
- Invite members (by link or email) and assign/change roles.
- A way to switch between bands, since a user can belong to several, and may hold a
  different role in each.

Clear, low-friction member and role management. Not an enterprise admin console —
keep it light.
```

---

## 8 · Profile / preferences

```
Design the Profile / Preferences screen. DESKTOP-first.

Keep it simple. The one preference that matters most: a default capo / no-capo setting
that controls which chord view loads by default across the app (as-fingered vs concert
pitch). Reuse the same capo/no-capo toggle styling used on the Song View and in Live
mode so it reads as one consistent concept.

Include basic account basics (name, email, band memberships) but keep the screen focused.
```

---

## Build-order recap

1. **Song view** — the atomic component.
2. **ChordPro editor** — wraps the song view as preview.
3. **Capo views** — the signature behavior, layered on the song view.
4. **Live mode** — the device flip to phone/tablet.
5. **Library** → 6. **Playlist** → 7. **Band management** → 8. **Preferences**.

The capo/no-capo toggle appears in three places (song view, Live mode, preferences) —
ask Design to make it the *same* recognizable control each time so it reads as one idea.
