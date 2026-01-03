import { cn } from "@frontend/lib/utils";
import { Song, templateHelpers, ChordLyricsPair, Tag, CHORUS } from "chordsheetjs";

function isItemChordLyricsPair(item: any): item is ChordLyricsPair {
	return templateHelpers.isChordLyricsPair(item);
}

function isItemTag(item: any): item is Tag {
	return templateHelpers.isTag(item);
}

export function SongPreview({ song }: { song: Song }) {
	console.log(song.paragraphs)

	let lastChorusContent: React.ReactNode = null;

	const title = [song.artist, song.title].filter(Boolean).join(' – ')

	return <div>
		{title && <h1>{title}</h1>}
		{song.capo && <p>Capo: {song.capo}</p>}
		{song.paragraphs.map((paragraph, paragraphIndex) => {
			console.log(paragraphIndex, paragraph)

			const isChorus = paragraph.type === CHORUS;

			const content = (
				<div key={paragraphIndex} className={cn("my-2 flex flex-col", isChorus && 'border-l-2 border-l-primary pl-2')}>
					{paragraph.lines.map((line, lineIndex) => (
						<div className='grid auto-cols-min grid-rows-[repeat(2,min-content)] grid-flow-col-dense' key={lineIndex}>
							{line.items.map((item, index) => {
								if (isItemChordLyricsPair(item)) {
									return (
										<div key={index} className="row-span-2 grid grid-rows-subgrid">
											{item.chords && <div className="row-start-1 text-red-300/50 font-bold leading-none">{item.chords}</div>}
											{item.lyrics && <div className="row-start-2 whitespace-pre">{item.lyrics}</div>}
										</div>
									);
								}

								if (isItemTag(item) && item.isRenderable()) {
									return <div key={index} className="text-zinc-400 align-self-end">{item.hasRenderableLabel() ? item.label : item.value}</div>;
								}

								return <div key={index} className="outline outline-yellow-700">{item.toString()}</div>;
							})}
						</div>
					))}
				</div>
			);

			if (isChorus) {
				lastChorusContent = content;
			}

			return content
		})}
	</div>;
}
