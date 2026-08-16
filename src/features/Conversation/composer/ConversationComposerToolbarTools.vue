<script setup lang="ts">
import { GitFork, Maximize2 } from "lucide-vue-next";
import { push } from "notivue";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { useDefaultConfigStore } from "@/features/defaultConfigs/default-config-store";
import ModelSelect from "@/features/ModelConnection/components/ModelSelect.vue";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import {
	type PluginManifestFixedSetting,
	type PluginManifestValue,
	parsePluginManifest,
	pluginManifestFixedValue,
	setPluginManifestFixedValue,
} from "@/features/Plugin/editors/manifest/plugin-manifest";
import {
	findPluginNodeByPath,
	pluginConventions,
} from "@/features/Plugin/tree/plugin-types";
import type { ComposerToolId } from "@/features/Conversation/composer/composer-toolbar";

defineProps<{
	toolIds: ComposerToolId[];
	prompt?: string;
}>();

const emit = defineEmits<{
	attach: [];
	whiteboard: [];
	map: [];
	fullscreen: [];
	"update:prompt": [value: string];
}>();

const defaults = useDefaultConfigStore();
const conversation = useConversationStore();
const pluginStore = usePluginStore();

const mainPlugin = computed(
	() =>
		pluginStore.sortedPlugins.find(
			(plugin) => plugin.id === conversation.activePackage?.mainPluginId,
		) ?? null,
);
const mainManifestFile = computed(() => {
	const plugin = mainPlugin.value;
	if (!plugin) return null;
	const file = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
	return file?.kind === "file" ? file : null;
});

function fixedValue(setting: PluginManifestFixedSetting) {
	const file = mainManifestFile.value;
	if (!file) return null;
	const parsed = parsePluginManifest(file.content);
	return parsed.diagnostics.length
		? null
		: pluginManifestFixedValue(parsed.manifest, setting);
}

const selectedModel = computed(() => {
	const value = fixedValue("model");
	return typeof value === "string" && value.trim()
		? value.trim()
		: defaults.defaultChatModel;
});

async function updateFixedSetting(
	setting: PluginManifestFixedSetting,
	value: PluginManifestValue,
) {
	const plugin = mainPlugin.value;
	const file = mainManifestFile.value;
	if (!plugin || !file) {
		push.error("主要插件缺少 manifest.json");
		return;
	}
	const parsed = parsePluginManifest(file.content);
	if (parsed.diagnostics.length) {
		push.error(`manifest.json 无效：${parsed.diagnostics[0]!.message}`);
		return;
	}
	setPluginManifestFixedValue(parsed.manifest, setting, value);
	await pluginStore.updateNode(plugin.id, file.id, {
		content: parsed.manifest,
	});
}
</script>

<template>
  <template v-for="toolId in toolIds" :key="toolId">
    <ModelSelect
      v-if="toolId === 'model'"
      :model-value="selectedModel"
      button-class="h-8 max-w-[min(18rem,46vw)] justify-between rounded-lg border-0 bg-muted/65 px-2.5 text-xs shadow-none mobile:h-10"
      @update:model-value="updateFixedSetting('model', $event)"
    />
    <Button
      v-else-if="toolId === 'map'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10 rounded-lg"
      title="会话地图"
      @click="emit('map')"
    >
      <GitFork class="size-4" />
    </Button>
    <Button
      v-else-if="toolId === 'fullscreen'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10 rounded-lg"
      title="全屏输入"
      @click="emit('fullscreen')"
    >
      <Maximize2 class="size-4" />
    </Button>
  </template>
</template>
