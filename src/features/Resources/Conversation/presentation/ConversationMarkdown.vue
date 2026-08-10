<script setup lang="ts">
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/vue";
import { defineComponent, h, ref, watch } from "vue";
import { editorViewOptionsCtx } from "@milkdown/core";
import { conversationCrepeFeatures } from "./conversation-crepe";

const readOnlyCrepeFeatures = {
  ...conversationCrepeFeatures,
  [CrepeFeature.AI]: false,
  [CrepeFeature.Cursor]: false,
  [CrepeFeature.LinkTooltip]: false,
  [CrepeFeature.Placeholder]: false,
  [CrepeFeature.Toolbar]: false,
};

const props = withDefaults(
  defineProps<{ modelValue: string; compact?: boolean }>(),
  {
    modelValue: "",
    compact: false,
  },
);

const MarkdownInner = defineComponent({
  name: "ConversationMarkdownInner",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  setup(innerProps) {
    const currentMarkdown = ref(innerProps.modelValue);
    let applyingExternalValue = false;
    let pendingExternalValue = false;
    const { loading, get } = useEditor((root) => {
      const editor = new Crepe({
        root,
        defaultValue: innerProps.modelValue,
        features: readOnlyCrepeFeatures,
      });
      editor.editor.config((ctx: any) => {
        ctx.set(editorViewOptionsCtx, {
          editable: () => false,
        });
      });
      editor.on((listener) => {
        listener.markdownUpdated((_ctx, nextMarkdown, previousMarkdown) => {
          if (applyingExternalValue || nextMarkdown === previousMarkdown) {
            return;
          }
          currentMarkdown.value = nextMarkdown;
        });
      });
      return editor;
    });

    function replaceMarkdown(markdown: string) {
      const editor = get();
      if (!editor || loading.value) {
        pendingExternalValue = true;
        return;
      }
      applyingExternalValue = true;
      try {
        editor.action(replaceAll(markdown, true));
      } finally {
        applyingExternalValue = false;
        pendingExternalValue = false;
      }
    }

    watch(
      () => innerProps.modelValue,
      (markdown) => {
        if (markdown === currentMarkdown.value) {
          return;
        }
        currentMarkdown.value = markdown;
        replaceMarkdown(markdown);
      },
    );

    watch(loading, (isLoading) => {
      if (!isLoading && pendingExternalValue) {
        replaceMarkdown(currentMarkdown.value);
      }
    });

    return () => h(Milkdown);
  },
});
</script>

<template>
  <MilkdownProvider>
    <div
      class="conversation-markdown"
      :class="{ 'conversation-markdown--compact': props.compact }"
    >
      <MarkdownInner :model-value="props.modelValue" />
    </div>
  </MilkdownProvider>
</template>

<style>
.conversation-markdown :where(.milkdown, .editor, .ProseMirror) {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  max-width: 100%;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  overflow: visible !important;
  padding: 0 !important;
}

.conversation-markdown .ProseMirror {
  color: inherit;
  font-size: var(--editor-font-size, 14px) !important;
  line-height: var(--editor-line-height, 16px) !important;
  overflow-wrap: anywhere;
  padding: 0 0.35rem !important;
}

.conversation-markdown--compact .ProseMirror {
  padding: 0 !important;
}

.conversation-markdown .ProseMirror > * {
  margin-top: 0.28rem;
  margin-bottom: 0.28rem;
}

.conversation-markdown .ProseMirror > :first-child {
  margin-top: 0;
}

.conversation-markdown .ProseMirror > :last-child {
  margin-bottom: 0;
}

.conversation-markdown code {
  border-radius: 4px;
  background: var(--muted);
  padding: 0.1rem 0.25rem;
}

.conversation-markdown pre {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 6px;
  background: color-mix(in srgb, var(--foreground), transparent 88%);
  padding: 0.65rem 0.8rem;
}

.conversation-markdown blockquote {
  border-left: 3px solid var(--border);
  color: var(--muted-foreground);
  padding-left: 0.85rem;
}
</style>
