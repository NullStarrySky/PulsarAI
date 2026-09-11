import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// Adapted from Binaryify/OneDark-Pro (MIT) for CodeMirror's semantic tags.
export const oneDarkProColors = {
	background: "#282c34",
	panel: "#21252b",
	activeLine: "#2c313c",
	selection: "#67769660",
	foreground: "#abb2bf",
	muted: "#5c6370",
	lineNumber: "#495162",
	cursor: "#528bff",
	red: "#e06c75",
	green: "#98c379",
	yellow: "#e5c07b",
	blue: "#61afef",
	purple: "#c678dd",
	cyan: "#56b6c2",
	orange: "#d19a66",
} as const;

const c = oneDarkProColors;

const oneDarkProTheme = EditorView.theme(
	{
		"&": {
			color: c.foreground,
			backgroundColor: c.background,
		},
		".cm-content": { caretColor: c.cursor },
		".cm-cursor, .cm-dropCursor": { borderLeftColor: c.cursor },
		"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
			{
				backgroundColor: c.selection,
			},
		".cm-panels": { backgroundColor: c.panel, color: c.foreground },
		".cm-panels.cm-panels-top": { borderBottom: `1px solid ${c.activeLine}` },
		".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${c.activeLine}` },
		".cm-searchMatch": {
			backgroundColor: "#d19a6644",
			outline: "1px solid #ffffff5a",
		},
		".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ffffff22" },
		".cm-activeLine": { backgroundColor: c.activeLine },
		".cm-selectionMatch": { backgroundColor: "#ffd33d44" },
		"&.cm-focused .cm-matchingBracket": {
			backgroundColor: "#515a6b",
			outline: "1px solid #515a6b",
		},
		"&.cm-focused .cm-nonmatchingBracket": { color: c.red },
		".cm-gutters": {
			backgroundColor: c.background,
			color: c.lineNumber,
			border: "none",
		},
		".cm-activeLineGutter": {
			backgroundColor: c.activeLine,
			color: c.foreground,
		},
		".cm-foldPlaceholder": {
			backgroundColor: "transparent",
			border: "none",
			color: c.muted,
		},
		".cm-tooltip": {
			backgroundColor: c.panel,
			border: "1px solid #181a1f",
			color: c.foreground,
		},
		".cm-tooltip .cm-tooltip-arrow:before": {
			borderTopColor: "transparent",
			borderBottomColor: "transparent",
		},
		".cm-tooltip .cm-tooltip-arrow:after": {
			borderTopColor: c.panel,
			borderBottomColor: c.panel,
		},
		".cm-tooltip-autocomplete > ul > li[aria-selected]": {
			backgroundColor: c.activeLine,
			color: c.foreground,
		},
	},
	{ dark: true },
);

const oneDarkProHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: c.purple },
	{
		tag: [
			tags.name,
			tags.deleted,
			tags.character,
			tags.propertyName,
			tags.macroName,
		],
		color: c.red,
	},
	{ tag: [tags.function(tags.variableName), tags.labelName], color: c.blue },
	{
		tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
		color: c.orange,
	},
	{ tag: [tags.definition(tags.name), tags.separator], color: c.foreground },
	{
		tag: [
			tags.typeName,
			tags.className,
			tags.number,
			tags.changed,
			tags.annotation,
			tags.modifier,
			tags.self,
			tags.namespace,
		],
		color: c.yellow,
	},
	{
		tag: [
			tags.operator,
			tags.operatorKeyword,
			tags.url,
			tags.escape,
			tags.regexp,
			tags.link,
			tags.special(tags.string),
		],
		color: c.cyan,
	},
	{ tag: [tags.meta, tags.comment], color: c.muted, fontStyle: "italic" },
	{ tag: tags.strong, fontWeight: "700" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.link, color: c.muted, textDecoration: "underline" },
	{ tag: tags.heading, color: c.red, fontWeight: "700" },
	{
		tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
		color: c.orange,
	},
	{
		tag: [tags.processingInstruction, tags.string, tags.inserted],
		color: c.green,
	},
	{ tag: tags.invalid, color: "#ffffff", backgroundColor: c.red },
]);

export const oneDarkPro = [
	oneDarkProTheme,
	syntaxHighlighting(oneDarkProHighlightStyle),
];
