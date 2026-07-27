<script setup lang="ts">
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  language?: "javascript" | "json";
  frameless?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorRoot = ref<HTMLDivElement | null>(null);
const editorView = ref<EditorView | null>(null);

onMounted(() => {
  if (!editorRoot.value) return;
  editorView.value = new EditorView({
    doc: props.modelValue,
    parent: editorRoot.value,
    extensions: [
      basicSetup,
      props.language === "json" ? json() : javascript(),
      oneDark,
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
