import { prisma } from "@backend/prisma";
import { CreditRole } from "../../generated/prisma/enums";
import { parseChordproMeta } from "../../shared/chordpro";
import {
	findOrCreateArtist,
	findOrCreateTags,
	HttpError,
	requireWrite,
} from "./scope";

export type SongUpdatePayload = {
	name?: string;
	year?: number | null;
	tags?: string[];
	credits?: { artist: { name: string }; role: CreditRole }[];
	chart?: { id?: string; content: string; description?: string };
};

export async function songsUpdate({
	slug,
	userId,
	payload,
}: {
	slug: string;
	userId: string;
	payload: SongUpdatePayload;
}) {
	// Every chart of this song, not just the oldest: the chart being written is resolved
	// from this list, which is what keeps `payload.chart.id` from naming somebody else's.
	const song = await prisma.song.findUnique({
		where: { slug },
		include: { charts: { orderBy: { createdAt: "asc" } } },
	});
	if (!song) throw new HttpError(404, "Song not found.");
	await requireWrite(userId, song.organizationId);

	const meta = payload.chart
		? parseChordproMeta(payload.chart.content)
		: undefined;

	if (payload.chart && meta) {
		// Resolve the chart *through the song*. `requireWrite` above authorizes the song's
		// band, so an id looked up any other way would be unauthorized: `chart.update` on a
		// caller-supplied id let anyone with a personal band (i.e. everyone — see
		// auth.ts's signup hook) overwrite any chart whose id they could read, and
		// `GET /songs` hands every Curated chart id to every signed-in user. Curated charts
		// are *referenced* rather than copied by setlists in every band precisely because
		// they are read-only and "cannot drift" (see `foreignChartIds`), so that was a
		// cross-band write dressed up as an edit of your own song.
		const chart = payload.chart.id
			? song.charts.find((c) => c.id === payload.chart?.id)
			: song.charts[0];
		if (!chart) {
			throw new HttpError(404, "That arrangement isn't part of this song.");
		}
		await prisma.chart.update({
			where: { id: chart.id },
			data: {
				content: payload.chart.content,
				description: payload.chart.description,
				key: meta.key,
				capo: meta.capo,
				tempo: meta.tempo,
				timeSignature: meta.timeSignature,
			},
		});
	}

	// Tags, credits and year all fall back to the ChordPro directives, the same way
	// `songsCreate` derives them (§D4: the content is the source of truth). The editor
	// sends neither `credits` nor `year`, so without the fallback adding `{artist: …}` or
	// `{year: …}` to an existing song was parsed, denormalized nowhere, and silently lost.
	const tags = payload.tags ?? meta?.tags;
	if (tags) {
		const tagIds = await findOrCreateTags(tags);
		await prisma.songTag.deleteMany({ where: { songId: song.id } });
		await prisma.songTag.createMany({
			data: tagIds.map((tagId) => ({ songId: song.id, tagId })),
		});
	}

	const credits =
		payload.credits ??
		(meta?.artist
			? [{ artist: { name: meta.artist }, role: CreditRole.ARTIST }]
			: undefined);
	if (credits) {
		const creditData = [];
		for (const c of credits) {
			creditData.push({
				songId: song.id,
				artistId: await findOrCreateArtist(c.artist.name),
				role: c.role ?? CreditRole.ARTIST,
			});
		}
		await prisma.credit.deleteMany({ where: { songId: song.id } });
		for (const data of creditData) {
			await prisma.credit.create({ data });
		}
	}

	return prisma.song.update({
		where: { id: song.id },
		data: {
			name: payload.name ?? undefined,
			year:
				payload.year === undefined ? (meta?.year ?? undefined) : payload.year,
		},
		include: { charts: true, tags: { include: { tag: true } } },
	});
}
