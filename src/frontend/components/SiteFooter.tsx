/**
 * The one-line site footer, shared by the landing page (hand-written there, in
 * src/landing/index.html — that surface ships no React) and every app screen that
 * has chrome around it.
 *
 * Deliberately absent from Live mode, the fan view and the print/PDF route: those
 * are full-bleed performance surfaces where every row of pixels is chart, and a
 * credit line at the bottom of a song being read off a stand is noise.
 */
export function SiteFooter({ className }: { className?: string }) {
	return (
		<footer
			className={`border-t border-border px-6 py-6 text-center font-display text-sm text-muted-foreground ${className ?? ""}`}
		>
			Made with 🧡 by{" "}
			<a
				href="https://codingfingers.cz"
				target="_blank"
				rel="noopener noreferrer"
				className="font-semibold transition-colors hover:text-foreground hover:underline"
			>
				Coding Fingers
			</a>
		</footer>
	);
}
