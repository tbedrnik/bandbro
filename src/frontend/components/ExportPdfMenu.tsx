import { api } from "@frontend/api";
import { Button } from "@frontend/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import {
	IconAlertTriangle,
	IconFileTypePdf,
	IconLoader2,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Setlist PDF export (CLAUDE.md §D20). The render is a job on the server, so this asks
 * for one, polls it, and then offers the file — rather than holding a download open for
 * the length of a `chordpro` run, which is what used to 502 on a long setlist.
 *
 * The finished file is offered as a button, not auto-downloaded: the download starts
 * seconds after the click that asked for it, and browsers rightly treat a programmatic
 * download that far from a user gesture as something to block.
 */

const MODES = [
	["both", "As-fingered + concert"],
	["fingered", "As-fingered only"],
	["concert", "Concert pitch only"],
] as const;

type Mode = (typeof MODES)[number][0];

export function ExportPdfMenu({
	songbookId,
	disabled,
}: {
	songbookId: string;
	disabled?: boolean;
}) {
	const [jobId, setJobId] = useState<string | null>(null);

	const create = useMutation({
		...api.songbooks({ id: songbookId }).pdf.post.mutationOptions(),
		onSuccess: (job) => setJobId(job?.id ?? null),
	});

	const { data: job } = useQuery({
		...api["pdf-exports"]({ jobId: jobId ?? "" }).get.queryOptions({}),
		enabled: Boolean(jobId),
		// Poll only while there's something to wait for; a settled job stops the timer.
		refetchInterval: (query) =>
			query.state.data?.status === "pending" ||
			query.state.data?.status === "running"
				? 1500
				: false,
		retry: false,
	});

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
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" disabled={disabled || working}>
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
				}
			/>
			<DropdownMenuContent>
				{MODES.map(([mode, label]) => (
					<DropdownMenuItem
						key={mode}
						onClick={() => create.mutate({ mode } as { mode: Mode })}
					>
						{label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
