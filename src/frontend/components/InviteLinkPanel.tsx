import { inviteDisplayUrl, inviteUrl } from "@frontend/lib/inviteLink";
import { qrDataUrl } from "@frontend/lib/qr";
import { useMemo, useState } from "react";

/**
 * The shareable half of a band invite (CLAUDE.md §D13): a QR to hold up in the rehearsal
 * room, the link to paste into a chat, and the bare code to read out loud. Themed with the
 * app tokens — unlike the fan `ShareSheet`, this one is used at a desk, not on a stage.
 */
export function InviteLinkPanel({ code }: { code: string }) {
	const url = inviteUrl(code);
	const dataUrl = useMemo(() => qrDataUrl(url), [url]);
	const [copied, setCopied] = useState<"link" | "code" | null>(null);

	const copy = (what: "link" | "code") => {
		navigator.clipboard
			?.writeText(what === "link" ? url : code)
			.catch(() => {});
		setCopied(what);
		setTimeout(() => setCopied(null), 1700);
	};

	const saveQr = () => {
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = `bandbro-invite-${code}.gif`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	};

	return (
		<div className="flex flex-wrap items-start gap-5 rounded-xl border border-border bg-secondary/40 p-4">
			<div className="rounded-xl bg-white p-2 shadow-sm">
				<img
					src={dataUrl}
					alt={`QR code for invite ${code}`}
					className="size-[150px]"
					style={{ imageRendering: "pixelated" }}
				/>
			</div>
			<div className="min-w-[240px] flex-1">
				<div className="font-display text-sm font-semibold">
					Have them scan this
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					Any phone camera opens the join page. No email involved — sending the
					link works just as well.
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<span className="rounded-lg bg-secondary px-3 py-2 font-mono text-xs">
						{inviteDisplayUrl(code)}
					</span>
				</div>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => copy("link")}
						className="h-8 rounded-lg bg-primary px-3 font-display text-xs font-semibold text-primary-foreground"
					>
						{copied === "link" ? "Copied ✓" : "Copy link"}
					</button>
					<button
						type="button"
						onClick={() => copy("code")}
						className="h-8 rounded-lg border border-border px-3 font-display text-xs font-semibold"
					>
						{copied === "code" ? "Copied ✓" : `Copy code ${code}`}
					</button>
					<button
						type="button"
						onClick={saveQr}
						className="h-8 rounded-lg border border-border px-3 font-display text-xs font-semibold"
					>
						Save QR
					</button>
				</div>
			</div>
		</div>
	);
}
