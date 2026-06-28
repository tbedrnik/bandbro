import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { useEffect, useState } from "react";

/**
 * A small designed dialog for naming a new thing (band, setlist…), replacing the
 * native window.prompt. Reuses the design tokens + Input/Button so it matches the
 * rest of the app. Submits on Enter; the action is disabled while empty or pending.
 */
export function NamePromptDialog({
	open,
	onOpenChange,
	title,
	description,
	label,
	placeholder,
	submitLabel = "Create",
	defaultValue = "",
	pending = false,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	label: string;
	placeholder?: string;
	submitLabel?: string;
	defaultValue?: string;
	pending?: boolean;
	onSubmit: (name: string) => void;
}) {
	const [value, setValue] = useState(defaultValue);

	// Reset the field each time the dialog opens.
	useEffect(() => {
		if (open) setValue(defaultValue);
	}, [open, defaultValue]);

	const submit = () => {
		const trimmed = value.trim();
		if (!trimmed || pending) return;
		onSubmit(trimmed);
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-xs duration-100" />
				<Dialog.Popup className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-5 shadow-lg ring-1 ring-foreground/10 duration-100 outline-none">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
					>
						<Dialog.Title className="font-display text-lg font-semibold">
							{title}
						</Dialog.Title>
						{description && (
							<Dialog.Description className="mt-1 text-sm text-muted-foreground">
								{description}
							</Dialog.Description>
						)}
						<label className="mt-4 block">
							<span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{label}
							</span>
							<Input
								autoFocus
								value={value}
								onChange={(e) => setValue(e.target.value)}
								placeholder={placeholder}
							/>
						</label>
						<div className="mt-5 flex justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={!value.trim() || pending}>
								{pending ? "Saving…" : submitLabel}
							</Button>
						</div>
					</form>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
