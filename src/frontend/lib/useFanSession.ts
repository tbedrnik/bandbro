import { api, apiClient } from "@frontend/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

/**
 * Band-side hook for a setlist's public fan session. `ensure()` lazily creates (or reuses)
 * the share session and stashes its code — call it when the band opens "Share with fans".
 * Once a code exists it polls for the live "watching" count, and `syncCurrent` pushes the
 * band's current song index so fans auto-follow.
 */
export function useFanSession(songbookId: string) {
	const [code, setCode] = useState<string>();
	const create = useMutation(api.live.post.mutationOptions());
	const lastSynced = useRef<number | null>(null);

	const ensure = useCallback(() => {
		if (code || create.isPending) return;
		create.mutate(
			{ songbookId },
			{ onSuccess: (data) => data && setCode(data.code) },
		);
	}, [code, create, songbookId]);

	// The *light* poll. This used to hit the full public read — every song's complete
	// ChordPro, every five seconds — from the phone on the stand that must not stutter,
	// purely to display a watcher count (§D27).
	const { data } = useQuery({
		...api.live({ code: code ?? "" }).now.get.queryOptions({}),
		enabled: !!code,
		refetchInterval: 5000,
	});

	const setCurrent = useMutation({
		mutationFn: async (index: number) => {
			if (!code) return;
			const { error } = await apiClient.api
				.live({ code })
				.current.post({ currentSongIndex: index });
			if (error) throw new Error(String(error.status));
		},
		// A failed sync stays silent — the band's own chart must never stall because the
		// room's copy couldn't be updated — but it must not be *recorded* as sent either.
		// `lastSynced` was set before the request, so one dropped packet on venue wifi
		// meant the room silently skipped that song for the rest of the set (§D27).
		onSuccess: (_data, index) => {
			lastSynced.current = index;
		},
		retry: 2,
	});

	const syncCurrent = useCallback(
		(index: number) => {
			if (!code || lastSynced.current === index) return;
			setCurrent.mutate(index);
		},
		[code, setCurrent],
	);

	const end = useCallback(async () => {
		if (!code) return;
		await apiClient.api.live({ code }).end.post();
		setCode(undefined);
		lastSynced.current = null;
	}, [code]);

	return { code, ensure, syncCurrent, end, watching: data?.watching ?? 0 };
}
