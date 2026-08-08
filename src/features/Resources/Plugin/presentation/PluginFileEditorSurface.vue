<script setup lang="ts">
import { computed } from "vue";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "../application/plugin-store";
import { createPluginReferenceResolver } from "../application/plugin-reference-resolver";
import { pluginMediaSource, pluginMediaType } from "../domain/plugin-media";
import {
  pluginConventions,
  pluginFileType,
  type Plugin,
  type PluginFile,
} from "../domain/plugin-types";
import JavaScriptCodeMirrorEditor from "./JavaScriptCodeMirrorEditor.vue";
import PluginChatEditor from "./PluginChatEditor.vue";
import PluginContainerDefinitionsEditor from "./PluginContainerDefinitionsEditor.vue";
import PluginManifestEditor from "./PluginManifestEditor.vue";
import PluginRegexEditor from "./PluginRegexEditor.vue";

const props = defineProps<{
  plugin: Plugin;
  file: PluginFile;
  path: string;
  modelValue: string;
  mode: "preview" | "source";
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const pluginStore = usePluginStore();
const conversation = useConversationStore();
const type = computed(() => pluginFileType(props.file.name));
const normalizedPath = computed(() => props.path.toLocaleLowerCase());
const isManifest = computed(() => normalizedPath.value === pluginConventions.manifest.toLocaleLowerCase());
const isContainers = computed(() => normalizedPath.value === pluginConventions.containers.toLocaleLowerCase());
const isRegex = computed(() => normalizedPath.value === pluginConventions.regex.toLocaleLowerCase());
const mediaSource = computed(() => pluginMediaSource(props.file.content));
const mediaKind = computed(() => pluginMediaType(props.file.content, mediaSource.value));
const visiblePlugins = computed(() => pluginStore.sortedPluginsForPackage(
  conversation.activePackageId,
  conversation.activePackage?.enabledGlobalPluginIds,
  conversation.activePackage?.mainPluginId,
));
const resolver = computed(() => createPluginReferenceResolver(
  visiblePlugins.value.some((item) => item.id === props.plugin.id)
    ? visiblePlugins.value
    : [props.plugin, ...visiblePlugins.value],
  {
    environment: {
      chat: [],
      CHAT: [],
      PROJECT_AGENT_PROMPT: "[PROJECT_AGENT_PROMPT]",
    },
    sourceOverrides: { [props.file.id]: props.modelValue },
  },
));
const containerDetails = computed(() => resolver.value.listContainers().flatMap((item) => {
  const detail = resolver.value.getContainer(item.id);
  return detail ? [detail] : [];
}));
const codeLanguage = computed(() => {
  if (type.value === "javascript") return "javascript";
  if (type.value === "component") return props.file.name.toLocaleLowerCase().endsWith(".vue") ? "vue" : "javascript";
  if (type.value === "markdown") return "markdown";
  if (["json", "data", "chat"].includes(type.value)) return "json";
  return "markdown";
});
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden bg-transparent">
    <PluginContainerDefinitionsEditor
      v-if="isContainers && mode === 'preview'"
      :model-value="modelValue"
      :definition-id="file.id"
      :container-details="containerDetails"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <PluginManifestEditor
      v-else-if="isManifest && mode === 'preview'"
      :model-value="modelValue"
      :plugin="plugin"
      :plugins="visiblePlugins"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <PluginRegexEditor
      v-else-if="isRegex && mode === 'preview'"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <PluginChatEditor
      v-else-if="type === 'chat' && mode === 'preview'"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div v-else-if="type === 'markdown' && mode === 'preview'" class="plugin-file-milkdown h-full min-h-0 overflow-hidden">
      <ConversationComposerEditor
        :model-value="modelValue"
        placeholder="输入 Markdown 内容"
        enable-block-edit
        enable-top-bar
        :enable-ai="false"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
    <div v-else-if="type === 'media'" class="flex h-full items-center justify-center bg-muted/20 p-4">
      <video v-if="mediaKind === 'video'" :src="mediaSource" controls class="max-h-full max-w-full rounded-lg" />
      <img v-else :src="mediaSource" :alt="file.name" class="max-h-full max-w-full rounded-lg object-contain" />
    </div>
    <JavaScriptCodeMirrorEditor
      v-else
      :model-value="modelValue"
      :language="codeLanguage"
      frameless
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.plugin-file-milkdown :deep(.conversation-composer-editor),
.plugin-file-milkdown :deep(.conversation-composer-editor > div),
.plugin-file-milkdown :deep(.milkdown) {
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  background: transparent !important;
}

.plugin-file-milkdown :deep(.milkdown) {
  display: flex;
  flex-direction: column;
}

.plugin-file-milkdown :deep(.milkdown .ProseMirror) {
  min-height: 0 !important;
  max-height: none !important;
  flex: 1 1 0;
  overflow-y: auto;
  padding: 1rem;
}
</style>
