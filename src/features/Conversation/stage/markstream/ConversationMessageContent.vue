<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Code2, Eye } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  buildInteractiveCodeDocument,
  splitInteractiveCodeBlocks,
} from "@/features/Conversation/messages/message-code-preview";
import ConversationMarkdown from "./ConversationMarkdown.vue";
import type { ConversationMarkdownSelection } from "./ConversationMarkdown.vue";

const props = withDefaults(defineProps<{
  content: string;
  pluginId?: string;
  interactivePreviewEnabled?: boolean;
  replaceWithPreview?: boolean;
  compact?: boolean;
  mode?: "chat" | "docs";
}>(), {
  interactivePreviewEnabled: false,
  replaceWithPreview: false,
  compact: false,
  mode: undefined,
});
const emit = defineEmits<{
  annotate: [selection: ConversationMarkdownSelection];
}>();

const showSource = ref(false);
const segments = computed(() => splitInteractiveCodeBlocks(props.content));
const interactiveSegments = computed(() =>
  props.interactivePreviewEnabled
    ? segments.value.filter((segment) => segment.type === "interactive-code")
    : [],
);

watch(
  () => props.content,
  () => {
    showSource.value = false;
  },
);
</script>

<template>
  <div
    v-if="interactiveSegments.length"
    class="flex min-w-0 flex-col gap-3"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Eye />
        交互预览
      </span>
      <Button
        size="sm"
        variant="ghost"
        class="h-7"
        @click="showSource = !showSource"
      >
        <Eye v-if="showSource" data-icon="inline-start" />
        <Code2 v-else data-icon="inline-start" />
        {{ showSource ? "返回预览" : "查看源码" }}
      </Button>
    </div>

    <ConversationMarkdown
      v-if="showSource"
      :model-value="props.content"
      :plugin-id="props.pluginId"
      :compact="props.compact"
      :mode="props.mode"
      @annotate="emit('annotate', $event)"
    />

    <template v-else-if="props.replaceWithPreview">
      <iframe
        v-for="(segment, index) in interactiveSegments"
        :key="index"
        :srcdoc="buildInteractiveCodeDocument(segment.content)"
        :title="`交互式代码预览 ${index + 1}`"
        class="h-[min(60vh,36rem)] w-full rounded-md border bg-background"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        allow="clipboard-read; clipboard-write"
        referrerpolicy="no-referrer"
      />
    </template>

    <template v-else>
      <template v-for="(segment, index) in segments" :key="index">
        <ConversationMarkdown
          v-if="segment.type === 'markdown' && segment.content"
          :model-value="segment.content"
          :plugin-id="props.pluginId"
          :compact="props.compact"
          :mode="props.mode"
          @annotate="emit('annotate', $event)"
        />
        <iframe
          v-else-if="segment.type === 'interactive-code'"
          :srcdoc="buildInteractiveCodeDocument(segment.content)"
          :title="`交互式代码预览 ${index + 1}`"
          class="h-80 w-full rounded-md border bg-background"
          loading="lazy"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          allow="clipboard-read; clipboard-write"
          referrerpolicy="no-referrer"
        />
      </template>
    </template>
  </div>

  <ConversationMarkdown
    v-else
    :model-value="props.content"
    :plugin-id="props.pluginId"
    :compact="props.compact"
    :mode="props.mode"
    @annotate="emit('annotate', $event)"
  />
</template>
