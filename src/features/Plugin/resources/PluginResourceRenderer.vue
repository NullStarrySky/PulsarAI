<script setup lang="ts">
import { computed } from "vue";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Plugin/editors/javascript/JavaScriptCodeMirrorEditor.vue";
import { Image } from "@/components/ui/image";
import { pluginMediaSource, pluginMediaType } from "@/features/Plugin/editors/media/plugin-media";
import PluginChatEditor from "@/features/Plugin/editors/chat/PluginChatEditor.vue";
import PluginConfigEditor from "@/features/Plugin/editors/config/PluginConfigEditor.vue";
import PluginDataEditor from "@/features/Plugin/editors/data/PluginDataEditor.vue";
import PluginRegexEditor from "@/features/Plugin/editors/regex/PluginRegexEditor.vue";
import PluginSlotEditor from "@/features/Plugin/editors/slot/PluginSlotEditor.vue";
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
    <PluginConfigEditor v-else-if="file.path === 'config.json' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginDataEditor v-else-if="type === 'data' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginSlotEditor v-else-if="file.path === 'slots.json' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginRegexEditor v-else-if="(file.path === 'regex.json' || file.path.endsWith('.regex.json')) && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginChatEditor v-else-if="type === 'chat' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
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
