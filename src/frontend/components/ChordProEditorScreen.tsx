import { api } from "@frontend/api";
import { MetaChip, Tag } from "@frontend/components/MetaChip";
import { SongEditor } from "@frontend/components/SongEditor";
import { SongSheet } from "@frontend/components/SongSheet";
import { Button } from "@frontend/components/ui/button";
import { useScopes } from "@frontend/lib/scopes";
import { parseChordpro } from "@shared/chordpro";
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
 */
export function ChordProEditorScreen(props: Props) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { bands, personal } = useScopes();
	const writableScopes = [...bands, ...(personal ? [personal] : [])];

	const [content, setContent] = useState(
		props.mode === "new" ? STARTER : props.initialContent,
	);
	const [scope, setScope] = useState<string>("");

	const parsed = useMemo(() => parseChordpro(content), [content]);
	const meta = parsed.meta;
	const name =
		props.mode === "new" ? (meta.title ?? "Untitled") : props.initialName;
	// Placeholder for new mode — the put endpoint is only hit in edit mode.
	const slug = props.mode === "new" ? "__none__" : props.slug;

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["songs"] });
	};

	const create = useMutation({
		...api.songs.post.mutationOptions(),
		onSuccess: (song: { slug: string }) => {
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
				<div className="ml-auto flex items-center gap-3">
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
				</div>
			</div>

			{/* Panes */}
			<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
				<div className="min-h-0 overflow-auto border-r border-border">
					<SongEditor content={content} onChange={setContent} />
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
							{meta.key && <MetaChip label="Key" value={meta.key} />}
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
