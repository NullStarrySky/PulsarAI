import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const macroHighlightPluginKey = new PluginKey("pulsarMacroHighlight");

const macroRegex = /\{\{\s*([\s\S]*?)\s*\}\}|\[\[\s*([\s\S]*?)\s*\]\]/g;

function getMacroDecorations(doc: ProseNode): DecorationSet {
	const decorations: Decoration[] = [];

	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;

		macroRegex.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = macroRegex.exec(node.text)) !== null) {
			const start = pos + match.index;
			const end = start + match[0].length;
			const isExpression = match[1] !== undefined;

			decorations.push(
				Decoration.inline(start, end, {
					class: isExpression
						? "pulsar-macro-expression"
						: "pulsar-macro-reference",
				}),
			);
		}
	});

	return DecorationSet.create(doc, decorations);
}

export const conversationMacroHighlightPlugin = $prose(() => {
	return new Plugin({
		key: macroHighlightPluginKey,
		state: {
			init(_, { doc }) {
				return getMacroDecorations(doc);
			},
			apply(tr, oldDecorations) {
				if (!tr.docChanged) return oldDecorations;
				return getMacroDecorations(tr.doc);
			},
		},
		props: {
			decorations(state) {
				return macroHighlightPluginKey.getState(state) ?? DecorationSet.empty;
			},
		},
	});
});
