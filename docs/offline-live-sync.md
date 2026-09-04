# Offline Live-mode sync — what's possible, and what we do

> Answers the question "can the band's Live mode stay in sync with no internet — over
> Bluetooth, or over a phone hotspot?" Short version: **Bluetooth, no. Hotspot, yes —
> but only with a server on that hotspot, or with a manual pairing step the band would
> hate.** What we ship instead is below under *What BandBro does today*.

Related: CLAUDE.md §D7 (offline PWA), §D10 (fan sessions — the existing online sync path).

---

## The problem

Live mode's sync today is server-mediated (§D10): the band's device `POST`s
`currentSongIndex` to `/api/live/:code/current`, and fan devices poll `GET /api/live/:code`.
Every hop goes through the BandBro server. With no internet, there is no server, so there
is no sync — each player's device navigates the set on its own.

The set *content* is already fine offline (a downloaded setlist snapshot, §D7). The only
thing missing is a few bytes of shared state: *which song are we on*.

## Option 1 — Bluetooth: not possible from a web app

Web Bluetooth implements the GATT **central** role only. A page can *connect to* a
Bluetooth peripheral (a heart-rate strap, a MIDI pedal); it cannot *be* one. Peripheral /
advertising APIs were specified but never shipped in a general browser, so two phones both
running BandBro in a browser have no way to see each other over BLE. On top of that, Web
Bluetooth is not available in Safari at all, and iOS forces every browser onto WebKit — so
the platform half the band is on is out regardless.

This is a hard platform limit, not something we can engineer around. It would take a native
app (or a native wrapper around this PWA) to use BLE between devices.

The one Bluetooth-shaped thing that *is* reachable from the web is Web MIDI / Web Bluetooth
MIDI over a real MIDI peripheral — relevant if a band ever wants a footswitch to advance the
set on **one** device, not for syncing devices to each other.

## Option 2 — Hotspot + WebRTC, signalled by QR: possible, but a bad trade

On a shared hotspot, two browsers *can* reach each other directly: an `RTCPeerConnection`
with no ICE servers still gathers host candidates, and a data channel over the local network
needs no internet. What it does need is **signalling** — an offer and an answer have to be
exchanged before the peers can talk, and that exchange is exactly the thing we have no
channel for.

You can do it out of band with QR codes: the leader shows an offer QR, the follower scans it
and shows an answer QR, the leader scans that back. It works, and it is genuinely
server-free. The costs:

- **Two scans per follower, both directions.** A four-piece band is three full handshakes at
  soundcheck, redone whenever a phone locks, drops or reloads.
- **We'd need a QR *decoder*.** The app ships `qrcode-generator` (encode only). Decoding
  means camera access plus either `BarcodeDetector` (not in Safari) or a JS decoder as a new
  dependency.
- **SDP is big.** A gathered offer runs to a couple of kilobytes; it fits a dense QR only
  after compression, and dense QRs scan badly on a dark stage.
- **mDNS candidates.** Chrome hides local IPs behind `.local` mDNS names. Resolution
  normally works on the same LAN, but it is one more thing that fails silently in a venue.

Buildable, but it is a lot of fragile surface and a live pairing ritual, to synchronise an
integer. Not worth it for v1 — recorded here so the option isn't re-litigated from scratch.

## Option 3 — a server on the hotspot: already works, no code needed

BandBro is a single Bun process. Run it on a laptop joined to the same hotspot and point the
band's phones at that laptop's LAN address, and *everything* works offline — sync, the fan
view, PDF export — because from the app's point of view nothing is offline at all.

This is the honest answer for a band that actually needs synchronised Live mode in a venue
with no signal: bring the laptop that's already in the van. It needs no new code, only a
deployment note (and, eventually, a friendlier "host a local gig" packaging).

## Option 4 — the hotspot has internet

Worth stating plainly because it covers most real gigs: a phone hotspot sharing *cellular*
data is not offline. The other devices join it, reach the real server, and the existing
sync path works unchanged. "No wifi at the venue" and "no internet at the venue" are
different problems, and the first one is already solved.

---

## What BandBro does today

1. **Content works offline.** A downloaded setlist plays in Live mode with the network off
   (§D7) — that's the part that actually matters when the signal drops mid-set.
2. **Sync degrades quietly.** Failing `syncCurrent` pushes and fan-session polls never break
   the set on stage; the band keeps playing, and the fan view resumes following as soon as
   the connection is back.
3. **No peer-to-peer sync.** Offline, each device is independently navigable. In practice
   this is what a band with paper charts does anyway, and it is *safer* than a
   half-connected sync that silently strands one player on the wrong song.

If synchronised offline Live mode becomes a real requirement, the ranked answer is
**Option 3** (server on the hotspot), then **Option 2** (WebRTC + QR) as a genuine
peer-to-peer fallback, and never Option 1 without going native.
