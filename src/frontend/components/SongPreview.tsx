import { cn } from "@frontend/lib/utils";
import {
	CHORUS,
	type ChordLyricsPair,
	type Song,
	type Tag,
	templateHelpers,
} from "chordsheetjs";

type Item = Song["paragraphs"][number]["lines"][number]["items"][number];

function isItemChordLyricsPair(item: Item): item is ChordLyricsPair {
	return templateHelpers.isChordLyricsPair(item);
}

function isItemTag(item: Item): item is Tag {
	return templateHelpers.isTag(item);
}

export function SongPreview({ song }: { song: Song }) {
	console.log(song.paragraphs);

	let _lastChorusContent: React.ReactNode = null;

	const title = [song.artist, song.title].filter(Boolean).join(" – ");

	return (
		<div>
			{title && <h1>{title}</h1>}
			{song.capo && <p>Capo: {song.capo}</p>}
			{song.paragraphs.map((paragraph, paragraphIndex) => {
				console.log(paragraphIndex, paragraph);

				const isChorus = paragraph.type === CHORUS;

				const content = (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: there's no other way
						key={paragraphIndex}
						className={cn(
							"my-2 flex flex-col",
							isChorus && "border-l-2 border-l-primary pl-2",
						)}
					>
						{paragraph.lines.map((line, lineIndex) => (
							<div
								className="grid auto-cols-min grid-rows-[repeat(2,min-content)] grid-flow-col-dense"
								// biome-ignore lint/suspicious/noArrayIndexKey: there's no other way
								key={lineIndex}
							>
								{line.items.map((item, index) => {
									if (isItemChordLyricsPair(item)) {
										return (
											<div
												// biome-ignore lint/suspicious/noArrayIndexKey: there's no other way
												key={index}
												className="row-span-2 grid grid-rows-subgrid"
											>
												{item.chords && (
													<div className="row-start-1 text-red-300/50 font-bold leading-none">
														{item.chords}
													</div>
												)}
												{item.lyrics && (
													<div className="row-start-2 whitespace-pre">
														{item.lyrics}
													</div>
												)}
											</div>
										);
									}

									if (isItemTag(item) && item.isRenderable()) {
										return (
											// biome-ignore lint/suspicious/noArrayIndexKey: there's no other way
											<div key={index} className="text-zinc-400 align-self-end">
												{item.hasRenderableLabel() ? item.label : item.value}
											</div>
										);
									}

									return (
										// biome-ignore lint/suspicious/noArrayIndexKey: there's no other way
										<div key={index} className="outline outline-yellow-700">
											{item.toString()}
										</div>
									);
								})}
							</div>
						))}
					</div>
				);

				if (isChorus) {
					_lastChorusContent = content;
				}

				return content;
			})}
		</div>
	);
}
