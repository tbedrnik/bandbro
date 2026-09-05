# BandBro production image.
#
# Bun runs the app; the Perl `chordpro` CLI renders setlist PDFs server-side
# (src/backend/services/songbooksPdf.ts). The PDF endpoint degrades gracefully
# (HTTP 501) if `chordpro` is absent, so the image still boots without it.
#
# We base on Ubuntu because it ships a prebuilt `chordpro` package (universe) —
# `apt-get install chordpro` pulls all the Perl deps with no source compile. (Debian,
# the oven/bun base, has no such package, which is why building ChordPro from CPAN
# there is slow and brittle.) Bun is copied from the official image, so there's no
# bun.sh download at build time.

FROM oven/bun:1 AS bun

FROM ubuntu:rolling
ENV DEBIAN_FRONTEND=noninteractive

# chordpro: prebuilt PDF renderer (Unicode/diacritics out of the box).
# libstdc++6 + ca-certificates: needed by the Bun binary and outbound TLS.
# curl: fetches Prisma's schema engine below.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		chordpro ca-certificates curl libstdc++6 \
	&& rm -rf /var/lib/apt/lists/* \
	&& chordpro --version

# Bun binary from the official image (matches the lockfile's runtime).
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

# Install JS deps. --ignore-scripts skips the Prisma engine postinstall (the
# generated client is committed under src/generated and the libsql adapter needs
# no separate engine binary at runtime).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# Prisma's *schema* engine, which `prisma migrate deploy` needs at container start
# (the query path doesn't — that's the libsql driver adapter). --ignore-scripts above
# means @prisma/engines never downloaded it, so fetch it here: build time has network
# and a pinned result, whereas a boot-time download would make every restart depend on
# binaries.prisma.sh being reachable. The commit is read from the installed
# @prisma/engines-version so it can't drift from the lockfile on a Prisma upgrade.
RUN COMMIT="$(bun -e 'console.log(require("@prisma/engines-version/package.json").prisma.enginesVersion.split(".").pop())')" \
	&& case "$(uname -m)" in \
		aarch64|arm64) TARGET=linux-arm64-openssl-3.0.x ;; \
		*) TARGET=debian-openssl-3.0.x ;; \
	esac \
	&& curl -fsSL "https://binaries.prisma.sh/all_commits/${COMMIT}/${TARGET}/schema-engine.gz" \
		| gunzip > /usr/local/bin/prisma-schema-engine \
	&& chmod +x /usr/local/bin/prisma-schema-engine \
	&& /usr/local/bin/prisma-schema-engine --version
ENV PRISMA_SCHEMA_ENGINE_BINARY=/usr/local/bin/prisma-schema-engine

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Migrations run on start, not in the build: the SQLite file lives on a volume that
# only exists at runtime. Without this the schema silently lagged the code — the band
# invite tables were missing in production for the whole life of that deploy, so every
# /api/bands/:id/invites request 500'd. A failed migration aborts the boot rather than
# serving against the wrong schema; railway.json's healthcheck then fails the deploy
# instead of routing traffic to it.
CMD ["sh", "-c", "bun --bun run prisma migrate deploy && exec bun run src/backend/index.ts"]
