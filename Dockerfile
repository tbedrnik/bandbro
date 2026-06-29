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
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		chordpro ca-certificates libstdc++6 \
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

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "src/backend/index.ts"]
