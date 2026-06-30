import { ShareSheet } from "@frontend/components/ShareSheet";

/**
 * Centered modal wrapper around <ShareSheet> for the band's "Share with fans" entry points
 * (Live mode and the Playlist view). Scrim + close ✕ both dismiss. The title sits above the
 * dark share card; the card itself is theme-independent.
 */
export function ShareWithFansModal({
	open,
	onClose,
	title,
	code,
	heading,
	blurb,
	nowPlaying,
	position,
	watching,
	showPrint,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	code?: string;
	heading?: string;
	blurb?: string;
	nowPlaying?: string;
	position?: string;
	watching?: number;
	showPrint?: boolean;
}) {
	if (!open) return null;

	return (
		<>
			<div
				className="fixed inset-0 z-[80]"
				style={{ background: "rgba(0,0,0,0.6)" }}
				onClick={onClose}
			/>
			<div className="fixed left-1/2 top-1/2 z-[90] w-[780px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2">
				<div className="mb-3 flex items-center justify-between">
					<div
						className="font-display text-[18px] font-bold"
						style={{ color: "#edeef0" }}
					>
						{title}
					</div>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="size-9 cursor-pointer rounded-[9px] border-none text-[19px]"
						style={{ background: "#23262c", color: "#edeef0" }}
					>
						×
					</button>
				</div>
				{code ? (
					<ShareSheet
						code={code}
						heading={heading}
						blurb={blurb}
						nowPlaying={nowPlaying}
						position={position}
						watching={watching}
						showPrint={showPrint}
					/>
				) : (
					<div
						className="grid h-[290px] place-items-center rounded-[20px] font-mono text-sm"
						style={{
							background: "#16181c",
							border: "1px solid #2c3037",
							color: "#8b8f96",
						}}
					>
						Creating session…
					</div>
				)}
			</div>
		</>
	);
}
