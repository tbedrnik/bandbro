import { api } from "@frontend/api";
import { MetaChip, Tag } from "@frontend/components/MetaChip";
import { SongEditor } from "@frontend/components/SongEditor";
import { SongSheet } from "@frontend/components/SongSheet";
import { TransposeStepper } from "@frontend/components/TransposeStepper";
import { Button } from "@frontend/components/ui/button";
import { useOnline } from "@frontend/lib/offline";
import { useScopes } from "@frontend/lib/scopes";
import { parseChordpro } from "@shared/chordpro";
import {
	displayChordproSource,
	internationalChordproSource,
	sourceKey,
	transposeChordproSource,
} from "@shared/chordproSource";
import { displayKey } from "@shared/notation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

const STARTER = `{title: New Song}
{artist: }
{key: C}
{capo: 0}
{tempo: 100}
{tags: }
{start_of_verse: Verse 1}
[C]Type your lyrics with [G]chords in brackets
{end_of_verse}`;

type Props =
	| { mode: "new" }
	| {
			mode: "edit" | "suggest";
			slug: string;
			chartId: string;
			initialContent: string;
			initialName: string;
	  };

/**
 * The ChordPro editor (F2): plain-text source on the left, a faithful live preview
 * (the real chord-sheet component) on the right. ChordPro source is the single
 * source of truth — metadata is parsed from its directives (CLAUDE.md §D4). On save
 * the scope selector chooses which library it lands in.
 *
 * Note names (§D11): the pane shows and accepts the European convention (`H` = B,
 * `B` = B-flat) while everything else — preview, transpose, what we save — works on the
 * international spelling. The two conversions happen at the boundary only (once on load,
 * on every save), never per keystroke, which would fight the user as they type "Bb".
 */
export function ChordProEditorScreen(props: Props) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { bands, personal } = useScopes();
	const writableScopes = [...bands, ...(personal ? [personal] : [])];
	const online = useOnline();

	/** What's in the editor pane: the source in the reader's note-name convention. */
	const [source, setSource] = useState(() =>
		displayChordproSource(
			props.mode === "new" ? STARTER : props.initialContent,
		),
	);
	const [scope, setScope] = useState<string>("");
	/** Net semitones baked into the source so far — lets us offer a one-click revert. */
	const [baked, setBaked] = useState(0);

	/** The international spelling — what we parse, preview, transpose and save. */
	const content = useMemo(() => internationalChordproSource(source), [source]);

	const parsed = useMemo(() => parseChordpro(content), [content]);
	const meta = parsed.meta;

	/**
	 * Rewrite the chords in the ChordPro source itself (not a view-level transpose):
	 * the song's *written* key changes, so everyone opening it sees the new chords.
	 */
	const bakeTranspose = (steps: number) => {
		setSource((s) =>
			displayChordproSource(
				transposeChordproSource(internationalChordproSource(s), steps),
			),
		);
		setBaked((b) => b + steps);
	};

	const writtenKey = displayKey(meta.key || sourceKey(content)) || "—";
	const name =
		props.mode === "new" ? (meta.title ?? "Untitled") : props.initialName;
	// Placeholder for new mode — the put endpoint is only hit in edit mode.
	const slug = props.mode === "new" ? "__none__" : props.slug;

	const invalidate = () => {
		queryClient.invalidateQueries(api.songs.get.queryFilter());
	};

	const create = useMutation({
		...api.songs.post.mutationOptions(),
		onSuccess: (song) => {
			invalidate();
			navigate({ to: "/songs/$slug", params: { slug: song.slug } });
		},
	});
	const update = useMutation({
		...api.songs({ slug }).put.mutationOptions(),
		onSuccess: () => {
			invalidate();
			if (props.mode !== "new")
				navigate({ to: "/songs/$slug", params: { slug } });
		},
	});
	const suggest = useMutation({
		...api.suggestions.post.mutationOptions(),
		onSuccess: () => {
			if (props.mode !== "new")
				navigate({ to: "/songs/$slug", params: { slug: props.slug } });
		},
	});

	const pending = create.isPending || update.isPending || suggest.isPending;

	const onSave = () => {
		if (props.mode === "new") {
			const target = scope || writableScopes[0]?.id;
			if (!target) return;
			create.mutate({
				name: meta.title || "Untitled",
				organizationId: target,
				tags: meta.tags,
				chart: { content },
			});
		} else if (props.mode === "edit") {
			update.mutate({
				name: meta.title || props.initialName,
				tags: meta.tags,
				chart: { id: props.chartId, content },
			});
		} else {
			suggest.mutate({ chartId: props.chartId, proposedContent: content });
		}
	};

	const isSuggest = props.mode === "suggest";

	return (
		<div className="flex h-[calc(100dvh-3.5rem)] flex-col">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
				<div className="font-display text-sm font-semibold">
					{props.mode === "new"
						? "New song"
						: isSuggest
							? `Suggest an edit · ${name}`
							: `Editing · ${name}`}
				</div>
				{/* Wraps: the stepper, scope select and Save together are wider than a
				    phone, and used to run off the right edge of the new-song screen. */}
				<div className="ml-auto flex flex-wrap items-center justify-end gap-3">
					<div className="flex items-center gap-2">
						<span
							className="w-14 font-display text-xs leading-tight text-muted-foreground"
							title="Rewrites the chords in the ChordPro source — this is not a per-view transpose"
						>
							Transpose source
						</span>
						<TransposeStepper
							value={writtenKey}
							caption={
								baked === 0
									? "written key"
									: `${baked > 0 ? "+" : ""}${baked} baked in`
							}
							onStepUp={() => bakeTranspose(1)}
							onStepDown={() => bakeTranspose(-1)}
							className="w-[190px]"
						/>
						{baked !== 0 && (
							<button
								type="button"
								onClick={() => bakeTranspose(-baked)}
								className="font-display text-xs text-primary underline-offset-2 hover:underline"
							>
								Revert
							</button>
						)}
					</div>
					{/* Saving (and picking the library it lands in) is a POST/PUT — hidden
					    with no signal, since v1 has no edit queue to hold the work (§D7). */}
					{online ? (
						<>
							{props.mode === "new" && (
								<label className="flex items-center gap-2 text-sm text-muted-foreground">
									Save to
									<select
										value={scope}
										onChange={(e) => setScope(e.target.value)}
										className="rounded-lg border border-border bg-card px-3 py-1.5 font-display text-sm text-foreground"
									>
										{writableScopes.map((s) => (
											<option key={s.param} value={s.param}>
												{s.name}
											</option>
										))}
									</select>
								</label>
							)}
							<Button onClick={onSave} disabled={pending}>
								{pending ? "Saving…" : isSuggest ? "Send suggestion" : "Save"}
							</Button>
						</>
					) : (
						<span className="font-display text-sm text-muted-foreground">
							You're offline — saving needs a connection.
						</span>
					)}
				</div>
			</div>

			{/* Panes */}
			<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
				<div className="flex min-h-0 flex-col border-r border-border">
					<div className="min-h-0 flex-1 overflow-auto">
						<SongEditor content={source} onChange={setSource} />
					</div>
					<div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
						Note names: <span className="font-mono text-foreground">H</span> =
						B, <span className="font-mono text-foreground">B</span> = B♭ — saved
						as <span className="font-mono">B</span>/
						<span className="font-mono">Bb</span> so transpose and export stay
						correct.
					</div>
				</div>
				<div className="min-h-0 overflow-auto bg-background px-8 py-6">
					<div className="mb-5 border-b border-border pb-4">
						{meta.artist && (
							<div className="text-sm text-muted-foreground">{meta.artist}</div>
						)}
						<h1 className="font-display text-2xl font-bold">
							{meta.title || "Untitled"}
						</h1>
						<div className="mt-3 flex flex-wrap gap-2">
							{meta.key && (
								<MetaChip label="Key" value={displayKey(meta.key)} />
							)}
							{meta.capo ? <MetaChip label="Capo" value={meta.capo} /> : null}
							{meta.tempo && (
								<MetaChip label="Tempo" value={`${meta.tempo} bpm`} />
							)}
							{meta.tags.map((t) => (
								<Tag key={t}>{t}</Tag>
							))}
						</div>
					</div>
					<SongSheet content={content} view="fingered" />
				</div>
			</div>
		</div>
	);
}
