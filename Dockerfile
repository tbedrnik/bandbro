# BandBro production image.
#
# Bun runs the app; the Perl `chordpro` CLI renders setlist PDFs server-side
# (src/backend/services/songbooksPdf.ts). The PDF endpoint degrades gracefully
# (HTTP 501) if `chordpro` is absent, so the image still boots without it — but
# installing it here is what makes Export PDF work in production.

FROM oven/bun:1-debian

# --- ChordPro CLI (server-side PDF export) ---
# App::Music::ChordPro is pure-Perl for PDF output (PDF::API2); it bundles a few
# XS deps that compile from source, hence build-essential. --notest keeps the
# build tractable. ChordPro 6 renders Unicode (incl. Czech diacritics) by default.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends perl cpanminus build-essential \
	&& cpanm --notest --no-man-pages App::Music::ChordPro \
	&& chordpro --version \
	&& apt-get purge -y build-essential \
	&& apt-get autoremove -y \
	&& rm -rf /var/lib/apt/lists/* /root/.cpanm

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
