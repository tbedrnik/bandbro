import { ChordPro } from "@chordbook/codemirror-lang-chordpro";
import { useDerivedTheme } from "@frontend/lib/theme";
import CodeMirror from "@uiw/react-codemirror";

const chordProLanguage = ChordPro();

type Props = { content: string; onChange: (content: string) => void };

export function SongEditor({ content, onChange }: Props) {
	const theme = useDerivedTheme();

	return (
		<CodeMirror
			value={content}
			onChange={onChange}
			extensions={[chordProLanguage]}
			theme={theme}
			className="h-full"
		/>
	);
}
