<script setup lang="ts">
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/vue";
import { defineComponent, h, ref, watch } from "vue";
import {
  conversationCrepeFeatureConfigs,
  conversationCrepeFeatures,
} from "@/features/Resources/Conversation/presentation/conversation-crepe";

const props = withDefaults(
  defineProps<{
    source: string;
    language?: string;
  }>(),
  {
    source: "",
    language: "vue",
  },
);

const PreviewInner = defineComponent({
  name: "ComponentResourcePreviewInner",
  props: {
    markdown: {
      type: String,
      default: "",
    },
  },
  setup(innerProps) {
    const currentMarkdown = ref(innerProps.markdown);
    const { loading, get } = useEditor((root) => {
      return new Crepe({
        root,
        defaultValue: innerProps.markdown,
        features: {
          ...conversationCrepeFeatures,
          [CrepeFeature.TopBar]: false,
          [CrepeFeature.AI]: false,
        },
        featureConfigs: conversationCrepeFeatureConfigs,
      });
    });

    function replaceMarkdown(markdown: string) {
      const editor = get();
      if (!editor || loading.value) return;
      editor.action(replaceAll(markdown, true));
    }

    watch(
      () => innerProps.markdown,
      (markdown) => {
        if (markdown === currentMarkdown.value) return;
        currentMarkdown.value = markdown;
        replaceMarkdown(markdown);
      },
    );

    watch(loading, (isLoading) => {
      if (!isLoading) replaceMarkdown(currentMarkdown.value);
    });

    return () => h(Milkdown);
  },
});

function fenceCode(source: string, language: string) {
  const fence = source.includes("```") ? "````" : "```";
  return `${fence}${language}\n${source}\n${fence}`;
}
</script>

<template>
  <MilkdownProvider>
    <div class="component-resource-preview h-full min-h-0 overflow-auto rounded-md border bg-background p-4">
      <PreviewInner :markdown="fenceCode(props.source, props.language)" />
    </div>
  </MilkdownProvider>
</template>

<style>
.component-resource-preview :where(.milkdown, .editor, .ProseMirror) {
  max-width: 100%;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
}

.component-resource-preview .ProseMirror {
  min-height: 0;
  color: var(--foreground);
  overflow-wrap: anywhere;
}

.component-resource-preview pre {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 6px;
  background: color-mix(in srgb, var(--foreground), transparent 91%);
  padding: 0.75rem;
}
</style>
