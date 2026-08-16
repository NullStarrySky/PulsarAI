<script setup lang="ts">
import ConversationMarkstream from "@/features/Resources/Conversation/stage/ConversationMarkstream.vue";
import type { ConversationMarkdownSelection } from "@/features/Resources/Conversation/stage/ConversationMarkstream.vue";

export type { ConversationMarkdownSelection };

const props = withDefaults(
  defineProps<{
    modelValue: string;
    compact?: boolean;
    pluginId?: string;
    mode?: "chat" | "docs";
  }>(),
  {
    modelValue: "",
    compact: false,
    pluginId: "",
    mode: undefined,
  },
);

const emit = defineEmits<{
  annotate: [selection: ConversationMarkdownSelection];
}>();
</script>

<template>
  <ConversationMarkstream
    :model-value="props.modelValue"
    :compact="props.compact"
    :plugin-id="props.pluginId"
    :mode="props.mode"
    @annotate="emit('annotate', $event)"
  />
</template>
