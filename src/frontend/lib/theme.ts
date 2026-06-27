import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "bandbro:theme";

function read(): Theme {
	if (typeof localStorage === "undefined") return "light";
	return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
}

function apply(theme: Theme) {
	document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Global light/dark theme. Light = desktop authoring, dark = dim stages / Live mode.
 * Persisted to localStorage; the same toggle appears in the nav and Preferences.
 */
export function useTheme() {
	const [theme, setTheme] = useState<Theme>(read);

	useEffect(() => {
		apply(theme);
	}, [theme]);

	const toggle = () => {
		setTheme((prev) => {
			const next: Theme = prev === "dark" ? "light" : "dark";
			localStorage.setItem(KEY, next);
			return next;
		});
	};

	return { theme, toggle, setTheme } as const;
}
