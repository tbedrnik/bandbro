import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

export const Route = createFileRoute("/s/")({
	component: FanLanding,
});

const CODE_LENGTH = 5;

/**
 * Public fan landing — bandbro.live join-by-code (CLAUDE.md fan-experience handoff, screen
 * 1d). No auth, no app. Fans scan the band's QR (which deep-links straight to /s/<code>) or
 * type the 5-character code here. Paper theme, phone-width column.
 */
function FanLanding() {
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const [joined, setJoined] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const ready = code.length === CODE_LENGTH;

	const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, CODE_LENGTH);
		setCode(v);
	};

	const join = () => {
		if (!ready) return;
		setJoined(true);
		setTimeout(
			() => navigate({ to: "/s/$code", params: { code: code.toLowerCase() } }),
			650,
		);
	};

	return (
		<div
			className="flex min-h-dvh flex-col items-center px-6 pb-10 pt-12 font-sans"
			style={{ background: "#faf6ee", color: "#241d14" }}
		>
			<div className="flex w-full max-w-[420px] flex-1 flex-col">
				{/* Brand */}
				<div className="text-center">
					<div className="font-display text-[22px] font-bold tracking-[-0.02em]">
						Band<span style={{ color: "#b4690f" }}>Bro</span>
					</div>
					<div
						className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em]"
						style={{ color: "#8c8273" }}
					>
						Live, with the band
					</div>
				</div>

				{/* Hero */}
				<div className="flex flex-1 flex-col justify-center gap-[17px]">
					<div className="text-center">
						<h1 className="m-0 font-display text-[26px] font-bold tracking-[-0.02em]">
							Join the session
						</h1>
						<p
							className="mx-auto mt-2 max-w-[320px] text-[13.5px] leading-[1.55]"
							style={{ color: "#8c8273" }}
						>
							Scan the band's QR on stage — or type the 5-character code below.
						</p>
					</div>

					{/* Code entry */}
					<div
						className="relative flex cursor-text justify-center gap-[9px]"
						onClick={() => inputRef.current?.focus()}
					>
						<input
							ref={inputRef}
							value={code}
							onChange={onChange}
							maxLength={CODE_LENGTH}
							autoCapitalize="characters"
							autoComplete="off"
							spellCheck={false}
							autoFocus
							aria-label="Session code"
							className="absolute inset-0 size-full border-none bg-transparent text-transparent outline-none"
						/>
						{Array.from({ length: CODE_LENGTH }).map((_, i) => {
							const char = code[i] ?? "";
							const filled = !!char;
							const active = code.length === i && code.length < CODE_LENGTH;
							return (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length boxes
									key={i}
									className="flex h-[58px] w-[48px] items-center justify-center rounded-[12px] font-mono text-[26px] font-bold"
									style={{
										background: "#ece3d2",
										border: `1.5px solid ${filled || active ? "#b4690f" : "#e6dcc8"}`,
										color: "#241d14",
									}}
								>
									{char}
									{active && (
										<span
											className="inline-block h-[26px] w-[2px]"
											style={{
												background: "#b4690f",
												animation: "fan-blink 1.05s steps(1) infinite",
											}}
										/>
									)}
								</span>
							);
						})}
					</div>

					{joined ? (
						<div
							className="flex h-[52px] items-center justify-center gap-[9px] rounded-[13px] font-display text-[14.5px] font-semibold"
							style={{
								background: "rgba(180,105,15,0.12)",
								color: "#b4690f",
							}}
						>
							<span
								className="flex size-5 items-center justify-center rounded-full text-[12px]"
								style={{ background: "#b4690f", color: "#fff" }}
							>
								✓
							</span>
							You're in — opening the show…
						</div>
					) : (
						<button
							type="button"
							onClick={join}
							disabled={!ready}
							className="h-[52px] rounded-[13px] border-none font-display text-[15px] font-semibold"
							style={{
								cursor: ready ? "pointer" : "default",
								background: ready ? "#b4690f" : "#ece3d2",
								color: ready ? "#ffffff" : "#a99e8b",
							}}
						>
							{ready ? "Join the show" : "Enter 5-character code"}
						</button>
					)}

					{/* OR divider */}
					<div
						className="flex items-center gap-3 font-mono text-[11px] tracking-[0.08em]"
						style={{ color: "#8c8273" }}
					>
						<span className="h-px flex-1" style={{ background: "#e6dcc8" }} />
						OR
						<span className="h-px flex-1" style={{ background: "#e6dcc8" }} />
					</div>

					<button
						type="button"
						onClick={() => inputRef.current?.focus()}
						className="flex h-[50px] items-center justify-center gap-[9px] rounded-[13px] font-display text-[14px] font-semibold"
						style={{
							background: "#f2ebdd",
							border: "1px solid #e6dcc8",
							color: "#241d14",
						}}
					>
						<span className="text-[16px]">◇</span> Scan the band's QR
					</button>
				</div>

				<div
					className="pb-2 pt-4 text-center text-[11px]"
					style={{ color: "#8c8273" }}
				>
					No app · no login · read-only
				</div>
			</div>
		</div>
	);
}
