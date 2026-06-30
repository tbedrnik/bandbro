import { fanDisplayUrl, fanUrl } from "@frontend/lib/fanSession";
import { qrDataUrl } from "@frontend/lib/qr";
import { useMemo, useState } from "react";

/**
 * Reusable QR + code + actions block fans use to join a session (CLAUDE.md fan-experience
 * handoff, screen 1). Band-facing, so it's always rendered on the dark share palette
 * regardless of the app theme — hence the inline hex values straight from the spec rather
 * than theme tokens. Appears in the Live-mode and Playlist "Share with fans" modals.
 */
export function ShareSheet({
	code,
	heading = "Fans see what you play — live",
	blurb = "Anyone in the room scans to open a read-only Live Mode that follows your set automatically — or opens bandbro.live and types the code. Lyrics by default, chords on tap.",
	nowPlaying,
	position,
	watching = 0,
	showPrint = false,
}: {
	code: string;
	heading?: string;
	blurb?: string;
	nowPlaying?: string;
	position?: string;
	watching?: number;
	showPrint?: boolean;
}) {
	const upper = code.toUpperCase().slice(0, 5);
	const dataUrl = useMemo(() => qrDataUrl(fanUrl(upper)), [upper]);
	const [copied, setCopied] = useState(false);

	const copyLink = () => {
		navigator.clipboard?.writeText(fanUrl(upper)).catch(() => {});
		setCopied(true);
		setTimeout(() => setCopied(false), 1700);
	};

	const saveQr = () => {
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = `bandbro-${upper}.gif`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	};

	return (
		<div
			className="flex flex-wrap items-start gap-7 rounded-[20px] p-[26px] font-sans"
			style={{
				background: "#16181c",
				border: "1px solid #2c3037",
				color: "#edeef0",
			}}
		>
			{/* QR + code */}
			<div className="flex flex-none flex-col items-center gap-[15px]">
				<div
					className="size-[178px] rounded-[18px] p-[13px]"
					style={{
						background: "#ffffff",
						boxShadow: "0 10px 26px -12px rgba(0,0,0,0.6)",
					}}
				>
					<img
						src={dataUrl}
						alt={`QR code for joining session ${upper}`}
						className="size-full rounded-[3px]"
						style={{ imageRendering: "pixelated" }}
					/>
				</div>
				<div className="text-center">
					<div
						className="mb-[7px] font-mono text-[9.5px] uppercase tracking-[0.16em]"
						style={{ color: "#8b8f96" }}
					>
						Session code
					</div>
					<div className="flex justify-center gap-[6px]">
						{upper.split("").map((ch, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length code
								key={i}
								className="flex h-[42px] w-[34px] items-center justify-center rounded-[8px] font-mono text-[21px] font-bold"
								style={{ background: "#23262c", border: "1px solid #2c3037" }}
							>
								{ch}
							</span>
						))}
					</div>
				</div>
			</div>

			{/* Copy / heading / actions */}
			<div className="min-w-[248px] flex-1">
				<h3 className="m-0 font-display text-[20px] font-bold tracking-[-0.01em]">
					{heading}
				</h3>
				<p
					className="mb-4 mt-[9px] text-[13px] leading-[1.6]"
					style={{ color: "#8b8f96" }}
				>
					{blurb}
				</p>

				<div className="mb-[14px] flex flex-wrap items-center gap-2">
					<span
						className="rounded-[9px] px-[13px] py-[9px] font-mono text-[13px]"
						style={{ background: "#23262c", color: "#edeef0" }}
					>
						{fanDisplayUrl(upper)}
					</span>
					<button
						type="button"
						onClick={copyLink}
						className="h-[38px] cursor-pointer rounded-[9px] border-none px-[14px] font-display text-[13px] font-semibold"
						style={{ background: "#e8a13a", color: "#16181c" }}
					>
						{copied ? "Copied ✓" : "Copy link"}
					</button>
					<button
						type="button"
						onClick={saveQr}
						className="h-[38px] cursor-pointer rounded-[9px] bg-transparent px-[14px] font-display text-[13px] font-semibold"
						style={{ border: "1px solid #2c3037", color: "#edeef0" }}
					>
						Save QR
					</button>
					{showPrint && (
						<button
							type="button"
							onClick={() => window.print()}
							className="h-[38px] cursor-pointer rounded-[9px] bg-transparent px-[14px] font-display text-[13px] font-semibold"
							style={{ border: "1px solid #2c3037", color: "#edeef0" }}
						>
							Print
						</button>
					)}
				</div>

				{nowPlaying && (
					<div
						className="mb-3 flex items-center gap-3 rounded-[13px] px-[15px] py-3"
						style={{ background: "#1d2025", border: "1px solid #2c3037" }}
					>
						<span
							className="size-[9px] flex-none rounded-full"
							style={{ background: "#e8a13a" }}
						/>
						<div className="min-w-0 flex-1">
							<div
								className="font-mono text-[10px] uppercase tracking-[0.14em]"
								style={{ color: "#8b8f96" }}
							>
								Now on every phone
							</div>
							<div className="truncate font-display text-[14.5px] font-semibold">
								{nowPlaying}
							</div>
						</div>
						{position && (
							<span
								className="flex-none font-mono text-[12px]"
								style={{ color: "#8b8f96" }}
							>
								{position}
							</span>
						)}
					</div>
				)}

				<div className="flex flex-wrap gap-2">
					{watching > 0 && (
						<span
							className="flex items-center gap-[7px] rounded-[8px] px-[11px] py-[7px] text-[12px]"
							style={{
								color: "#cfd2d6",
								background: "#1d2025",
								border: "1px solid #2c3037",
							}}
						>
							<span
								className="size-2 rounded-full"
								style={{
									background: "#3fae7a",
									boxShadow: "0 0 0 3px rgba(63,174,122,0.18)",
								}}
							/>
							{watching} watching
						</span>
					)}
					{["Read-only", "No app · no login"].map((label) => (
						<span
							key={label}
							className="rounded-[8px] px-[11px] py-[7px] text-[12px]"
							style={{
								color: "#8b8f96",
								background: "#1d2025",
								border: "1px solid #2c3037",
							}}
						>
							{label}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
