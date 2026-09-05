import { SiteFooter } from "@frontend/components/SiteFooter";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { INVITE_CODE_LENGTH, normalizeInviteCode } from "@shared/bandInvite";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/join/")({
	component: JoinByCode,
});

/**
 * Type an invite code by hand — the fallback when a link can't be clicked (read off a
 * screen, dictated over the phone). Public, like the join page it hands off to.
 */
function JoinByCode() {
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const ready = code.length === INVITE_CODE_LENGTH;

	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<div className="grid flex-1 place-items-center px-6 py-10">
				<div className="w-full max-w-[400px] text-center">
					<div className="font-display text-[22px] font-bold tracking-[-0.02em]">
						Band<span className="text-primary">Bro</span>
					</div>

					<div className="mt-8 rounded-2xl border border-border bg-card p-7">
						<h1 className="font-display text-xl font-bold">Join a band</h1>
						<p className="mt-2 text-sm text-muted-foreground">
							Enter the {INVITE_CODE_LENGTH}-character invite code an admin gave
							you.
						</p>
						<form
							className="mt-5 flex flex-col gap-3"
							onSubmit={(e) => {
								e.preventDefault();
								if (ready) navigate({ to: "/join/$code", params: { code } });
							}}
						>
							<Input
								value={code}
								onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
								placeholder="ABCD23WXYZ"
								autoCapitalize="characters"
								autoComplete="off"
								spellCheck={false}
								aria-label="Invite code"
								className="text-center font-mono text-lg tracking-[0.2em]"
							/>
							<Button type="submit" disabled={!ready}>
								Continue
							</Button>
						</form>
					</div>
				</div>
			</div>

			<SiteFooter />
		</div>
	);
}
