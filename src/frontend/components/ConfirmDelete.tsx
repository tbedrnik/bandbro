import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@frontend/components/ui/alert-dialog";

/**
 * Confirmation for a delete that cannot be undone (CLAUDE.md §D27).
 *
 * There are no soft deletes anywhere in this app and no backups behind it, so every
 * delete is final — which makes an unconfirmed one a genuinely bad idea, and the
 * `alert-dialog` primitive was sitting unused for exactly this.
 *
 * `consequence` is for the part the player can't see: deleting a song strips it from every
 * setlist that referenced it, and the number is the only way to know that before clicking.
 */
export function ConfirmDelete({
	open,
	onOpenChange,
	title,
	what,
	consequence,
	confirmLabel = "Delete",
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	what: string;
	consequence?: string;
	confirmLabel?: string;
	pending?: boolean;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>
						{what}
						{consequence ? ` ${consequence}` : ""} This can't be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep it</AlertDialogCancel>
					<AlertDialogAction disabled={pending} onClick={onConfirm}>
						{pending ? "Deleting…" : confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
