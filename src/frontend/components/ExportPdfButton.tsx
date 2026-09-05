import { Dialog } from "@base-ui/react/dialog";
import { api } from "@frontend/api";
import { Button } from "@frontend/components/ui/button";
import { Checkbox } from "@frontend/components/ui/checkbox";
import { usePdfExportJob } from "@frontend/lib/pdfExportJob";
import { cn } from "@frontend/lib/utils";
import {
	IconAlertTriangle,
	IconCheck,
	IconFileTypePdf,
	IconLoader2,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/**
 * Setlist PDF export (CLAUDE.md §D20). The render is a job on the server, so this asks
 * for one, polls it, and then offers the file — rather than holding a download open for
 * the length of a `chordpro` run, which is what used to 502 on a long setlist.
 *
 * The finished file is offered as a button, not auto-downloaded: the download starts
 * seconds after the click that asked for it, and browsers rightly treat a programmatic
 * download that far from a user gesture as something to block.
 *
 * The wait is minutes on a long setlist, so it has to survive inattention: the poll runs
 * with the window blurred, and the job id is remembered per device (`usePdfExportJob`)
 * so leaving the screen or reloading re-attaches to the render instead of orphaning it.
 *
 * The options are a dialog rather than a dropdown because there is now more than one of
 * them (§D23) — a menu of items can express "pick one of three", not "pick one of three
 * and also tick this".
 */

const MODES = [
	["both", "As-fingered + concert", "A capo'd song prints twice."],
	["fingered", "As-fingered only", "The shapes as written, capo and all."],
	["concert", "Concert pitch only", "What the song actually sounds like."],
] as const;

type Mode = (typeof MODES)[number][0];

export function ExportPdfButton({
	songbookId,
	adoptJobId,
	disabled,
}: {
	songbookId: string;
	/** A job handed over in the URL by a push notification (§D21). */
	adoptJobId?: string;
	disabled?: boolean;
}) {
	const [jobId, setJobId] = usePdfExportJob(songbookId);
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<Mode>("both");
	const [collapseChoruses, setCollapseChoruses] = useState(false);

	// Take over a job this device never started — push reaches every device on the
	// account, so the notification may well be tapped on the phone while the export was
	// asked for on a laptop. Once only: clearing the job after a download must not be
	// undone by a URL that still carries it.
	const adopted = useRef(false);
	useEffect(() => {
		if (adopted.current || !adoptJobId || adoptJobId === jobId) return;
		adopted.current = true;
		setJobId(adoptJobId);
	}, [adoptJobId, jobId, setJobId]);

	const create = useMutation({
		...api.songbooks({ id: songbookId }).pdf.post.mutationOptions(),
		onSuccess: (job) => {
			setJobId(job?.id ?? null);
			setOpen(false);
		},
	});

	const { data: job, isError } = useQuery({
		...api["pdf-exports"]({ jobId: jobId ?? "" }).get.queryOptions({}),
		enabled: Boolean(jobId),
		// Poll only while there's something to wait for; a settled job stops the timer.
		refetchInterval: (query) =>
			query.state.data?.status === "pending" ||
			query.state.data?.status === "running"
				? 1500
				: false,
		// A render outlives the attention span it was started with: the tab is behind
		// the tuner, or the mail client, for most of it. Query suspends its interval on
		// a blurred window by default, so the poll stalled exactly when the work was
		// happening and only resumed on refocus.
		refetchIntervalInBackground: true,
		retry: false,
	});

	// A remembered job the server no longer knows about — swept after 24h, or a
	// different account on this device — must not leave the button spinning forever.
	// A blip mid-poll is not this case: Query keeps the last good status, so the
	// interval above survives it and the next tick heals.
	useEffect(() => {
		if (isError && !job) setJobId(null);
	}, [isError, job, setJobId]);

	const working =
		create.isPending ||
		job?.status === "pending" ||
		job?.status === "running" ||
		// The gap between a successful POST and the first poll answering, which would
		// otherwise flash the idle label.
		(Boolean(jobId) && !job);

	if (job?.status === "done") {
		return (
			<Button
				variant="outline"
				render={
					// Same-origin, so the session cookie rides along; `download` saves it.
					<a
						href={`/api/pdf-exports/${job.id}/download`}
						download
						onClick={() => setJobId(null)}
					/>
				}
			>
				<IconFileTypePdf className="size-4" /> Download PDF
			</Button>
		);
	}

	if (create.isError || job?.status === "failed") {
		return (
			<Button
				variant="outline"
				onClick={() => {
					setJobId(null);
					create.reset();
				}}
				title={job?.error ?? "The export could not be started."}
			>
				<IconAlertTriangle className="size-4" /> Export failed — retry
			</Button>
		);
	}

	return (
		<>
			<Button
				variant="outline"
				disabled={disabled || working}
				onClick={() => setOpen(true)}
			>
				{working ? (
					<>
						<IconLoader2 className="size-4 animate-spin" /> Exporting
						{job?.songCount ? ` ${job.songCount} songs` : ""}…
					</>
				) : (
					<>
						<IconFileTypePdf className="size-4" /> Export PDF
					</>
				)}
			</Button>

			<Dialog.Root open={open} onOpenChange={setOpen}>
				<Dialog.Portal>
					<Dialog.Backdrop className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-xs duration-100" />
					<Dialog.Popup className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-5 shadow-lg ring-1 ring-foreground/10 duration-100 outline-none">
						<form
							onSubmit={(e) => {
								e.preventDefault();
								if (create.isPending) return;
								create.mutate({ mode, collapseChoruses } as {
									mode: Mode;
									collapseChoruses: boolean;
								});
							}}
						>
							<Dialog.Title className="font-display text-lg font-semibold">
								Export PDF
							</Dialog.Title>
							<Dialog.Description className="mt-1 text-sm text-muted-foreground">
								One song per page, in setlist order, with a table of contents.
							</Dialog.Description>

							<fieldset className="mt-4">
								<legend className="mb-1.5 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Chords
								</legend>
								<div className="space-y-1.5" role="radiogroup">
									{MODES.map(([value, label, hint]) => (
										<button
											key={value}
											type="button"
											role="radio"
											aria-checked={mode === value}
											onClick={() => setMode(value)}
											className={cn(
												"flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
												mode === value
													? "border-primary bg-primary/5"
													: "border-border hover:bg-secondary",
											)}
										>
											<span
												className={cn(
													"mt-0.5 grid size-4 flex-none place-items-center rounded-full border",
													mode === value
														? "border-primary bg-primary text-primary-foreground"
														: "border-input",
												)}
											>
												{mode === value && <IconCheck className="size-3" />}
											</span>
											<span>
												<span className="block font-display text-sm font-semibold">
													{label}
												</span>
												<span className="block text-xs text-muted-foreground">
													{hint}
												</span>
											</span>
										</button>
									))}
								</div>
							</fieldset>

							<label className="mt-4 flex items-start gap-3">
								<Checkbox
									checked={collapseChoruses}
									onCheckedChange={(checked) =>
										setCollapseChoruses(checked === true)
									}
									className="mt-0.5"
								/>
								<span>
									<span className="block font-display text-sm font-semibold">
										Shorten repeated choruses
									</span>
									<span className="block text-xs text-muted-foreground">
										Print the chorus once and mark every identical repeat with
										just its name. Fewer page turns — but on paper the repeat
										can end up pages away from the words.
									</span>
								</span>
							</label>

							<div className="mt-5 flex justify-end gap-2">
								<Button
									type="button"
									variant="ghost"
									onClick={() => setOpen(false)}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={create.isPending}>
									{create.isPending ? "Starting…" : "Export"}
								</Button>
							</div>
						</form>
					</Dialog.Popup>
				</Dialog.Portal>
			</Dialog.Root>
		</>
	);
}
