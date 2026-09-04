import { Dialog } from "@base-ui/react/dialog";
import { api } from "@frontend/api";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { useOnline } from "@frontend/lib/offline";
import { useScopes } from "@frontend/lib/scopes";
import { IconFileImport } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const EXAMPLE = "https://akordy.kytary.cz/songbook/…/amerika";

/** The endpoint answers with a status only, so turn that into something readable. */
function messageForStatus(status?: number): string {
	switch (status) {
		case 400:
			return "That's not an akordy.kytary.cz song link.";
		case 403:
			return "You don't have permission to add songs to that library.";
		case 404:
			return "That page doesn't exist — check the link.";
		case 422:
			return "That page has no chord sheet on it.";
		default:
			return "Import failed. Check the link and try again.";
	}
}

/**
 * Import a song from akordy.kytary.cz (CLAUDE.md §2 "Importers"): the server fetches
 * the page, converts it to ChordPro and creates the song in the chosen scope; we then
 * drop the user straight into its editor to set key/capo and tidy the sheet.
 */
export function ImportSongDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { bands, personal } = useScopes();
	const writableScopes = [...bands, ...(personal ? [personal] : [])];

	const [url, setUrl] = useState("");
	const [scope, setScope] = useState("");

	const target = scope || writableScopes[0]?.param;

	const importSong = useMutation({
		...api.songs.import.post.mutationOptions(),
		onSuccess: (song) => {
			queryClient.invalidateQueries(api.songs.get.queryFilter());
			onOpenChange(false);
			navigate({ to: "/songs/$slug/edit", params: { slug: song.slug } });
		},
	});

	// Reset the field (and any previous failure) each time the dialog opens.
	const { reset } = importSong;
	useEffect(() => {
		if (open) {
			setUrl("");
			reset();
		}
	}, [open, reset]);

	const submit = () => {
		const trimmed = url.trim();
		if (!trimmed || !target || importSong.isPending) return;
		importSong.mutate({ url: trimmed, organizationId: target });
	};

	const status = (importSong.error as { status?: number } | null)?.status;

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-xs duration-100" />
				<Dialog.Popup className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-5 shadow-lg ring-1 ring-foreground/10 duration-100 outline-none">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
					>
						<Dialog.Title className="font-display text-lg font-semibold">
							Import a song
						</Dialog.Title>
						<Dialog.Description className="mt-1 text-sm text-muted-foreground">
							Paste a song page from{" "}
							<span className="font-mono text-xs">akordy.kytary.cz</span> —
							we'll convert its chords and lyrics to ChordPro and open the
							editor.
						</Dialog.Description>

						<label className="mt-4 block">
							<span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Song URL
							</span>
							<Input
								autoFocus
								type="url"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder={EXAMPLE}
							/>
						</label>

						<label className="mt-4 block">
							<span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Save to
							</span>
							<select
								value={target ?? ""}
								onChange={(e) => setScope(e.target.value)}
								className="w-full rounded-lg border border-border bg-card px-3 py-2 font-display text-sm text-foreground"
							>
								{writableScopes.map((s) => (
									<option key={s.param} value={s.param}>
										{s.name}
									</option>
								))}
							</select>
						</label>

						{importSong.isError && (
							<p className="mt-3 text-sm text-destructive">
								{messageForStatus(status)}
							</p>
						)}

						<div className="mt-5 flex justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={!url.trim() || !target || importSong.isPending}
							>
								{importSong.isPending ? "Importing…" : "Import"}
							</Button>
						</div>
					</form>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/**
 * The "Import" button + its dialog, for use next to "New song". The import is a server
 * fetch-and-create, so the button hides itself with no signal rather than making every
 * call site remember to (§D7: hide what can't work offline).
 */
export function ImportSongButton() {
	const [open, setOpen] = useState(false);
	const online = useOnline();
	if (!online) return null;
	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				<IconFileImport className="size-4" /> Import
			</Button>
			<ImportSongDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
