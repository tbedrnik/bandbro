import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChordProParser, Song } from 'chordsheetjs';
import { ScrollArea } from '@frontend/components/ui/scroll-area';
import { SongPreview } from '@frontend/components/SongPreview';
import { SongEditor } from '@frontend/components/SongEditor';

export const Route = createFileRoute('/_protected/song/$slug')({
	component: RouteComponent,
})

function RouteComponent() {
	const [content, setContent] = useState(EXAMPLE)

	const { song, error } = useMemo(() => {
		try {
			const song = new ChordProParser().parse(content, { /** chopFirstWord: false // wait for pr to be merged */ });
			return { song, error: null }
		} catch (error) {
			return { song: null, error }
		}
	}, [content])

	return <div className='grid grid-cols-2 gap-4 p-4 h-dvh'>
		<div className='h-full overflow-hidden'>
			<ScrollArea className="h-full">
				<SongEditor content={content} onChange={setContent} />
			</ScrollArea>
		</div>
		<div className='h-full overflow-hidden'>
			<ScrollArea className="h-full">
				{error ? <div className="text-red-500">{error instanceof Error ? error.message : String(error)}</div> : null}
				{song ? <SongPreview song={song} /> : null}
			</ScrollArea>
		</div>
	</div>
}

const EXAMPLE = `{title:Let It Be}
{artist:The Beatles}

Wh[G]en I find myself in t[D]imes of trouble,
Mo[Em]ther Mary c[C]omes to me,
Sp[G]eaking words of w[D]isdom, let it [C]be.[G]
And in my hour of da[D]rkness,
She is st[Em]anding right in f[C]ront of me,
Sp[G]eaking words of w[D]isdom, let it [C]be.[G]

{start_of_chorus}
Let it [Em]be, let it [Bm]be, let it [C]be, let it [G]be.
Whisper words of wis[D]dom, let it [C]be.[G]
{end_of_chorus}

And when the broken hearted people
Living in the world agree,
There will be no answer, let it be.
But though there may be parting,
There is still a chance that they will see,
There will be an answer, let it be.

{chorus}

And when the night is cloudy,
There is still a light that shines on me,
Shine until tomorrow, let it be.
I wake up to the sound of music,
Mother Mary comes to me,
Whisper words of wisdom, let it be.

{chorus}
`