import { ChordPro } from "@chordbook/codemirror-lang-chordpro";
import CodeMirror from "@uiw/react-codemirror";

const chordProLanguage = ChordPro();

type Props = { content: string; onChange: (content: string) => void };

export function SongEditor({ content, onChange }: Props) {
	return (
		<CodeMirror
			value={content}
			onChange={onChange}
			extensions={[chordProLanguage]}
			theme="dark"
		/>
	);
}
