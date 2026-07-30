<script setup lang="ts">
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { EditorState, type Range } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  language?: "javascript" | "json" | "markdown" | "vue";
  frameless?: boolean;
  readonly?: boolean;
  referenceSuggestions?: Array<{
    target: string;
    label: string;
    detail?: string;
    description?: string;
  }>;
}>();

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
      for (
        const match of source.matchAll(
          /<@[^>\r\n]+>|\{\{[\s\S]*?\}\}|\[\[[\s\S]*?\]\]/g,
        )
      ) {
        if (match.index == null) continue;
        const token = match[0];
        const className = token.startsWith("<@")
          ? "cm-plugin-reference"
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
  const before = context.matchBefore(/(?:<@|\{\{|\[\[)[^>\]}\r\n]*$/);
  if (!before) return null;
  if (before.text.startsWith("<@")) {
    return {
      from: before.from,
      options: (props.referenceSuggestions ?? []).map((item) => ({
        label: `<@${item.target}>`,
        displayLabel: item.label,
        detail: item.detail,
        info: item.description,
        type: "variable",
      })),
    };
  }
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
          : []),
      ...(props.language === "markdown"
        ? [
            pluginSyntaxDecorations(),
            autocompletion({
              override: [pluginSyntaxCompletions],
              activateOnTyping: true,
            }),
          ]
        : []),
      oneDark,
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
          backgroundColor: props.frameless ? "transparent" : "hsl(var(--background))",
          border: props.frameless ? "0" : "1px solid hsl(var(--border))",
          borderRadius: props.frameless ? "0" : "0.375rem",
          fontSize: "0.875rem",
        },
        ".cm-scroller": {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        },
        ".cm-content": {
          minHeight: "100%",
          padding: "0.75rem",
        },
        ".cm-gutters": {
          backgroundColor: props.frameless ? "transparent" : "hsl(var(--card))",
          borderRight: props.frameless ? "0" : "1px solid hsl(var(--border))",
        },
        "&.cm-focused": {
          outline: props.frameless ? "0" : "1px solid hsl(var(--ring))",
        },
        ".cm-plugin-reference": {
          color: "hsl(var(--primary))",
          backgroundColor: "color-mix(in srgb, hsl(var(--primary)) 14%, transparent)",
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
