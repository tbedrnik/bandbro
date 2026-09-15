# Backup & restore

> **Status: nothing is backed up.** This is a runbook, not a description of a running
> system. It exists because the audit that produced §D27 found no backup of any kind in
> the repo or the deployment, and that is the only failure in the whole app that cannot
> be undone afterwards. Pick one of the options below and do it; everything else in
> BandBro is recoverable by redeploying.

## What is at risk

| Path | What it is | Losing it means |
|---|---|---|
| `$DATABASE_URL` (Railway: a file on the `/data` volume) | **Everything.** Every band, member, song, chart, setlist, lineup, proficiency mark, invite and session. | Total, unrecoverable loss. There is no second copy anywhere. |
| `/data/exports/*.pdf` | Rendered setlist PDFs (§D20) | Nothing — they are derived, swept after 24h, and re-render on demand. |
| The repo | Code, migrations, seed | Nothing — it is on GitHub. |

So there is exactly one thing to back up, and it is a single SQLite file.

## Why the risk is sharper than "we have one database"

- **The container runs `prisma migrate deploy` on every boot** (§D17). Migrations are
  tested, but a migration is still the one routine operation that rewrites the whole
  file, and it runs unattended on a restart nobody watched.
- **There is no replica and there cannot be one.** A Railway volume attaches to exactly
  one service and replicas cannot be used with volumes (§D20), so the app is
  single-instance by construction. Nothing else holds a copy of a single row.
- **The volume is the only durable thing in the deployment.** The image is rebuilt from
  the repo on every deploy; the volume is not.

## Options, in the order I would pick them

### 1. Litestream (continuous, ~seconds of exposure)

Streams the SQLite WAL to S3-compatible object storage (AWS S3, Backblaze B2, Cloudflare
R2) as it is written, and restores with one command. It runs as a second process in the
*same* container, which matters here: the volume constraint above forbids a second
Railway service.

Shape of the change, if you want me to build it:

- Add the Litestream binary to the `Dockerfile` (same pattern as the Prisma schema
  engine: fetched at build time, pinned, verified with `--version`).
- A `litestream.yml` pointing at `$DATABASE_URL`'s file and a `replicas:` block reading
  its bucket and credentials from the environment.
- Change the start command to `litestream replicate -exec "<current CMD>"`, so the
  replication lives exactly as long as the app.
- **Gate it on the environment, the way §D21 gates push.** With `LITESTREAM_*` unset the
  container starts exactly as it does today and says backups are off — a fresh clone and
  a preview deploy must not need a bucket to boot.

Restore:

```bash
litestream restore -config litestream.yml /data/production.db
```

Run it against an *empty* path; Litestream refuses to overwrite an existing database,
which is the behaviour you want at 2am.

### 2. A nightly `sqlite3 .backup` to object storage (coarse, simple)

A scheduled job that runs `.backup` (consistent against a live database, unlike `cp`)
and uploads the result. Costs up to 24 hours of data on a bad day — for a band's
songbook that is usually survivable and it is enormously better than nothing. No new
binary supervision, no sidecar.

Restore: download the file and put it where `DATABASE_URL` points, with the app stopped.

### 3. Railway volume snapshots (whatever the platform offers)

Check the current Railway plan for volume backups/snapshots and turn them on. Zero code.
Verify the retention and, more importantly, **actually perform one restore** — an
untested backup is a belief, not a backup.

## Whichever you pick

- **Test the restore once, on purpose.** Restore into a scratch environment, boot the app
  against it, and open a setlist. Do this before you need it.
- **Keep the backup off the same disk.** A volume snapshot stored on the volume is not a
  backup of the volume.
- **Watch that it is still happening.** A backup that silently stopped three months ago
  is the usual way this goes wrong.

## Related: uptime monitoring

§D17 and §D27 cover the other half of "the deployment is fine". The app now exits on
sustained database failure (`src/backend/watchdog.ts`) so Railway's restart policy has
something to react to, but **nothing external watches the service**. Railway calls
`healthcheckPath` only at deploy time. Point any external uptime checker (UptimeRobot,
Better Stack, Healthchecks.io — all have free tiers) at:

```
https://<your-domain>/api/health
```

It is unauthenticated, issues a real `SELECT 1`, and answers `{"ok":true}`. Five minutes
of setup, and it is the only thing that will tell you the site is down before a bandmate
does.
