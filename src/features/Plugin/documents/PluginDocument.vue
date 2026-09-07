<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/fluid";
import ConversationMarkdown from "@/features/Conversation/stage/markstream/ConversationMarkdown.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFile } from "../runtime/file-composables";
import { openFile } from "../tree/file-editor-manager";

const props = defineProps<{ path: string; localPluginId: string; conversationId?: string }>();
const source = useFile(computed(() => props.path));
const markdown = computed(() => typeof source.file.value?.content === "string" ? source.file.value.content : "");
function edit() {
	if (source.file.value) openFile(source.file.value, props.path, props.localPluginId, props.conversationId);
}
</script>

<template>
  <article class="flex min-h-0 flex-col rounded-xl border bg-card">
    <div class="flex items-center justify-between border-b px-4 py-2"><span class="truncate text-sm font-medium">{{ source.file.value?.name }}</span><Button size="sm" variant="outline" @click="edit">在文件编辑器中编辑</Button></div>
    <ScrollArea class="min-h-0 flex-1"><ConversationMarkdown :model-value="markdown" mode="docs" class="p-5" /></ScrollArea>
  </article>
</template>
