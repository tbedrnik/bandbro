import type { CSSProperties } from "react";

/**
 * The fan view's warm palettes (CLAUDE.md fan-experience handoff). Both directions use the
 * same paper-light / "DARK_A" warm-dark pair. We map the design tokens onto the app's CSS
 * custom properties so the shared <ChordSheet> (which reads --foreground / --primary) and
 * the surrounding chrome both pick up the warm palette inside the fan-view subtree —
 * independent of the global light/dark class.
 */

export type FanTheme = "light" | "dark";

const PAPER: CSSProperties = {
	"--background": "#faf6ee",
	"--foreground": "#241d14",
	"--card": "#f2ebdd",
	"--card-foreground": "#241d14",
	"--secondary": "#ece3d2",
	"--secondary-foreground": "#241d14",
	"--muted": "#ece3d2",
	"--muted-foreground": "#8c8273",
	"--border": "#e6dcc8",
	"--primary": "#b4690f",
	"--primary-foreground": "#ffffff",
	"--accent-wash": "rgba(180,105,15,0.12)",
} as CSSProperties;

const DARK_A: CSSProperties = {
	"--background": "#17140e",
	"--foreground": "#efe9dc",
	"--card": "#211d15",
	"--card-foreground": "#efe9dc",
	"--secondary": "#2a2419",
	"--secondary-foreground": "#efe9dc",
	"--muted": "#2a2419",
	"--muted-foreground": "#9d9281",
	"--border": "#322c20",
	"--primary": "#e8a13a",
	"--primary-foreground": "#16130d",
	"--accent-wash": "rgba(232,161,58,0.16)",
} as CSSProperties;

export function fanPalette(theme: FanTheme): CSSProperties {
	return theme === "dark" ? DARK_A : PAPER;
}

/** Text-size multipliers for the fan view's A−/A+ stepper. */
export const FAN_SIZES = [0.85, 1, 1.16, 1.4];
