<script setup lang="ts">
import { computed } from "vue";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Plugin/editors/javascript/JavaScriptCodeMirrorEditor.vue";
import { Image } from "@/components/ui/image";
import { pluginMediaSource, pluginMediaType } from "@/features/Plugin/editors/media/plugin-media";
import { resourceType } from "./resource-types";
import type { PluginFile } from "@/features/Plugin/tree/plugin-types";

const props = defineProps<{ file: PluginFile; modelValue: string; preview: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const type = computed(() => resourceType(props.file));
const mediaSource = computed(() => pluginMediaSource(props.file.content));
const mediaKind = computed(() => pluginMediaType(props.file.content, mediaSource.value));
const codeLanguage = computed(() => type.value === "javascript" ? "javascript" : type.value === "markdown" ? "markdown" : "json");
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden">
    <ConversationComposerEditor
      v-if="type === 'markdown' && preview"
      :model-value="modelValue" placeholder="输入 Markdown 内容" enable-block-edit :enable-ai="false" :submit-on-enter="false"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div v-else-if="type === 'chat' && preview" class="h-full overflow-auto p-4">
      <p class="mb-3 text-xs text-muted-foreground">角色消息资源。可在源码视图编辑 JSON；导入时会展开宏并忽略 enabled: false 的消息。</p>
      <pre class="whitespace-pre-wrap font-mono text-xs">{{ modelValue }}</pre>
    </div>
    <div v-else-if="type === 'media'" class="flex h-full items-center justify-center bg-muted/20 p-4">
      <video v-if="mediaKind === 'video'" :src="mediaSource" controls class="max-h-full max-w-full rounded-lg" />
      <Image v-else :src="mediaSource" :alt="file.name" :preview="false" object-fit="contain" class="max-h-full max-w-full" />
    </div>
    <JavaScriptCodeMirrorEditor
      v-else :model-value="modelValue" :language="codeLanguage" frameless
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
