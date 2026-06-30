import { api } from "@frontend/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

/**
 * Band-side hook for a setlist's public fan session. `ensure()` lazily creates (or reuses)
 * the share session and stashes its code — call it when the band opens "Share with fans".
 * Once a code exists it polls the public read for the live "watching" count, and `syncCurrent`
 * pushes the band's current song index so fans auto-follow.
 */
export function useFanSession(songbookId: string) {
	const [code, setCode] = useState<string>();
	const create = useMutation(api.live.post.mutationOptions());
	const setCurrent = useMutation(
		api.live({ code: code ?? "" }).current.post.mutationOptions(),
	);
	const lastSynced = useRef<number | null>(null);

	const ensure = useCallback(() => {
		if (code || create.isPending) return;
		create.mutate(
			{ songbookId },
			{ onSuccess: (data) => data && setCode(data.code) },
		);
	}, [code, create, songbookId]);

	const { data } = useQuery({
		...api.live({ code: code ?? "" }).get.queryOptions({}),
		enabled: !!code,
		refetchInterval: 5000,
	});

	const syncCurrent = useCallback(
		(index: number) => {
			if (!code || lastSynced.current === index) return;
			lastSynced.current = index;
			setCurrent.mutate({ currentSongIndex: index });
		},
		[code, setCurrent],
	);

	return { code, ensure, syncCurrent, watching: data?.watching ?? 0 };
}
