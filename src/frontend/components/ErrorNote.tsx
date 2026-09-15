import { mutationErrorMessage } from "@frontend/lib/mutationError";
import { cn } from "@frontend/lib/utils";

/**
 * The standard inline failure note for a mutation (CLAUDE.md §D27). Renders nothing when
 * there's no error, so call sites can drop it in unconditionally.
 *
 * Inline rather than a toast: these appear next to the control that failed, which is
 * where someone is already looking, and a toast on a phone propped on a stand is often
 * off in the corner of a screen nobody is watching.
 */
export function ErrorNote({
	error,
	when = true,
	subject,
	className,
}: {
	error: unknown;
	/** Usually the mutation's `isError`. */
	when?: boolean;
	subject?: string;
	className?: string;
}) {
	if (!when || !error) return null;
	return (
		<p role="alert" className={cn("mt-2 text-sm text-destructive", className)}>
			{mutationErrorMessage(error, subject)}
		</p>
	);
}
