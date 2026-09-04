# Offline Live-mode sync — what's possible, and what we do

> "Can the band stay in sync in Live mode with no internet — over Bluetooth, or over the
> hotspot we're already on?" Short version: **Bluetooth, no — that one is a hard platform
> limit.** **Same network, yes, but only with something on it that can listen**, which a
> browser cannot be. Since the band is already on a shared network for the mixer, the
> cheapest real answer is to put the BandBro process on that network. Until then, what
> ships is a genuinely usable offline experience: downloaded sets plus **local search**
> over their titles, artists and lyrics.

Related: CLAUDE.md §D7 (offline PWA), §D10 (fan sessions), §D15 (this decision).

---

## The problem, stated correctly

This is **band-internal** sync, not the fan feature. One player taps *next* and everyone
else's Live mode follows. The fan session (§D10) happens to use the same mechanism, but
the requirement here is the four people on stage.

That mechanism is server-mediated: the leading device `POST`s `currentSongIndex` to
`/api/live/:code/current`, and the others poll `GET /api/live/:code`. Every hop goes
through the BandBro server. No internet, no server, no sync.

The set *content* is already fine offline (§D7). The missing piece is a few bytes of
shared state: *which song are we on*.

## The band's actual setup

The band already connects every device to a **local WiFi network for the mixer**. That
matters, and it removes a real obstacle: nobody has to be talked into pairing anything,
and the devices can already address each other.

It does not, however, remove the obstacle that matters most. A shared network gets
packets from A to B; it does not give you something to send them *to*. A web page cannot
open a listening socket, so with only phones and tablets on that network there is no
server and no rendezvous point — the network is necessary, not sufficient.

## Option 1 — Bluetooth: not reachable from a web app

Web Bluetooth implements the GATT **central** role only. A page can *connect to* a
Bluetooth peripheral (a heart-rate strap, a MIDI pedal); it cannot *be* one. Peripheral
and advertising APIs were specified but never shipped in a general browser, so two phones
both running BandBro in a browser have no way to see each other over BLE. And Web
Bluetooth is absent from Safari entirely — iOS forces every browser onto WebKit, so the
platform half the band is on is out regardless.

This is a hard platform limit. It would take a native app (or a native wrapper around
this PWA) to use BLE between devices.

## Option 2 — the server on the band's own network: works today, no code

BandBro is a single Bun process. Run it on a laptop joined to the mixer network and point
the phones at that laptop's LAN address, and **everything** works — sync, the fan view,
PDF export — because from the app's point of view nothing is offline at all. The band
already has the network; this just gives it something to talk to.

The honest caveat: this is a developer setup, not a band setup. It wants a laptop, Bun,
the repo and a database on site. Packaging it as a one-command "host tonight's gig" —
start the server, print the LAN URL and a QR for the others to scan — is a small, obvious
piece of work and the right next step if offline sync is a real requirement. It is
deliberately **not** built yet: it should be built because the band will use it, not on
the assumption that they will.

## Option 3 — hotspot + WebRTC, signalled by QR: possible, poor trade

Two browsers on the same network *can* reach each other directly: an `RTCPeerConnection`
with no ICE servers still gathers host candidates, and a data channel over the local
network needs no internet. What it needs is **signalling** — an offer and an answer have
to be exchanged before the peers can talk, and that exchange is precisely the thing there
is no channel for.

It can be done out of band with QR codes: the leader shows an offer QR, the follower
scans it and shows an answer QR, the leader scans that back. Server-free and real. The
costs:

- **Two scans per follower, both directions.** A four-piece is three full handshakes at
  soundcheck, redone whenever a phone locks, drops or reloads.
- **We'd need a QR *decoder*.** The app ships `qrcode-generator` (encode only). Decoding
  means camera access plus either `BarcodeDetector` (not in Safari) or a JS decoder as a
  new dependency.
- **SDP is big.** A gathered offer runs to a couple of kilobytes; it fits a dense QR only
  after compression, and dense QRs scan badly on a dark stage.
- **mDNS candidates.** Chrome hides local IPs behind `.local` mDNS names. Resolution
  normally works on the same LAN, but it is one more thing that fails silently in a venue.

Buildable, and a genuine peer-to-peer answer — but it is a lot of fragile surface and a
live pairing ritual to synchronise an integer, when Option 2 gets the same result with a
laptop already in the van. Recorded so it isn't re-derived from scratch.

## Option 4 — the network has internet

Worth stating plainly: a hotspot sharing *cellular* data is not offline. Devices on it
reach the real server and the existing sync path works unchanged. "No wifi at the venue"
and "no internet at the venue" are different problems, and the first is already solved.

---

## What BandBro does today

1. **Content works offline.** A downloaded setlist plays in Live mode with the network off
   (§D7) — the part that actually matters when the signal drops mid-set.
2. **Local search** (`src/shared/songSearch.ts`, `/app/offline`). Every downloaded set is
   searchable by title, artist **and lyrics**, with no signal, and a hit opens Live mode at
   that exact song (`/app/live/$id?song=N`). Two details make it work on real charts: the
   lyrics are recovered through the shared ChordPro parser, so a phrase still matches
   across a chord written mid-word (`A[G]mazing grace`), and both query and text are folded
   to unaccented lowercase, so `sen` finds `Šeň`. This is the answer to "someone shouts a
   title and we need it now" without the leader having to drive everyone's device.
3. **Sync degrades quietly.** Failed `syncCurrent` pushes and fan polls never break the set
   on stage; following resumes when the connection returns.
4. **No peer-to-peer sync.** Offline, each device navigates independently — which is what a
   band with paper charts does, and safer than a half-connected sync that silently strands
   one player on the wrong song.

If synchronised offline Live mode becomes a firm requirement, the ranked answer is
**Option 2** (package "host tonight's gig" — the band already has the network), then
**Option 3** (WebRTC + QR) as a true peer-to-peer fallback, and never Option 1 without
going native.
