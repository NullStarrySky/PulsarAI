<script setup lang="ts">
import {
	autocompletion,
	type CompletionContext,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { vue } from "@codemirror/lang-vue";
import { EditorState, type Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
	oneDarkPro,
	oneDarkProColors,
} from "@/features/Plugin/editors/javascript/one-dark-pro-theme";

const props = withDefaults(
	defineProps<{
		modelValue: string;
		language?: "javascript" | "json" | "markdown" | "vue";
		frameless?: boolean;
		readonly?: boolean;
		importSuggestions?: Array<{
			label: string;
			apply: string;
			detail?: string;
			description?: string;
		}>;
	}>(),
	{
		language: "javascript",
		frameless: false,
		readonly: false,
		importSuggestions: () => [],
	},
);

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const editorRoot = ref<HTMLDivElement | null>(null);
const editorView = ref<EditorView | null>(null);

function pluginSyntaxDecorations() {
	const makeDecorations = (view: EditorView) => {
		const ranges: Range<Decoration>[] = [];
		for (const visible of view.visibleRanges) {
			const source = view.state.doc.sliceString(visible.from, visible.to);
			for (const match of source.matchAll(
				/\bimports(?:\s*\.\s*[A-Za-z_$][\w$]*){1,3}\s*\([^\r\n]*?\)|\{\{[\s\S]*?\}\}|\[\[[\s\S]*?\]\]/g,
			)) {
				if (match.index == null) continue;
				const token = match[0];
				const className = token.startsWith("imports")
					? "cm-plugin-import"
					: token.startsWith("{{")
						? "cm-plugin-expression"
						: "cm-plugin-chat";
				ranges.push(
					Decoration.mark({ class: className }).range(
						visible.from + match.index,
						visible.from + match.index + token.length,
					),
				);
			}
		}
		return Decoration.set(ranges, true);
	};
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = makeDecorations(view);
			}
			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = makeDecorations(update.view);
				}
			}
		},
		{ decorations: (instance) => instance.decorations },
	);
}

function pluginSyntaxCompletions(context: CompletionContext) {
	const importCall = context.matchBefore(
		/\b(?:imports|slot)(?:\s*\.\s*[A-Za-z_$][\w$]*){0,2}(?:\s*\(\s*["'][^"'\r\n]*)?$/,
	);
	if (importCall) {
		return {
			from: importCall.from,
			options: [
				{
					label: "imports(path)",
					apply: 'imports("./resource.md")',
					detail: "按资源类型包装并返回内容",
					type: "function",
				},
				{
					label: "slot.import(name)",
					apply: 'slot.import("slot 名")',
					detail: "获取 slot 资源路径数组（paths 的别名）",
					type: "function",
				},
				{
					label: "slot.paths(name)",
					apply: 'slot.paths("slot 名")',
					detail: "获取 slot 资源路径数组，供 imports(path) 使用",
					type: "function",
				},
				...(props.importSuggestions ?? []).map((item) => ({
					label: item.label,
					apply: item.apply,
					detail: item.detail,
					info: item.description,
					type: "variable",
				})),
			],
		};
	}
	const before = context.matchBefore(/(?:\{\{|\[\[)[^\]}\r\n]*$/);
	if (!before) return null;
	return {
		from: before.from,
		options: before.text.startsWith("{{")
			? [{ label: "{{  }}", detail: "Sandbox 表达式" }]
			: [{ label: "[[chat]]", detail: "当前会话消息" }],
	};
}

onMounted(() => {
	if (!editorRoot.value) return;
	editorView.value = new EditorView({
		doc: props.modelValue,
		parent: editorRoot.value,
		extensions: [
			basicSetup,
			...(props.language === "json"
				? [json()]
				: props.language === "javascript"
					? [javascript()]
					: props.language === "vue"
						? [vue()]
						: []),
			...(props.language === "markdown" || props.language === "javascript"
				? [
						pluginSyntaxDecorations(),
						autocompletion({
							override: [pluginSyntaxCompletions],
							activateOnTyping: true,
						}),
					]
				: []),
			oneDarkPro,
			EditorState.readOnly.of(Boolean(props.readonly)),
			EditorView.editable.of(!props.readonly),
			EditorView.lineWrapping,
			EditorView.updateListener.of((update) => {
				if (!update.docChanged) return;
				emit("update:modelValue", update.state.doc.toString());
			}),
			EditorView.theme({
				"&": {
					height: "100%",
					backgroundColor: oneDarkProColors.background,
					border: props.frameless ? "0" : "1px solid hsl(var(--border))",
					borderRadius: props.frameless ? "0" : "0.375rem",
					fontSize: "0.875rem",
				},
				".cm-scroller": {
					fontFamily: "var(--font-code)",
					fontFeatureSettings: '"calt" 1, "liga" 1, "zero" 1',
					fontVariantLigatures: "common-ligatures contextual",
					fontVariantNumeric: "tabular-nums slashed-zero",
				},
				".cm-content": {
					minHeight: "100%",
					padding: "0.75rem",
				},
				".cm-gutters": {
					backgroundColor: oneDarkProColors.background,
					borderRight: props.frameless
						? "0"
						: `1px solid ${oneDarkProColors.activeLine}`,
				},
				"&.cm-focused": {
					outline: props.frameless ? "0" : "1px solid hsl(var(--ring))",
				},
				".cm-plugin-import": {
					color: "hsl(var(--primary))",
					backgroundColor:
						"color-mix(in srgb, hsl(var(--primary)) 14%, transparent)",
					borderRadius: "0.25rem",
				},
				".cm-plugin-expression": {
					color: "#c084fc",
					backgroundColor: "rgb(192 132 252 / 0.12)",
				},
				".cm-plugin-chat": {
					color: "#38bdf8",
					backgroundColor: "rgb(56 189 248 / 0.12)",
				},
			}),
		],
	});
});

onBeforeUnmount(() => {
	editorView.value?.destroy();
	editorView.value = null;
});

watch(
	() => props.modelValue,
	(value) => {
		const view = editorView.value;
		if (!view || value === view.state.doc.toString()) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: value },
		});
	},
);
</script>

<template>
  <div ref="editorRoot" class="h-full min-h-0" />
</template>
