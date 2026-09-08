<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Image } from "@/components/ui/image";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import PluginChatEditor from "@/features/Plugin/editors/chat/PluginChatEditor.vue";
import PluginConfigEditor from "@/features/Plugin/editors/config/PluginConfigEditor.vue";
import PluginDataEditor from "@/features/Plugin/editors/data/PluginDataEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Plugin/editors/javascript/JavaScriptCodeMirrorEditor.vue";
import {
	pluginMediaSource,
	pluginMediaType,
} from "@/features/Plugin/editors/media/plugin-media";
import { resolveMediaUrl } from "@/features/Media/media-link";
import PluginRegexEditor from "@/features/Plugin/editors/regex/PluginRegexEditor.vue";
import StWorldbookRenderer from "@/features/Migrations/SillyTavern/renderers/StWorldbookRenderer.vue";
import StPresetRenderer from "@/features/Migrations/SillyTavern/renderers/StPresetRenderer.vue";
import PluginTypeRenderer from "./PluginTypeRenderer.vue";
import type { WorldFileNode } from "@/features/Plugin/tree/world-types";
import { resourceType } from "./resource-types";

const props = defineProps<{
	file: WorldFileNode;
	path?: string;
	modelValue: string;
	preview: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const type = computed(() => resourceType(props.file));
const mediaSource = computed(() => pluginMediaSource(props.file.content));
const resolvedMediaSource = ref("");
watch(
	mediaSource,
	async (source) => {
		resolvedMediaSource.value = source ? await resolveMediaUrl(source) : "";
	},
	{ immediate: true },
);
const mediaKind = computed(() =>
	pluginMediaType(props.file.content, mediaSource.value),
);
const codeLanguage = computed<"javascript" | "json" | "markdown" | "vue" | "text">(() => {
	if (type.value === "javascript") return "javascript";
	if (type.value === "markdown") return "markdown";
	if (type.value === "component") return "vue";
	if (type.value === "json" || props.file.name.endsWith(".json")) return "json";
	return "text";
});

const parsedJson = computed(() => {
	if (!props.file.name.endsWith(".json")) return null;
	try {
		const text = typeof props.modelValue === "string" ? props.modelValue : JSON.stringify(props.modelValue);
		return JSON.parse(text);
	} catch {
		return null;
	}
});

const isWorldbook = computed(() => {
	const obj = parsedJson.value;
	return Boolean(obj && typeof obj === "object" && "entries" in obj);
});

const isPreset = computed(() => {
	const obj = parsedJson.value;
	return Boolean(obj && typeof obj === "object" && ("prompts" in obj || "prompt_order" in obj));
});
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden">
    <ConversationComposerEditor
      v-if="type === 'markdown' && preview"
      :model-value="modelValue"
      placeholder="输入 Markdown 内容"
      :enable-ai="false"
      :submit-on-enter="false"
      full-height
      class="h-full"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <StWorldbookRenderer
      v-else-if="isWorldbook && preview"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <StPresetRenderer
      v-else-if="isPreset && preview"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <PluginConfigEditor v-else-if="path?.endsWith('/config.json') && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginTypeRenderer
      v-else-if="type === 'component' && preview"
      :file="file"
      :path="path"
      :source="typeof modelValue === 'string' ? modelValue : ''"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <PluginDataEditor v-else-if="type === 'data' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginRegexEditor v-else-if="(path?.endsWith('/regex.json') || path?.endsWith('.regex.json')) && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginChatEditor v-else-if="type === 'chat' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <div v-else-if="type === 'media'" class="flex h-full items-center justify-center bg-muted/20 p-4">
      <video v-if="mediaKind === 'video'" :src="resolvedMediaSource" controls class="max-h-full max-w-full rounded-lg" />
      <audio v-else-if="mediaKind === 'audio'" :src="resolvedMediaSource" controls />
      <Image v-else :src="resolvedMediaSource" :alt="file.name" :preview="false" object-fit="contain" class="max-h-full max-w-full" />
    </div>
    <JavaScriptCodeMirrorEditor
      v-else :model-value="modelValue" :language="codeLanguage" frameless
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
